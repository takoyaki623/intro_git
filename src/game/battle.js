// バトルの進行。
//
// ジェネレータで書く。理由は入れ子の深さ:
//   メッセージ → A待ち → アニメ → HPバー → 経験値 → レベルアップ →
//   技を忘れるか確認（さらにメニュー） → 進化（Bでキャンセル可）
// これを手書きの状態機械でやると、継続を自前のスタックで持つ羽目になる。
// ジェネレータなら上から下に読めるコードのまま非同期にできる。
//
// yield するのは「エフェクト」。BattleScene がそれを実行し、結果を next() で返す。

import { getMove } from '../data/moves.js';
import { effectivenessMessage, effectiveness } from '../data/types.js';
import {
  damage, accuracyCheck, expGain, expForLevel, statusEndOfTurnDamage,
  effectiveSpeed, catchAttempt, runAway, CATCH_FAIL_MESSAGE, STAT_LABEL,
  evYield, addEV,
} from './formulas.js';
import {
  displayName, isFainted, damageMon, heal, recalcStats, movesLearnedAt,
  learnMove, replaceMove, knowsMove, evolutionTarget, evolve, resetBattleState, MAX_MOVES,
  applyItemUse,
} from './monster.js';
import { chooseAction } from './ai.js';
import * as Music from '../core/music.js';
import { MAX_LEVEL } from '../data/growth.js';
import { getSpecies } from '../data/species.js';
import {
  state, addMonster, registerSeen, registerCaught, removeItem, partyFull, setFlag, getFlag, countItem,
} from './state.js';
import { prizeMoney, trainerFlag, badgeFlag, BADGES } from '../data/trainers.js';
import { getItem } from '../data/items.js';

const STRUGGLE = { name: 'わるあがき', type: 'ノーマル', category: '物理', power: 50, accuracy: null, pp: 1, priority: 0, effect: { kind: 'recoil', ratio: 0.25 } };

// ---- エフェクトの短縮ヘルパ ----
const msg = (text) => ({ t: 'msg', text });
const anim = (kind, opt = {}) => ({ t: 'anim', kind, ...opt });
const wait = (frames) => ({ t: 'wait', frames });

/**
 * 野生バトル。ctx は BattleScene が用意する:
 *   { mine, foe, rng, isWild, runAttempts }
 * 戻り値 { result: 'win' | 'lose' | 'run' | 'caught' }
 */
export function* wildBattle(ctx) {
  ctx.isWild = true;
  registerSeen(ctx.foe.species.id);

  yield anim('intro');
  yield msg(`あっ！ やせいの ${ctx.foe.species.name}が とびだしてきた！`);
  yield* triggerSendOut(ctx, ctx.foe, false);
  yield anim('sendOut');
  yield msg(`ゆけっ！ ${displayName(ctx.mine)}！`);
  yield* triggerSendOut(ctx, ctx.mine, true);

  const early = yield* battleLoop(ctx);
  if (early) return early;                       // にげた・つかまえた

  if (ctx.over === 'win') {
    yield* checkEvolutions(ctx);
    return { result: 'win' };
  }
  return { result: 'lose' };
}

/**
 * トレーナー戦。ctx に { trainer, trainerId, foeParty } が要る。
 * 野生戦との違いは「相手が控えを出してくる」「にげる・ボールが使えない」
 * 「勝つと賞金とバッジ」の3点だけなので、進行の本体は共有する。
 */
export function* trainerBattle(ctx) {
  const t = ctx.trainer;
  ctx.isWild = false;

  yield anim('intro');
  yield msg(`${t.class}の ${t.name}が しょうぶを しかけてきた！`);
  for (const line of t.intro ?? []) yield msg(line);

  registerSeen(ctx.foe.species.id);
  yield msg(`${t.name}は ${ctx.foe.species.name}を くりだした！`);
  yield* triggerSendOut(ctx, ctx.foe, false);
  yield anim('sendOut');
  yield msg(`ゆけっ！ ${displayName(ctx.mine)}！`);
  yield* triggerSendOut(ctx, ctx.mine, true);

  const early = yield* battleLoop(ctx);
  if (early) return early;

  if (ctx.over !== 'win') return { result: 'lose' };

  setFlag(trainerFlag(ctx.trainerId));
  Music.play('victory');
  for (const line of t.defeat ?? []) yield msg(line);

  const prize = prizeMoney(t);
  state.player.money += prize;
  yield msg(`${state.player.name}は しょうきんとして ${prize}円を てにいれた！`);

  if (t.badge) {
    setFlag(badgeFlag(t.badge));
    const badge = BADGES.find((b) => b.id === t.badge);
    yield anim('levelUp');
    yield msg(`${state.player.name}は ${badge?.name ?? 'バッジ'}を てにいれた！`);
    // バッジが全部そろったかを1つのフラグにまとめておく（リーグの入場条件など）。
    if (BADGES.every((b) => getFlag(badgeFlag(b.id)))) setFlag('allBadges');
  }

  yield* checkEvolutions(ctx);
  return { result: 'win' };
}

/**
 * 1ターンの繰り返し。
 * 決着がついたら null を返し、勝敗は ctx.over に入れる。
 * にげる・捕獲のように「勝敗以外の終わりかた」をしたときだけ結果を返す。
 */
function* battleLoop(ctx) {
  for (;;) {
    const mine = yield* chooseCommand(ctx);

    if (mine.type === 'run') {
      ctx.runAttempts++;
      const ok = runAway(
        effectiveSpeed(ctx.mine, ctx.weather?.kind), effectiveSpeed(ctx.foe, ctx.weather?.kind),
        ctx.runAttempts - 1, ctx.rng,
      );
      if (ok) {
        yield msg('うまく にげきれた！');
        return { result: 'run' };
      }
      yield msg('にげられない！');
      const foeAction = decideFoeAction(ctx);
      if ((yield* resolveTurn(ctx, [foeAction])).over) return null;
      continue;
    }

    if (mine.type === 'ball') {
      const caught = yield* throwBall(ctx, mine.item);
      if (caught) return { result: 'caught' };
      const foeAction = decideFoeAction(ctx);
      if ((yield* resolveTurn(ctx, [foeAction])).over) return null;
      continue;
    }

    // わざ・どうぐ・交代は、どれも「こちらの1手」として同じ経路を通る。
    // ここを分けていた（＝どうぐと交代がターンの実行に乗らない）のが
    // 「交代できない」「HPバーが1テンポ遅れる」の原因だった。
    const foeAction = decideFoeAction(ctx);
    const actions = orderActions([mine, foeAction], ctx.rng, ctx.weather?.kind);
    if ((yield* resolveTurn(ctx, actions)).over) return null;
  }
}

/** 両者ぶんの行動を実行し、ひんし判定とターン終了処理まで行う。 */
function* resolveTurn(ctx, actions) {
  for (const act of actions) {
    if (isFainted(ctx.mine) || isFainted(ctx.foe)) break;
    yield* executeAction(ctx, act);
  }
  if (yield* checkFaint(ctx)) return { over: true };
  yield* endOfTurn(ctx);
  if (yield* checkFaint(ctx)) return { over: true };
  return { over: false };
}

// ---- コマンド選択 ----

function* chooseCommand(ctx) {
  for (;;) {
    const cmd = yield { t: 'command' };

    if (cmd.type === 'fight') {
      const pick = yield { t: 'moveSelect' };
      if (pick === null) continue;              // B で戻る
      const mv = ctx.mine.moves[pick];
      if (!mv || mv.pp <= 0) {
        yield msg('その わざは PPが のこっていない！');
        continue;
      }
      return { type: 'move', user: ctx.mine, target: ctx.foe, move: getMove(mv.id), slot: pick };
    }

    if (cmd.type === 'bag') {
      const chosen = yield { t: 'bag' };
      if (!chosen) continue;
      if (chosen.item.pocket === 'ボール') {
        if (!ctx.isWild) {
          yield msg('ひとの ポケモンを ボールで とるなんて！');
          continue;
        }
        return { type: 'ball', item: chosen.item };
      }
      return { type: 'item', user: ctx.mine, item: chosen.item, target: chosen.target };
    }

    if (cmd.type === 'party') {
      const idx = yield { t: 'party' };
      if (idx === null || idx === undefined) continue;
      return { type: 'switch', user: ctx.mine, index: idx };
    }

    if (cmd.type === 'run') {
      if (!ctx.isWild) {
        yield msg('しょうぶから にげることは できない！');
        continue;
      }
      return { type: 'run' };
    }
  }
}

// ---- 相手（トレーナー）の1手 ----

/**
 * ジムリーダー(skill:3)は状態異常を1回だけ回復するどうぐを持つ（Phase X-3）。
 * 手持ちが状態異常なら、攻撃より先にそれを使ってくる。
 */
function pickFoeItem(ctx) {
  if (!ctx.trainer || (ctx.trainer.skill ?? 0) < 3 || !ctx.foe.status) return null;
  const items = ctx.trainerItemsLeft;
  if (!items?.length) return null;
  const idx = items.findIndex((name) => {
    const use = getItem(name)?.use;
    return use?.kind === 'cure' && (use.status === 'all' || use.status === ctx.foe.status);
  });
  if (idx < 0) return null;
  const [itemName] = items.splice(idx, 1);
  return { type: 'foeItem', user: ctx.foe, itemName };
}

/**
 * AI交代（Phase X-2）。skill:3 だけ、いまの子が2倍弱点を突かれていて、
 * ひかえに その弱点を持たない子がいれば 攻撃より先に交代する。
 * 交代先は毎回「弱点をやわらげる」ことしか見ないので、直した先がまた弱点なら次のターンも交代できる
 * （＝無限ループにはならない。ベンチが尽きれば普通に攻撃を選ぶ）。
 */
function pickFoeSwitch(ctx) {
  if (!ctx.trainer || (ctx.trainer.skill ?? 0) < 3 || !ctx.foeParty) return null;
  const bench = ctx.foeParty.filter((m) => m !== ctx.foe && !isFainted(m));
  if (!bench.length) return null;

  // 自分の各タイプが相手にどれだけ通るかの最大値を「弱点の深さ」とする
  const threatIn = (types) => Math.max(0, ...ctx.mine.types.map((t) => effectiveness(t, types)));
  const currentThreat = threatIn(ctx.foe.types);
  if (currentThreat < 2) return null; // いまの子が特別 不利でなければ交代しない

  let best = null;
  let bestThreat = currentThreat;
  for (const m of bench) {
    const t = threatIn(m.types);
    if (t < bestThreat) { best = m; bestThreat = t; }
  }
  if (!best) return null;
  return { type: 'foeSwitch', user: ctx.foe, next: best };
}

function decideFoeAction(ctx) {
  return pickFoeSwitch(ctx) ?? pickFoeItem(ctx)
    ?? chooseAction(ctx.foe, ctx.mine, ctx.rng, ctx.trainer?.skill ?? 0, ctx.weather);
}

// ---- 行動順 ----

function priorityOf(act) {
  if (act.type === 'move') return act.move.priority ?? 0;
  return 6; // どうぐ・交代・にげる は最優先
}

export function orderActions(actions, rng, weather = null) {
  return [...actions].sort((x, y) => {
    const p = priorityOf(y) - priorityOf(x);
    if (p !== 0) return p;
    const s = effectiveSpeed(y.user, weather) - effectiveSpeed(x.user, weather);
    if (s !== 0) return s;
    return rng.chance(0.5) ? 1 : -1;
  });
}

// ---- 1手の実行 ----

function* executeAction(ctx, act) {
  if (act.type === 'switch') { yield* doSwitchAction(ctx, act); return; }
  if (act.type === 'item') { yield* doItemAction(ctx, act); return; }
  if (act.type === 'foeItem') { yield* doFoeItemAction(ctx, act); return; }
  if (act.type === 'foeSwitch') { yield* doFoeSwitchAction(ctx, act); return; }

  const user = act.user;
  const target = user === ctx.mine ? ctx.foe : ctx.mine;
  const isMine = user === ctx.mine;

  if (isFainted(user)) return;

  // 行動できるかどうか（状態異常）
  if (!(yield* canAct(ctx, user, isMine))) return;

  const move = act.type === 'struggle' ? STRUGGLE : act.move;

  if (act.type !== 'struggle') {
    const slot = user.moves[act.slot];
    if (slot) slot.pp = Math.max(0, slot.pp - 1);
  }

  yield msg(`${isMine ? '' : 'てきの '}${displayName(user)}の ${move.name}！`);

  // まもる（Phase X-1）。自分自身にかける変化技（積み技など）以外は、このターンすべて防ぐ。
  const targetsOpponent = !(move.category === '変化' && move.effect?.target === 'self');
  if (targetsOpponent && target.volatile.protecting) {
    yield msg(`${isMine ? 'てきの ' : ''}${displayName(target)}は みを まもっている！`);
    return;
  }

  if (!accuracyCheck(user, target, move, ctx.rng)) {
    yield msg(`${displayName(user)}の こうげきは はずれた！`);
    return;
  }

  // 変化技
  if (move.category === '変化') {
    yield* applyEffect(ctx, user, target, move, 0);
    return;
  }

  const { dmg, eff, crit } = damage(user, target, move, ctx.rng, ctx.weather?.kind);

  if (eff === 0) {
    yield msg(`${isMine ? 'てきの ' : ''}${displayName(target)}には こうかが ないようだ…`);
    return;
  }

  const hits = move.effect?.kind === 'multiHit' ? ctx.rng.int(2, 5) : 1;
  let total = 0;
  for (let i = 0; i < hits; i++) {
    if (isFainted(target)) break;
    const d0 = i === 0 ? dmg : damage(user, target, move, ctx.rng, ctx.weather?.kind).dmg;

    // みがわり: 本体の代わりに人形が受ける。壊れても余った分は本体に流れ込まない。
    if (target.volatile.substitute > 0) {
      const absorbed = Math.min(d0, target.volatile.substitute);
      target.volatile.substitute -= absorbed;
      total += absorbed;
      yield anim('hit', { onFoe: isMine, eff });
      if (target.volatile.substitute <= 0) {
        target.volatile.substitute = 0;
        yield msg(`${isMine ? 'てきの ' : ''}${displayName(target)}の みがわりが きえた！`);
      }
      continue;
    }

    const d1 = yield* applySturdy(ctx, target, d0);
    const d = yield* applyEndure(ctx, target, d1);
    total += damageMon(target, d);
    yield anim('hit', { onFoe: isMine, eff });
    yield { t: 'hpTween', onFoe: isMine };
  }
  if (hits > 1) yield msg(`${hits}かい あたった！`);

  if (crit) yield msg('きゅうしょに あたった！');
  const em = effectivenessMessage(eff, `${isMine ? 'てきの ' : ''}${displayName(target)}`);
  if (em) yield msg(em);

  yield* triggerContactAbility(ctx, user, target, move);
  yield* applyEffect(ctx, user, target, move, total);
  yield* checkPinchHeal(ctx, target);
}

// ---- とくせい（Phase V）----

/** いかく。場に出た直後、相手のこうげきを1段階さげる。 */
function* triggerSendOut(ctx, mon, isMine) {
  if (mon.species.ability !== 'いかく') return;
  const target = isMine ? ctx.foe : ctx.mine;
  if (!target || isFainted(target)) return;
  const cur = target.stages.atk ?? 0;
  const next = Math.max(-6, Math.min(6, cur - 1));
  if (next === cur) return;
  target.stages.atk = next;
  const monLabel = `${isMine ? '' : 'てきの '}${displayName(mon)}`;
  const targetLabel = `${isMine ? 'てきの ' : ''}${displayName(target)}`;
  yield msg(`${monLabel}の いかく！ ${targetLabel}の こうげきが さがった！`);
}

/** がんじょう。HP満タンから一撃で倒される一撃を、必ず HP1 まで軽くする。 */
function* applySturdy(ctx, target, dmg) {
  if (target.species.ability !== 'がんじょう') return dmg;
  if (dmg < target.curHP || target.curHP !== target.stats.hp) return dmg;
  yield msg(`${target === ctx.foe ? 'てきの ' : ''}${displayName(target)}は がんじょうで もちこたえた！`);
  return target.curHP - 1;
}

const CONTACT_ABILITY_STATUS = { 'せいでんき': 'まひ', 'ほのおのからだ': 'やけど' };

/** せいでんき/ほのおのからだ。物理接触を受けたとき、30%で こうげき側に状態異常を返す。 */
function* triggerContactAbility(ctx, user, target, move) {
  if (move.category !== '物理') return;
  if (isFainted(user) || isFainted(target)) return;
  const status = CONTACT_ABILITY_STATUS[target.species.ability];
  if (!status || user.status) return;
  if (!ctx.rng.chance(0.3)) return;
  user.status = status;
  yield msg(`${user === ctx.foe ? 'てきの ' : ''}${displayName(user)}は ${displayName(target)}の ${target.species.ability}で ${statusVerb(status)}`);
}

// ---- もちもの ----

/** きあいのハチマキ。ひんしになる一撃を、確率で HP1 まで軽くする。 */
function* applyEndure(ctx, target, dmg) {
  const hold = getItem(target.held ?? '')?.hold;
  if (hold?.kind !== 'endure') return dmg;
  if (dmg < target.curHP || target.curHP <= 1) return dmg;
  if (!ctx.rng.chance((hold.chance ?? 10) / 100)) return dmg;
  yield msg(`${target === ctx.foe ? 'てきの ' : ''}${displayName(target)}は ${target.held}で こらえた！`);
  return target.curHP - 1;
}

/** オボンのみ。HPが しきい値を下回ったら 1回だけ かいふくして消える。 */
function* checkPinchHeal(ctx, mon) {
  if (isFainted(mon)) return;
  const hold = getItem(mon.held ?? '')?.hold;
  if (hold?.kind !== 'pinchHeal') return;
  if (mon.curHP / mon.stats.hp > (hold.threshold ?? 0.5)) return;

  const amt = Math.max(1, Math.floor(mon.stats.hp * (hold.ratio ?? 0.25)));
  const held = mon.held;
  heal(mon, amt);
  mon.held = null;
  yield msg(`${mon === ctx.foe ? 'てきの ' : ''}${displayName(mon)}は ${held}で HPを かいふくした！`);
  yield { t: 'hpTween', onFoe: mon === ctx.foe };
}

/** 状態異常で動けるかどうか。動けないときはメッセージを出して false。 */
function* canAct(ctx, user, isMine) {
  const label = `${isMine ? '' : 'てきの '}${displayName(user)}`;

  if (user.status === 'ねむり') {
    if (user.statusTurns > 0) user.statusTurns--;
    if (user.statusTurns <= 0) {
      user.status = null;
      yield msg(`${label}は めを さました！`);
    } else {
      yield msg(`${label}は ぐうぐう ねむっている。`);
      return false;
    }
  }

  if (user.status === 'こおり') {
    if (ctx.rng.chance(0.2)) {
      user.status = null;
      yield msg(`${label}の こおりが とけた！`);
    } else {
      yield msg(`${label}は こおって しまって うごけない！`);
      return false;
    }
  }

  if (user.volatile.flinch) {
    user.volatile.flinch = false;
    yield msg(`${label}は ひるんで わざが だせない！`);
    return false;
  }

  if (user.status === 'まひ' && ctx.rng.chance(0.25)) {
    yield msg(`${label}は からだが しびれて うごけない！`);
    return false;
  }

  if (user.volatile.confusion > 0) {
    user.volatile.confusion--;
    if (user.volatile.confusion <= 0) {
      yield msg(`${label}の こんらんが とけた！`);
    } else {
      yield msg(`${label}は こんらん している！`);
      if (ctx.rng.chance(1 / 3)) {
        const self = { ...STRUGGLE, power: 40, type: 'ノーマル' };
        const { dmg } = damage(user, user, self, ctx.rng);
        damageMon(user, dmg);
        yield msg('わけも わからず じぶんを こうげきした！');
        yield anim('hit', { onFoe: !isMine });
        yield { t: 'hpTween', onFoe: !isMine };
        yield* checkPinchHeal(ctx, user);
        return false;
      }
    }
  }

  return true;
}

/** 技の追加効果。未対応の kind は黙って無視する（データが先行してもよい）。 */
function* applyEffect(ctx, user, target, move, dealt) {
  const e = move.effect;
  if (!e) return;

  const isMine = user === ctx.mine;
  const foeLabel = (m) => `${(m === ctx.foe ? 'てきの ' : '')}${displayName(m)}`;

  // みがわり: 相手が対象の状態異常・能力ダウン・混乱・ひるみは、みがわりが残っていると素通しにする
  if (target.volatile.substitute > 0 && e.target !== 'self'
    && ['status', 'stat', 'confuse', 'flinch'].includes(e.kind)) {
    return;
  }

  switch (e.kind) {
    case 'status': {
      if (!ctx.rng.chance((e.chance ?? 100) / 100)) return;
      const victim = target;
      if (victim.status) {
        if (move.category === '変化') yield msg('しかし うまく きまらなかった！');
        return;
      }
      victim.status = e.status;
      if (e.status === 'ねむり') victim.statusTurns = ctx.rng.int(1, 3);
      else if (e.status === 'もうどく') victim.statusTurns = 0; // 毎ターン増える方向のカウント（formulas.js側）
      yield msg(`${foeLabel(victim)}は ${statusVerb(e.status)}`);
      break;
    }

    case 'stat': {
      if (!ctx.rng.chance((e.chance ?? 100) / 100)) return;
      const victim = e.target === 'self' ? user : target;
      // めいそう のように2つの能力を同時に上げる技は stats（複数形）で渡す。
      const changes = e.stats ?? [{ stat: e.stat, stages: e.stages }];
      for (const { stat, stages } of changes) {
        const cur = victim.stages[stat] ?? 0;
        const next = Math.max(-6, Math.min(6, cur + stages));
        if (next === cur) {
          yield msg(`${foeLabel(victim)}の ${STAT_LABEL[stat]}は もう ${stages > 0 ? 'あがらない' : 'さがらない'}！`);
          continue;
        }
        victim.stages[stat] = next;
        const word = Math.abs(stages) >= 2 ? 'ぐーんと ' : '';
        yield msg(`${foeLabel(victim)}の ${STAT_LABEL[stat]}が ${word}${stages > 0 ? 'あがった！' : 'さがった！'}`);
      }
      break;
    }

    case 'drain': {
      if (dealt <= 0) return;
      const got = Math.max(1, Math.floor(dealt * (e.ratio ?? 0.5)));
      heal(user, got);
      yield { t: 'hpTween', onFoe: !isMine };
      yield msg(`${foeLabel(target)}から たいりょくを すいとった！`);
      break;
    }

    case 'recoil': {
      if (dealt <= 0) return;
      const back = Math.max(1, Math.floor(dealt * (e.ratio ?? 0.25)));
      damageMon(user, back);
      yield { t: 'hpTween', onFoe: !isMine };
      yield msg(`${foeLabel(user)}は はんどうで ダメージを うけた！`);
      yield* checkPinchHeal(ctx, user);
      break;
    }

    case 'flinch': {
      if (!ctx.rng.chance((e.chance ?? 30) / 100)) return;
      target.volatile.flinch = true;
      break;
    }

    case 'confuse': {
      if (!ctx.rng.chance((e.chance ?? 100) / 100)) return;
      const victim = e.target === 'self' ? user : target;
      if (victim.volatile.confusion > 0) {
        if (move.category === '変化') yield msg(`${foeLabel(victim)}は すでに こんらんしている！`);
        return;
      }
      victim.volatile.confusion = ctx.rng.int(2, 5);
      yield msg(`${foeLabel(victim)}は こんらんした！`);
      break;
    }

    case 'heal': {
      const amt = Math.max(1, Math.floor(user.stats.hp * (e.ratio ?? 0.5)));
      heal(user, amt);
      yield { t: 'hpTween', onFoe: !isMine };
      yield msg(`${foeLabel(user)}は たいりょくを かいふくした！`);
      break;
    }

    // 天候（Phase W）。あめ/にほんばれ/すなあらし。
    case 'weather': {
      ctx.weather.kind = e.weather;
      ctx.weather.turns = e.turns ?? 5;
      yield msg(WEATHER_START_MSG[e.weather]);
      break;
    }

    // みがわり（Phase X-1）。HPの1/4を代償に、こうげきの身代わりになる人形を出す。
    case 'substitute': {
      if (user.volatile.substitute > 0) {
        yield msg('しかし もう みがわりが いる！');
        return;
      }
      const cost = Math.max(1, Math.floor(user.stats.hp / 4));
      if (user.curHP <= cost) {
        yield msg(`${foeLabel(user)}には たいりょくが たりない！`);
        return;
      }
      damageMon(user, cost);
      user.volatile.substitute = cost;
      yield { t: 'hpTween', onFoe: !isMine };
      yield msg(`${foeLabel(user)}は みがわりを つくった！`);
      break;
    }

    // まもる（Phase X-1）。優先度+4で必ず先手を取り、このターンの相手の技を防ぐ。
    case 'protect': {
      user.volatile.protecting = true;
      yield msg(`${foeLabel(user)}は みを まもった！`);
      break;
    }

    // highCrit / multiHit はダメージ計算側で処理済み。
    default:
      break;
  }
}

const WEATHER_START_MSG = {
  rain: 'あめが ふりはじめた！',
  sun: 'ひざしが つよくなった！',
  sand: 'すなあらしが まきおこった！',
};
const WEATHER_END_MSG = {
  rain: 'あめが やんだ。',
  sun: 'ひざしが もとに もどった。',
  sand: 'すなあらしが おさまった。',
};
const SAND_IMMUNE = ['いわ', 'じめん', 'はがね'];

function statusVerb(status) {
  switch (status) {
    case 'どく': return 'どくを あびた！';
    case 'もうどく': return 'もうどくを あびた！';
    case 'やけど': return 'やけどを おった！';
    case 'まひ': return 'まひして わざが でにくくなった！';
    case 'ねむり': return 'ねむってしまった！';
    case 'こおり': return 'こおりついた！';
    default: return `${status}に なった！`;
  }
}

// ---- ターン終了 ----

function* endOfTurn(ctx) {
  yield* tickWeather(ctx);

  for (const m of [ctx.mine, ctx.foe]) {
    if (isFainted(m)) continue;
    if (m.status === 'もうどく') m.statusTurns++; // ターンを追うごとにダメージが増える
    const d = statusEndOfTurnDamage(m);
    if (d <= 0) continue;
    damageMon(m, d);
    const label = `${m === ctx.foe ? 'てきの ' : ''}${displayName(m)}`;
    yield msg(`${label}は ${(m.status === 'どく' || m.status === 'もうどく') ? 'どくの' : 'やけどの'} ダメージを うけた！`);
    yield { t: 'hpTween', onFoe: m === ctx.foe };
    yield* checkPinchHeal(ctx, m);
  }

  // まもるは1ターンだけ効く。次のターンに持ち越さない。
  ctx.mine.volatile.protecting = false;
  ctx.foe.volatile.protecting = false;

  // たべのこし。まいターン すこしずつ回復する。
  for (const m of [ctx.mine, ctx.foe]) {
    if (isFainted(m) || m.curHP >= m.stats.hp) continue;
    const hold = getItem(m.held ?? '')?.hold;
    if (hold?.kind !== 'endTurnHeal') continue;
    const amt = Math.max(1, Math.floor(m.stats.hp * (hold.ratio ?? 1 / 16)));
    heal(m, amt);
    yield msg(`${m === ctx.foe ? 'てきの ' : ''}${displayName(m)}は ${m.held}で すこし かいふくした！`);
    yield { t: 'hpTween', onFoe: m === ctx.foe };
  }
}

/** 天候の継続処理（Phase W）。すなあらしはダメージ、切れたら告知して元に戻す。 */
function* tickWeather(ctx) {
  if (!ctx.weather.kind) return;

  if (ctx.weather.kind === 'sand') {
    for (const m of [ctx.mine, ctx.foe]) {
      if (isFainted(m) || SAND_IMMUNE.some((t) => m.types.includes(t))) continue;
      const d = Math.max(1, Math.floor(m.stats.hp / 16));
      damageMon(m, d);
      yield msg(`${m === ctx.foe ? 'てきの ' : ''}${displayName(m)}は すなあらしに ダメージを うけた！`);
      yield { t: 'hpTween', onFoe: m === ctx.foe };
      yield* checkPinchHeal(ctx, m);
    }
  }

  ctx.weather.turns--;
  if (ctx.weather.turns <= 0) {
    const ending = ctx.weather.kind;
    ctx.weather.kind = null;
    yield msg(WEATHER_END_MSG[ending]);
  }
}

// ---- ひんし判定 ----

/**
 * どちらかが倒れたら true（＝バトル終了）。勝敗は ctx.over に入れる。
 * 経験値は「倒したその場」で入る。トレーナー戦は控えが出てくるので、
 * 最後まで待つと1匹目を倒した分の経験値が遅れて出てしまう。
 */
function* checkFaint(ctx) {
  if (isFainted(ctx.foe)) {
    yield anim('faint', { onFoe: true });
    yield msg(`てきの ${displayName(ctx.foe)}は たおれた！`);
    yield* gainExpAndLevel(ctx);

    const next = ctx.foeParty?.find((m) => m.curHP > 0) ?? null;
    if (next) {
      yield* sendOutFoe(ctx, next);
      return false;
    }
    ctx.over = 'win';
    return true;
  }
  if (isFainted(ctx.mine)) {
    yield anim('faint', { onFoe: false });
    yield msg(`${displayName(ctx.mine)}は たおれた！`);

    // 戦えるポケモンが残っていれば交代を強制する
    const next = state.party.filter((m) => m.curHP > 0);
    if (next.length) {
      const idx = yield { t: 'forceSwitch' };
      if (idx !== null && idx !== undefined) {
        yield* switchIn(ctx, idx);
        return false;
      }
    }
    yield msg(`${state.player.name}には たたかえる ポケモンが いない！`);
    ctx.over = 'lose';
    return true;
  }
  return false;
}

/** トレーナーが次のポケモンを出す */
function* sendOutFoe(ctx, next) {
  const t = ctx.trainer;
  yield msg(`${t?.name ?? 'あいて'}は ${next.species.name}を くりだした！`);
  ctx.foe = next;
  registerSeen(next.species.id);
  ctx.onFoeSwitch?.(next);
  yield anim('foeSendOut');
  yield* triggerSendOut(ctx, next, false);
}

/** プレイヤーが自分の意思で交代する（1手ぶん）。 */
function* doSwitchAction(ctx, act) {
  const next = state.party[act.index];
  if (!next || next.curHP <= 0 || next === ctx.mine) return;

  const out = ctx.mine;
  yield msg(`もどれ！ ${displayName(out)}！`);
  yield anim('recall');
  resetBattleState(out);
  ctx.mine = next;
  ctx.onSwitch?.(next);         // dispHP.mine を新しい個体のHPに即同期する
  yield anim('sendOut');
  yield msg(`ゆけっ！ ${displayName(next)}！`);
  yield* triggerSendOut(ctx, next, true);
}

/**
 * どうぐの使用（1手ぶん）。効果は必ずここで初めて適用する。
 * 選択画面（PartyScene）は selectOnly:true のときは判定だけで変化させない。
 * そうしないと HP バーの更新が「次に何かが HP を動かすまで」遅れてしまう。
 */
function* doItemAction(ctx, act) {
  const { item, target } = act;
  const r = applyItemUse(target, item.use);
  if (!r.ok) {
    yield msg(r.message);
    return;
  }
  removeItem(item.name, 1);
  yield msg(`${state.player.name}は ${item.name}を つかった！`);
  yield { t: 'hpTween', onFoe: false };
  yield msg(r.message);
}

/** トレーナーが自分のポケモンにどうぐを使う（Phase X-3）。1回きりで、消費は pickFoeItem 側で済ませてある。 */
function* doFoeItemAction(ctx, act) {
  const r = applyItemUse(ctx.foe, getItem(act.itemName)?.use);
  yield msg(`${ctx.trainer?.name ?? 'あいて'}は ${act.itemName}を つかった！`);
  if (r.ok) yield msg(r.message);
}

/** AI交代（Phase X-2）。トレーナーが不利な子を自分の意思でひっこめる。 */
function* doFoeSwitchAction(ctx, act) {
  const t = ctx.trainer;
  const out = ctx.foe;
  yield msg(`${t?.name ?? 'あいて'}は ${displayName(out)}を もどした！`);
  resetBattleState(out);
  ctx.foe = act.next;
  registerSeen(act.next.species.id);
  ctx.onFoeSwitch?.(act.next);
  yield anim('foeSendOut');
  yield msg(`${t?.name ?? 'あいて'}は ${act.next.species.name}を くりだした！`);
  yield* triggerSendOut(ctx, act.next, false);
}

function* switchIn(ctx, index) {
  const next = state.party[index];
  if (!next || next.curHP <= 0) return;
  resetBattleState(ctx.mine);
  ctx.mine = next;
  ctx.onSwitch?.(next);
  yield anim('sendOut');
  yield msg(`ゆけっ！ ${displayName(next)}！`);
  yield* triggerSendOut(ctx, next, true);
}

// ---- ボール ----

function* throwBall(ctx, item) {
  removeItem(item.name, 1);
  yield msg(`${state.player.name}は ${item.name}を なげた！`);

  // くさバッジ: 捕獲率 ×1.2（Phase R）
  const charmMul = (countItem('ひかるおまもり') > 0 ? 1.5 : 1) * (getFlag(badgeFlag('kusa')) ? 1.2 : 1);
  const { caught, shakes } = catchAttempt(ctx.foe, item, ctx.rng, charmMul);
  yield anim('ball', { shakes, caught });

  if (!caught) {
    yield msg(CATCH_FAIL_MESSAGE[shakes] ?? CATCH_FAIL_MESSAGE[0]);
    return false;
  }

  yield msg(`やったー！ ${displayName(ctx.foe)}を つかまえたぞ！`);
  registerCaught(ctx.foe.species.id);

  // ニックネーム。つけないほうが多いので「いいえ」を初期選択にしてある。
  if (yield { t: 'confirm', text: `${ctx.foe.species.name}に ニックネームを つけますか？`, defaultNo: true }) {
    const nick = yield { t: 'nickname', mon: ctx.foe };
    if (nick) ctx.foe.nick = nick;
  }

  const where = addMonster(ctx.foe);
  if (where === 'box') {
    yield msg(`てもちが いっぱいなので ${displayName(ctx.foe)}は ボックスへ おくられた！`);
  } else if (where === null) {
    yield msg('しかし ボックスも いっぱいだ！ にがしてしまった…');
  }
  return true;
}

// ---- 経験値とレベルアップ ----

function* gainExpAndLevel(ctx) {
  const mon = ctx.mine;
  if (isFainted(mon) || mon.level >= MAX_LEVEL) return;

  // 努力値。倒した相手の一番高い種族値に入る。
  // 「この子を育てると こうげきが伸びる」が、データを増やさずに成立する。
  const ey = evYield(ctx.foe.species);
  addEV(mon.evs, ey.stat, ey.amount);

  // ゴーストバッジ: けいけんち +10%（Phase R）
  const badgeMul = getFlag(badgeFlag('ghost')) ? 1.1 : 1;
  const gain = Math.floor(expGain(ctx.foe, 1, ctx.isWild) * badgeMul);
  yield msg(`${displayName(mon)}は ${gain}けいけんちを もらった！`);

  let remaining = gain;
  while (remaining > 0) {
    if (mon.level >= MAX_LEVEL) {
      mon.exp = expForLevel(mon.species.expType, MAX_LEVEL);
      break;
    }
    const needed = expForLevel(mon.species.expType, mon.level + 1) - mon.exp;
    const step = Math.min(remaining, needed);
    mon.exp += step;
    remaining -= step;

    yield { t: 'expTween' };

    if (mon.exp < expForLevel(mon.species.expType, mon.level + 1)) break;

    // レベルアップ
    mon.level++;
    const grow = recalcStats(mon);
    yield anim('levelUp');
    yield msg(`${displayName(mon)}は レベル ${mon.level}に あがった！`);
    yield { t: 'statPanel', gain: grow };

    for (const move of movesLearnedAt(mon.species, mon.level)) {
      yield* tryLearn(ctx, mon, move);
    }
  }
}

/** 技を覚える。4つ埋まっていたら忘れる技を選ばせる。 */
export function* tryLearn(ctx, mon, moveId) {
  if (knowsMove(mon, moveId)) return;

  if (mon.moves.length < MAX_MOVES) {
    learnMove(mon, moveId);
    yield msg(`${displayName(mon)}は ${moveId}を おぼえた！`);
    return;
  }

  yield msg(`${displayName(mon)}は あたらしく ${moveId}を おぼえたい！`);
  yield msg(`しかし わざは ４つしか おぼえられない。`);
  yield msg(`${moveId}の かわりに どの わざを わすれさせますか？`);

  const slot = yield { t: 'forgetSelect', mon, newMove: moveId };
  if (slot === null || slot === undefined) {
    yield msg(`${displayName(mon)}は ${moveId}を おぼえられなかった！`);
    return;
  }

  const old = mon.moves[slot].id;
  replaceMove(mon, slot, moveId);
  yield msg('１、２、３… ポカン！');
  yield msg(`${displayName(mon)}は ${old}を わすれて あたらしく ${moveId}を おぼえた！`);
}

// ---- 進化 ----
// 本家と同じくバトルが終わってからまとめて発火する。

function* checkEvolutions(ctx) {
  for (const mon of state.party) {
    if (mon.curHP <= 0) continue;
    // 一度でも断った進化は、バトルでは二度と聞かない。ポケモンセンターのPCから
    // やり直せる（S-2）。evoLocked ならそこでも二度と聞かれない。
    if (mon.evoDeclined || mon.evoLocked) continue;
    const toId = evolutionTarget(mon, 'level');
    if (!toId) continue;
    yield* runEvolution(mon, toId);
  }
}

/** 進化演出。B でキャンセルできる。 */
export function* runEvolution(mon, toId) {
  const before = displayName(mon);
  const after = getSpecies(toId);

  yield msg(`おや…？ ${before}の ようすが…！`);
  const cancelled = yield anim('evolve', { from: mon.species, to: after });

  if (cancelled) {
    yield msg(`あれ？ ${before}の ようすが…！`);
    mon.evoDeclined = true;
    return false;
  }

  evolve(mon, toId);
  mon.evoDeclined = false;
  mon.evoLocked = false;
  registerCaught(toId);
  yield msg(`おめでとう！ ${before}は ${after.name}に しんかした！`);

  // 進化先が同じレベルで覚える技を拾う
  for (const move of movesLearnedAt(mon.species, mon.level)) {
    yield* tryLearn(null, mon, move);
  }
  return true;
}
