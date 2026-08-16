/**
 * タイプ相性。表は data 側が持ち、core は参照するだけ。
 * 設計: docs/design/battle-system.md §4
 */

import type { Effectiveness, Type, TypeChart } from "./types.js";
import { TYPES } from "./types.js";

/** 攻撃タイプ 1つ vs 防御タイプ 1つ */
export function typeMultiplier(chart: TypeChart, attack: Type, defend: Type): number {
  return chart[attack][defend];
}

/** 複合タイプは掛け合わせる。最大4倍・最小0.25倍、無効は0。 */
export function effectivenessAgainst(
  chart: TypeChart,
  attack: Type,
  defenders: readonly Type[],
): Effectiveness {
  let mult = 1;
  for (const d of defenders) mult *= typeMultiplier(chart, attack, d);
  return mult as Effectiveness;
}

/** 18×18 が欠けなく埋まっていることを検証する（検証項目 #2 の実体）。 */
export function assertCompleteTypeChart(chart: TypeChart): void {
  for (const atk of TYPES) {
    const row = chart[atk];
    if (row === undefined) throw new Error(`type chart missing row: ${atk}`);
    for (const def of TYPES) {
      const v = row[def];
      if (typeof v !== "number") throw new Error(`type chart missing cell: ${atk} -> ${def}`);
      if (![0, 0.5, 1, 2].includes(v)) {
        throw new Error(`type chart invalid value at ${atk} -> ${def}: ${v}`);
      }
    }
  }
}
