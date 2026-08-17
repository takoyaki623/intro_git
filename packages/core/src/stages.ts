/**
 * 能力ランク補正（-6 〜 +6）。
 * 攻撃系と 命中/回避 で倍率表が異なる。
 * 設計: docs/design/battle-system.md §6
 */

import type { BattlePokemon, StagedStat, StatStages } from "./types.js";

export const MIN_STAGE = -6;
export const MAX_STAGE = 6;

/** 攻撃・防御・特攻・特防・素早さ: n>=0 → (2+n)/2 、n<0 → 2/(2+|n|) */
export function battleStageMultiplier(stage: number): number {
  const n = clampStage(stage);
  return n >= 0 ? (2 + n) / 2 : 2 / (2 - n);
}

/** 命中・回避: n>=0 → (3+n)/3 、n<0 → 3/(3+|n|) */
export function accuracyStageMultiplier(stage: number): number {
  const n = clampStage(stage);
  return n >= 0 ? (3 + n) / 3 : 3 / (3 - n);
}

export function clampStage(stage: number): number {
  return Math.max(MIN_STAGE, Math.min(MAX_STAGE, stage));
}

export function multiplierFor(stat: StagedStat, stages: StatStages): number {
  const stage = stages[stat];
  return stat === "accuracy" || stat === "evasion"
    ? accuracyStageMultiplier(stage)
    : battleStageMultiplier(stage);
}

/**
 * ランク補正を適用した実効値。
 * ignoreBoost / ignoreDrop は急所の仕様（相手の防御上昇と自分の攻撃下降を無視）に使う。
 */
export function effectiveStat(
  pokemon: BattlePokemon,
  stat: "atk" | "def" | "spa" | "spd" | "spe",
  opts: { ignoreBoost?: boolean; ignoreDrop?: boolean } = {},
): number {
  let stage = pokemon.statStages[stat];
  if (opts.ignoreBoost === true && stage > 0) stage = 0;
  if (opts.ignoreDrop === true && stage < 0) stage = 0;
  return Math.floor(pokemon.stats[stat] * battleStageMultiplier(stage));
}

/**
 * ランクを変化させる。実際に動いた量を返す（0 なら「これ以上さがらない/あがらない」）。
 */
export function applyStageChange(
  pokemon: BattlePokemon,
  stat: StagedStat,
  delta: number,
): { applied: number; stage: number } {
  const before = pokemon.statStages[stat];
  const after = clampStage(before + delta);
  pokemon.statStages[stat] = after;
  return { applied: after - before, stage: after };
}
