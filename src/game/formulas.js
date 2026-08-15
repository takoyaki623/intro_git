// ステータス・ダメージ・命中・経験値・捕獲。
//
// このファイルは純粋関数だけで構成する（DOM も乱数のグローバルも触らない）。
// 乱数は必ず引数で受け取る。tests.html から丸ごと検証できるようにするため。

import { effectiveness } from '../data/types.js';
import { natureMul } from '../data/natures.js';
import { CURVE, MAX_LEVEL } from '../data/growth.js';
import { getItem } from '../data/items.js';

export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export const emptyEVs = () => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
export const STAT_LABEL = {
  hp: 'ＨＰ', atk: 'こうげき', def: 'ぼうぎょ',
  spa: 'とくこう', spd: 'とくぼう', spe: 'すばやさ',
  acc: 'めいちゅう', eva: 'かいひ',
};

// ---- ステータス ----
// Gen3+ の式。個体値・努力値・せいかく を含む。
// EV の項は 0 のまま残してあるので、足したくなったら 1行 で戻せる。

// 努力値は 4 つで実数値1つぶん（本家と同じ ⌊EV/4⌋）。
export const calcHP = (base, iv, lv, ev = 0) =>
  Math.max(1, Math.floor(((2 * base + iv + Math.floor(ev / 4)) * lv) / 100) + lv + 10);

export const calcStat = (base, iv, lv, ev = 0, mul = 1) =>
  Math.max(1, Math.floor((Math.floor(((2 * base + iv + Math.floor(ev / 4)) * lv) / 100) + 5) * mul));

/**
 * 種族値・個体値・努力値・せいかく・レベルから6つのステータスを作る。
 * HP には せいかく の補正がかからない（本家と同じ）。
 */
export function calcAllStats(base, ivs, level, evs = null, nature = null) {
  const ev = (k) => evs?.[k] ?? 0;
  const mul = (k) => natureMul(nature, k);
  return {
    hp: calcHP(base.hp, ivs.hp, level, ev('hp')),
    atk: calcStat(base.atk, ivs.atk, level, ev('atk'), mul('atk')),
    def: calcStat(base.def, ivs.def, level, ev('def'), mul('def')),
    spa: calcStat(base.spa, ivs.spa, level, ev('spa'), mul('spa')),
    spd: calcStat(base.spd, ivs.spd, level, ev('spd'), mul('spd')),
    spe: calcStat(base.spe, ivs.spe, level, ev('spe'), mul('spe')),
  };
}

/** 努力値の上限。1匹の合計と、1つのステータスあたり。 */
export const EV_TOTAL_MAX = 510;
export const EV_STAT_MAX = 252;

/**
 * 倒した相手からもらう努力値。
 * 本家は種族ごとに決まっているが、ここでは「一番高い種族値」に入れる。
 * データを増やさずに「この子を育てると◯◯が伸びる」を成立させるため。
 */
export function evYield(species) {
  const entries = Object.entries(species.base);
  const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { stat: best[0], amount: species.baseExp >= 150 ? 3 : species.baseExp >= 90 ? 2 : 1 };
}

/** 上限を守って努力値を足す。実際に増えた量を返す。 */
export function addEV(evs, stat, amount) {
  const total = Object.values(evs).reduce((a, b) => a + b, 0);
  const room = Math.min(EV_STAT_MAX - evs[stat], EV_TOTAL_MAX - total, amount);
  if (room <= 0) return 0;
  evs[stat] += room;
  return room;
}

// ---- 能力ランク（-6..+6）----
// 戦闘中だけ効く。交代すると消える。

export const stageMul = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
export const accMul = (s) => (s >= 0 ? (3 + s) / 3 : 3 / (3 - s));

/**
 * ランク補正込みの実数値。
 * 急所のときは「攻撃側のマイナス補正」と「防御側のプラス補正」を無視する。
 */
export function statWithStage(mon, key, mode = 'normal') {
  const raw = mon.stats[key];
  let stage = mon.stages?.[key] ?? 0;
  if (mode === 'ignoreNegative' && stage < 0) stage = 0;
  if (mode === 'ignorePositive' && stage > 0) stage = 0;
  return Math.max(1, Math.floor(raw * stageMul(stage)));
}

// ---- ダメージ ----

export const CRIT_RATE = 1 / 16;
export const HIGH_CRIT_RATE = 1 / 8;

// とくせい（Phase V / B1）: HP1/3以下で該当タイプの技を強化する
const ABILITY_TYPE_BOOST = {
  'もうか': 'ほのお', 'げきりゅう': 'みず', 'しんりょく': 'くさ', 'むしのしらせ': 'むし',
};

// とくせい（B2）: 特定タイプの技を完全に無効化し、代わりに自分のHPを回復する
const ABILITY_ABSORB_TYPE = { 'ちょすい': 'みず', 'ちくでん': 'でんき' };

/**
 * ダメージ計算。rng は { chance(p), int(min,max) } を持つもの。
 * 戻り値 { dmg, eff, crit }
 */
export function damage(attacker, defender, move, rng, weather = null) {
  if (move.category === '変化' || !move.power) {
    return { dmg: 0, eff: 1, crit: false };
  }

  let eff = effectiveness(move.type, defender.types);
  // ふゆう: じめん技が全く効かない。タイプ相性の「こうかがない」と違う理由なので、
  // 呼び出し側(battle.js)がとくせい名を出したメッセージに切り替えられるよう区別しておく。
  let levitated = false;
  if (defender.species?.ability === 'ふゆう' && move.type === 'じめん' && eff !== 0) {
    eff = 0;
    levitated = true;
  }
  // ちょすい/ちくでん: 該当タイプの技を無効化し、あとで呼び出し側がHPを回復させる。
  let absorbedBy = null;
  if (ABILITY_ABSORB_TYPE[defender.species?.ability] === move.type && eff !== 0) {
    eff = 0;
    absorbedBy = defender.species.ability;
  }
  if (eff === 0) return { dmg: 0, eff: 0, crit: false, levitated, absorbedBy };

  const phys = move.category === '物理';
  const critRate = move.effect?.kind === 'highCrit' ? HIGH_CRIT_RATE : CRIT_RATE;
  const crit = rng.chance(critRate);

  const A = statWithStage(attacker, phys ? 'atk' : 'spa', crit ? 'ignoreNegative' : 'normal');
  const D = statWithStage(defender, phys ? 'def' : 'spd', crit ? 'ignorePositive' : 'normal');

  let d = Math.floor(
    Math.floor(Math.floor((2 * attacker.level) / 5 + 2) * move.power * A / D) / 50,
  ) + 2;

  if (crit) d = Math.floor(d * 1.5);
  if (phys && attacker.status === 'やけど') d = Math.floor(d * 0.5);
  if (attacker.types.includes(move.type)) d = Math.floor(d * 1.5); // タイプ一致
  d = Math.floor(d * eff);
  // もうか/げきりゅう/しんりょく（Phase V）: HP1/3以下で該当タイプの技を1.5倍
  if (ABILITY_TYPE_BOOST[attacker.species?.ability] === move.type
    && attacker.curHP / attacker.stats.hp <= 1 / 3) {
    d = Math.floor(d * 1.5);
  }
  // 天候（Phase W）: あめは みず1.5倍・ほのお0.5倍、にほんばれは その逆
  if (weather === 'rain') {
    if (move.type === 'みず') d = Math.floor(d * 1.5);
    else if (move.type === 'ほのお') d = Math.floor(d * 0.5);
  } else if (weather === 'sun') {
    if (move.type === 'ほのお') d = Math.floor(d * 1.5);
    else if (move.type === 'みず') d = Math.floor(d * 0.5);
  }
  // タイプ強化どうぐ（Phase X-5）: もくたん・じしゃく等、対応タイプの技を1.2倍
  const boost = getItem(attacker.held ?? '')?.hold;
  if (boost?.kind === 'typeBoost' && boost.type === move.type) {
    d = Math.floor(d * (boost.mul ?? 1.2));
  }
  d = Math.floor((d * rng.int(85, 100)) / 100);

  return { dmg: Math.max(1, d), eff, crit };
}

/** 命中判定。accuracy が null の技は必中。 */
export function accuracyCheck(attacker, defender, move, rng) {
  if (move.accuracy == null) return true;
  const acc = attacker.stages?.acc ?? 0;
  const eva = defender.stages?.eva ?? 0;
  const p = move.accuracy * (accMul(acc) / accMul(eva));
  return rng.int(1, 100) <= Math.min(100, p);
}

// ---- 経験値 ----

/**
 * 倒したときに得られる経験値。
 * Gen1/2 系の素直な式。短いゲームなのでこのくらい気前がよいほうが遊べる。
 */
export function expGain(foe, participants = 1, isWild = true) {
  const base = Math.floor((foe.species.baseExp * foe.level) / 7 / Math.max(1, participants));
  return Math.max(1, Math.floor(base * (isWild ? 1 : 1.5)));
}

/** そのレベルに到達するのに必要な累計経験値 */
export function expForLevel(expType, level) {
  const f = CURVE[expType] ?? CURVE.mediumFast;
  return f(Math.max(1, Math.min(MAX_LEVEL, level)));
}

/** 次のレベルまであと何経験値か */
export function expToNext(mon) {
  if (mon.level >= MAX_LEVEL) return 0;
  return expForLevel(mon.species.expType, mon.level + 1) - mon.exp;
}

/** 現在レベル内での進捗（0..1）。EXPバーの表示に使う。 */
export function expRatio(mon) {
  if (mon.level >= MAX_LEVEL) return 1;
  const cur = expForLevel(mon.species.expType, mon.level);
  const next = expForLevel(mon.species.expType, mon.level + 1);
  if (next <= cur) return 1;
  return Math.max(0, Math.min(1, (mon.exp - cur) / (next - cur)));
}

// ---- 捕獲 ----

export const STATUS_CATCH_BONUS = {
  'ねむり': 2, 'こおり': 2, 'まひ': 1.5, 'どく': 1.5, 'やけど': 1.5, 'もうどく': 1.5,
};

/**
 * Gen3/4 の修正 捕獲判定。
 * 戻り値 { caught, shakes } — shakes は 0..4。演出はこの回数ぶん揺らす。
 */
export function catchAttempt(target, ball, rng, charmMul = 1) {
  if (ball.master) return { caught: true, shakes: 4 };

  const statusBonus = STATUS_CATCH_BONUS[target.status] ?? 1;
  const maxHP = target.stats.hp;
  const a = Math.floor(
    Math.floor(
      ((3 * maxHP - 2 * target.curHP) * target.species.catchRate * (ball.ballRate ?? 1) * charmMul)
      / (3 * maxHP),
    ) * statusBonus,
  );

  if (a >= 255) return { caught: true, shakes: 4 };
  if (a <= 0) return { caught: false, shakes: 0 };

  const b = Math.floor(
    1048560 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(Math.floor(16711680 / a))))),
  );

  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (rng.int(0, 65535) >= b) break;
    shakes++;
  }
  return { caught: shakes === 4, shakes };
}

export const CATCH_FAIL_MESSAGE = [
  'あっ！ ポケモンが とびだした！',
  'おしい！ もう ちょっとの ところだったのに！',
  'あーっ！ ポケモンが ボールから でてしまった！',
  'ざんねん！ もう ちょっとの ところだったのに！',
];

// ---- にげる ----

/**
 * 逃走判定。attempts は今の戦闘で「にげる」を選んだ回数（0始まり）。
 */
export function runAway(mySpe, foeSpe, attempts, rng) {
  const f = Math.floor(foeSpe / 4) % 256;
  if (f === 0) return true; // 相手が極端に遅いときは必ず逃げられる
  const odds = Math.floor((mySpe * 32) / f) + 30 * attempts;
  if (odds > 255) return true;
  return rng.int(0, 255) < odds;
}

// ---- 状態異常 ----

export const STATUS_SHORT = {
  'どく': 'どく', 'やけど': 'やけど', 'まひ': 'まひ',
  'ねむり': 'ねむり', 'こおり': 'こおり', 'もうどく': 'もうどく',
};

/**
 * 毎ターン終了時のスリップダメージ。
 * もうどく（Phase X-1）は「かかってからのターン数」を mon.statusTurns に積んでおき
 * （ねむりのカウントダウンと同じ場所を、増える方向で使い回す）、ダメージが毎ターン増えていく。
 */
export function statusEndOfTurnDamage(mon) {
  if (mon.status === 'どく') return Math.max(1, Math.floor(mon.stats.hp / 8));
  if (mon.status === 'もうどく') return Math.max(1, Math.floor((mon.stats.hp * mon.statusTurns) / 16));
  if (mon.status === 'やけど') return Math.max(1, Math.floor(mon.stats.hp / 16));
  return 0;
}

/** 素早さ（まひなら半減、すいすいならあめで2倍、ランク補正込み） */
export function effectiveSpeed(mon, weather = null) {
  let s = statWithStage(mon, 'spe');
  if (mon.status === 'まひ') s = Math.floor(s * 0.5);
  if (mon.species?.ability === 'すいすい' && weather === 'rain') s = Math.floor(s * 2);
  return s;
}
