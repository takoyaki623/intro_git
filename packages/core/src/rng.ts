/**
 * シード固定の疑似乱数（xorshift32）。
 *
 * core 内で Math.random() を呼ぶことを禁じ、乱数の消費を1箇所に集約する。
 * BattleState が状態を保持するため、同じ状態・同じ入力なら必ず同じ結果になる。
 * 設計: docs/design/battle-system.md §10
 */

import type { RngState } from "./types.js";

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [0, maxExclusive) の整数 */
  int(maxExclusive: number): number;
  /** [min, max] の整数（両端を含む） */
  range(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** 現在の内部状態。BattleState へ書き戻す。 */
  state(): RngState;
}

export function createRngState(seed: number): RngState {
  // 0 は xorshift の不動点なので避ける
  const s = seed >>> 0;
  return { s: s === 0 ? 0x9e3779b9 : s, calls: 0 };
}

export function createRng(initial: RngState): Rng {
  let s = initial.s >>> 0;
  let calls = initial.calls;

  const nextUint32 = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    calls++;
    return s;
  };

  const rng: Rng = {
    next: () => nextUint32() / 0x1_0000_0000,
    int: (maxExclusive) => {
      if (maxExclusive <= 0) throw new RangeError("maxExclusive must be > 0");
      return nextUint32() % maxExclusive;
    },
    range: (min, max) => {
      if (max < min) throw new RangeError("max must be >= min");
      return min + rng.int(max - min + 1);
    },
    chance: (probability) => rng.next() < probability,
    pick: (items) => {
      if (items.length === 0) throw new RangeError("cannot pick from empty array");
      return items[rng.int(items.length)]!;
    },
    state: () => ({ s, calls }),
  };

  return rng;
}
