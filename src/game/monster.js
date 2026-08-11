// 個体（手持ちの1匹）の生成・成長・シリアライズ。
//
// 大原則: 導出できる値はセーブに入れない。
// maxHP も atk も、ロード時に必ず種族値と個体値から計算し直す。
// おかげで計算式のバグを直すと既存のセーブにも自動で反映される。

import { getSpecies, movesAtLevel } from '../data/species.js';
import { getMove } from '../data/moves.js';
import { calcAllStats, expForLevel, emptyEVs, addEV, evYield } from './formulas.js';
import { NATURES, getNature } from '../data/natures.js';
import { levelFromExp, MAX_LEVEL } from '../data/growth.js';
import { rng as defaultRng } from '../core/rng.js';

export const MAX_MOVES = 4;

function rollIVs(rng) {
  return {
    hp: rng.int(0, 31), atk: rng.int(0, 31), def: rng.int(0, 31),
    spa: rng.int(0, 31), spd: rng.int(0, 31), spe: rng.int(0, 31),
  };
}

export function emptyStages() {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
}

/**
 * 種族から導ける値を個体に生やす。
 * types を実体としてコピーすると進化のたびに更新し忘れる余地が生まれるので、
 * 常に species を見に行く getter にしておく。列挙不可なのでセーブにも漏れない。
 */
function defineDerived(m) {
  Object.defineProperty(m, 'types', {
    get() { return this.species.types; },
    enumerable: false,
    configurable: true,
  });
  // せいかく も id から引き直す。実体を持つと進化やロードで食い違う。
  Object.defineProperty(m, 'nature', {
    get() { return getNature(this.natureId); },
    enumerable: false,
    configurable: true,
  });
  return m;
}

/** 野生／もらいもの の個体をひとつ作る */
export function createMonster(speciesId, level, opt = {}) {
  const rng = opt.rng ?? defaultRng;
  const species = getSpecies(speciesId);
  if (!species) throw new Error(`未知の種族 id: ${speciesId}`);

  const ivs = opt.ivs ?? rollIVs(rng);
  const evs = opt.evs ?? emptyEVs();
  const natureId = opt.natureId ?? rng.int(0, NATURES.length - 1);
  const stats = calcAllStats(species.base, ivs, level, evs, getNature(natureId));
  const moves = (opt.moves ?? movesAtLevel(species, level))
    .filter((m) => getMove(m))
    .map((m) => ({ id: m, pp: getMove(m).pp, maxPp: getMove(m).pp }));

  // 技を1つも覚えていない状態は作らない（詰みを防ぐ保険）
  if (!moves.length) moves.push({ id: 'たいあたり', pp: getMove('たいあたり').pp, maxPp: getMove('たいあたり').pp });

  return defineDerived({
    species,
    nick: opt.nick ?? null,
    level,
    exp: expForLevel(species.expType, level),
    ivs,
    evs,
    natureId,
    stats,
    curHP: opt.curHP ?? stats.hp,
    status: opt.status ?? null,
    statusTurns: 0,
    volatile: {},          // こんらん・ひるみ など、交代で消えるもの
    stages: emptyStages(),
    moves,
    metLv: opt.metLv ?? level,
    metMap: opt.metMap ?? null,
    held: opt.held ?? null,
    evoDeclined: false,
    evoLocked: false,
  });
}

export const displayName = (m) => m.nick ?? m.species.name;
export const isFainted = (m) => m.curHP <= 0;
export const hpRatio = (m) => (m.stats.hp > 0 ? m.curHP / m.stats.hp : 0);

/** 戦闘から出したときに消えるものを片付ける */
export function resetBattleState(m) {
  m.stages = emptyStages();
  m.volatile = {};
}

export function heal(m, amount) {
  const before = m.curHP;
  m.curHP = Math.min(m.stats.hp, m.curHP + amount);
  return m.curHP - before;
}

/**
 * どうぐ使用が効果を持つかどうかだけを判定する（変化させない）。
 * 効かないなら理由の文字列、効くなら null。
 * バトル中は「選んだ時点」でこれだけ呼び、実際の適用はターンの実行時に行う
 * （そうしないと HP バーの表示がどうぐ使用の直後ではなく次に何か動くまで遅れる）。
 */
export function itemUseError(m, use) {
  switch (use.kind) {
    case 'heal':
      if (m.curHP <= 0) return `${displayName(m)}は ひんしだ！`;
      if (m.curHP >= m.stats.hp) return 'HPは まんたんだ！';
      return null;
    case 'cure': {
      const match = use.status === 'all' ? !!m.status : m.status === use.status;
      return match ? null : 'それを つかっても いみが なさそうだ。';
    }
    case 'revive':
      return m.curHP > 0 ? 'それを つかっても いみが なさそうだ。' : null;
    case 'pp':
      return m.moves.some((mv) => mv.pp < mv.maxPp) ? null : 'PPは まんたんだ！';
    default:
      return null;
  }
}

/** どうぐを実際に適用する。{ ok, message } を返す。 */
export function applyItemUse(m, use) {
  const err = itemUseError(m, use);
  if (err) return { ok: false, message: err };

  switch (use.kind) {
    case 'heal': {
      const amount = use.amount === 'full' ? m.stats.hp : use.amount;
      const got = heal(m, amount);
      return { ok: true, message: `${displayName(m)}の HPが ${got} かいふくした！` };
    }
    case 'cure':
      m.status = null;
      m.statusTurns = 0;
      return { ok: true, message: `${displayName(m)}の じょうたいが なおった！` };
    case 'revive':
      m.curHP = Math.max(1, Math.floor(m.stats.hp * (use.ratio ?? 0.5)));
      return { ok: true, message: `${displayName(m)}は げんきを とりもどした！` };
    case 'pp':
      for (const mv of m.moves) mv.pp = use.amount === 'full' ? mv.maxPp : Math.min(mv.maxPp, mv.pp + use.amount);
      return { ok: true, message: `${displayName(m)}の PPが かいふくした！` };
    default:
      return { ok: false, message: 'それを つかっても いみが なさそうだ。' };
  }
}

export function fullHeal(m) {
  m.curHP = m.stats.hp;
  m.status = null;
  m.statusTurns = 0;
  m.volatile = {};
  for (const mv of m.moves) mv.pp = mv.maxPp;
}

export function damageMon(m, amount) {
  const before = m.curHP;
  m.curHP = Math.max(0, m.curHP - amount);
  return before - m.curHP;
}

/**
 * ステータスを今のレベルで計算し直す。
 * レベルアップ時は maxHP の増加ぶんだけ現在HPも増やす（全回復はしない＝本家挙動）。
 */
export function recalcStats(m, { carryHP = true } = {}) {
  const oldMax = m.stats.hp;
  const next = calcAllStats(m.species.base, m.ivs, m.level, m.evs, m.nature);
  const gain = {};
  for (const k of Object.keys(next)) gain[k] = next[k] - m.stats[k];
  m.stats = next;
  if (carryHP) m.curHP = Math.max(1, Math.min(next.hp, m.curHP + (next.hp - oldMax)));
  else m.curHP = Math.min(m.curHP, next.hp);
  return gain;
}

/**
 * そだてや。歩いた歩数ぶんだけ経験値を入れる。
 * レベルが上がったら技も覚える（4つ埋まっていたら古いものから押し出す ――
 * 預けっぱなしなので、忘れる技を選ばせる画面を出せないため）。
 */
export function raiseBySteps(entry, steps) {
  const m = entry.mon;
  if (m.level >= MAX_LEVEL) return 0;

  let levels = 0;
  m.exp += steps;
  while (m.level < MAX_LEVEL && m.exp >= expForLevel(m.species.expType, m.level + 1)) {
    m.level++;
    levels++;
    recalcStats(m);
    for (const move of movesLearnedAt(m.species, m.level)) {
      if (knowsMove(m, move)) continue;
      if (m.moves.length < MAX_MOVES) learnMove(m, move);
      else replaceMove(m, 0, move);
    }
  }
  if (levels) fullHeal(m);
  return levels;
}

/** そのレベルで新しく覚える技の名前一覧 */
export function movesLearnedAt(species, level) {
  return species.learnset.filter((e) => e.lv === level).map((e) => e.move).filter((m) => getMove(m));
}

export function knowsMove(m, moveId) {
  return m.moves.some((mv) => mv.id === moveId);
}

/** 技を覚える。空きがなければ false を返し、呼び出し側に判断を委ねる。 */
export function learnMove(m, moveId) {
  const def = getMove(moveId);
  if (!def || knowsMove(m, moveId)) return false;
  if (m.moves.length >= MAX_MOVES) return false;
  m.moves.push({ id: moveId, pp: def.pp, maxPp: def.pp });
  return true;
}

/** slot 番目の技を moveId で置き換える */
export function replaceMove(m, slot, moveId) {
  const def = getMove(moveId);
  if (!def) return false;
  m.moves[slot] = { id: moveId, pp: def.pp, maxPp: def.pp };
  return true;
}

/** 進化先の種族 id。条件を満たしていなければ null。 */
export function evolutionTarget(m, trigger = 'level', item = null) {
  const evo = m.species.evolution;
  if (!evo) return null;
  if (trigger === 'level' && evo.method === 'level' && m.level >= evo.level) return evo.to;
  if (trigger === 'stone' && evo.method === 'stone' && evo.item === item) return evo.to;
  return null;
}

/** 実際に進化させる。HP の割合は維持する。 */
export function evolve(m, toId) {
  const next = getSpecies(toId);
  if (!next) return false;
  const ratio = hpRatio(m);
  m.species = next;
  const stats = calcAllStats(next.base, m.ivs, m.level);
  m.stats = stats;
  m.curHP = Math.max(1, Math.round(stats.hp * ratio));
  return true;
}

// ---- セーブ ----

export function serialize(m) {
  return {
    id: m.species.id,
    nick: m.nick,
    lv: m.level,
    exp: m.exp,
    ivs: { ...m.ivs },
    evs: { ...m.evs },
    natureId: m.natureId,
    curHP: m.curHP,
    status: m.status,
    statusTurns: m.statusTurns,
    moves: m.moves.map((mv) => ({ id: mv.id, pp: mv.pp })),
    metLv: m.metLv,
    metMap: m.metMap,
    held: m.held ?? null,
    evoDeclined: m.evoDeclined || undefined,
    evoLocked: m.evoLocked || undefined,
  };
}

/**
 * セーブから復元する。
 * 未知の種族・技はゲームを落とさずに捨てる（手で編集されたセーブでも起動できるように）。
 */
export function hydrate(save) {
  const species = getSpecies(save.id);
  if (!species) {
    console.warn(`[monster] 未知の種族 id ${save.id} をスキップしました`);
    return null;
  }

  const level = Math.max(1, Math.min(MAX_LEVEL, save.lv ?? levelFromExp(species.expType, save.exp ?? 0)));
  const ivs = save.ivs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  // 古いセーブには努力値も せいかく も無い。0 と「がんばりや」（補正なし）に
  // 落ちるので、これまでの個体のステータスはそのまま変わらない。
  const evs = { ...emptyEVs(), ...(save.evs ?? {}) };
  const natureId = Number.isInteger(save.natureId) ? save.natureId : 0;
  const stats = calcAllStats(species.base, ivs, level, evs, getNature(natureId));

  const moves = (save.moves ?? [])
    .filter((mv) => {
      if (getMove(mv.id)) return true;
      console.warn(`[monster] 未知の技 ${mv.id} をスキップしました`);
      return false;
    })
    .slice(0, MAX_MOVES)
    .map((mv) => {
      const def = getMove(mv.id);
      return { id: mv.id, pp: Math.max(0, Math.min(def.pp, mv.pp ?? def.pp)), maxPp: def.pp };
    });

  if (!moves.length) {
    for (const name of movesAtLevel(species, level)) {
      const def = getMove(name);
      if (def) moves.push({ id: name, pp: def.pp, maxPp: def.pp });
    }
    if (!moves.length) {
      const def = getMove('たいあたり');
      moves.push({ id: 'たいあたり', pp: def.pp, maxPp: def.pp });
    }
  }

  return defineDerived({
    species,
    nick: save.nick ?? null,
    level,
    exp: save.exp ?? expForLevel(species.expType, level),
    ivs,
    evs,
    natureId,
    stats,
    curHP: Math.max(0, Math.min(stats.hp, save.curHP ?? stats.hp)),
    status: save.status ?? null,
    statusTurns: save.statusTurns ?? 0,
    volatile: {},
    stages: emptyStages(),
    moves,
    metLv: save.metLv ?? level,
    metMap: save.metMap ?? null,
    held: save.held ?? null,
    evoDeclined: save.evoDeclined ?? false,
    evoLocked: save.evoLocked ?? false,
  });
}
