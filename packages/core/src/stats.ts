/**
 * 実数値の計算。
 * 設計: docs/design/progression.md §2
 */

import type { GameData } from "./gamedata.js";
import type { NatureId, Species, StatId, StatSpread } from "./types.js";
import { STATS } from "./types.js";

/** HP = floor((2*種族値 + 個体値 + floor(努力値/4)) * Lv/100) + Lv + 10 */
export function calcHp(base: number, iv: number, ev: number, level: number): number {
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

/** その他 = floor((floor((2*種族値 + 個体値 + floor(努力値/4)) * Lv/100) + 5) * 性格補正) */
export function calcStat(
  base: number,
  iv: number,
  ev: number,
  level: number,
  natureMod: number,
): number {
  const inner = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(inner * natureMod);
}

export function natureMultiplier(
  data: GameData,
  nature: NatureId | undefined,
  stat: StatId,
): number {
  if (stat === "hp" || nature === undefined) return 1;
  const n = data.nature(nature);
  if (n.increased === stat && n.decreased !== stat) return 1.1;
  if (n.decreased === stat && n.increased !== stat) return 0.9;
  return 1;
}

export function calcAllStats(
  data: GameData,
  species: Species,
  level: number,
  ivs: StatSpread,
  evs: StatSpread,
  nature: NatureId | undefined,
): StatSpread {
  const out = {} as StatSpread;
  for (const stat of STATS) {
    const base = species.baseStats[stat];
    out[stat] =
      stat === "hp"
        ? calcHp(base, ivs[stat], evs[stat], level)
        : calcStat(base, ivs[stat], evs[stat], level, natureMultiplier(data, nature, stat));
  }
  return out;
}

export const ZERO_STATS: StatSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
export const MAX_IVS: StatSpread = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
