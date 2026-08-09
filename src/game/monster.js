// 個体（手持ちの1匹）の生成・成長・シリアライズ。
//
// 大原則: 導出できる値はセーブに入れない。
// maxHP も atk も、ロード時に必ず種族値と個体値から計算し直す。
// おかげで計算式のバグを直すと既存のセーブにも自動で反映される。

import { getSpecies, movesAtLevel } from '../data/species.js';
import { getMove } from '../data/moves.js';
import { calcAllStats, expForLevel } from './formulas.js';
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
  return m;
}

/** 野生／もらいもの の個体をひとつ作る */
export function createMonster(speciesId, level, opt = {}) {
  const rng = opt.rng ?? defaultRng;
  const species = getSpecies(speciesId);
  if (!species) throw new Error(`未知の種族 id: ${speciesId}`);

  const ivs = opt.ivs ?? rollIVs(rng);
  const stats = calcAllStats(species.base, ivs, level);
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
    stats,
    curHP: opt.curHP ?? stats.hp,
    status: opt.status ?? null,
    statusTurns: 0,
    volatile: {},          // こんらん・ひるみ など、交代で消えるもの
    stages: emptyStages(),
    moves,
    metLv: opt.metLv ?? level,
    metMap: opt.metMap ?? null,
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
  const next = calcAllStats(m.species.base, m.ivs, m.level);
  const gain = {};
  for (const k of Object.keys(next)) gain[k] = next[k] - m.stats[k];
  m.stats = next;
  if (carryHP) m.curHP = Math.max(1, Math.min(next.hp, m.curHP + (next.hp - oldMax)));
  else m.curHP = Math.min(m.curHP, next.hp);
  return gain;
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
    curHP: m.curHP,
    status: m.status,
    statusTurns: m.statusTurns,
    moves: m.moves.map((mv) => ({ id: mv.id, pp: mv.pp })),
    metLv: m.metLv,
    metMap: m.metMap,
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
  const stats = calcAllStats(species.base, ivs, level);

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
    stats,
    curHP: Math.max(0, Math.min(stats.hp, save.curHP ?? stats.hp)),
    status: save.status ?? null,
    statusTurns: save.statusTurns ?? 0,
    volatile: {},
    stages: emptyStages(),
    moves,
    metLv: save.metLv ?? level,
    metMap: save.metMap ?? null,
  });
}
