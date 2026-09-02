/**
 * 経験値とレベル（v0.8）。
 *
 * 成長曲線はテーブルで持つ（progression.md §7）。
 * `core` はテーブルを静的に持たず、`GameData` 経由で受け取る ――
 * 他のマスタデータと同じ扱いにする。
 */

import type { GameData } from "./gamedata.js";
import type { BattlePokemon, ExpType } from "./types.js";

export const MAX_LEVEL = 100;

/** レベル n に到達するのに必要な累計経験値。 */
export function expForLevel(data: GameData, expType: ExpType, level: number): number {
  const table = data.expTable(expType);
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return table[clamped] ?? 0;
}

/** 累計経験値から今のレベルを求める。 */
export function levelForExp(data: GameData, expType: ExpType, exp: number): number {
  const table = data.expTable(expType);
  for (let level = MAX_LEVEL; level >= 1; level -= 1) {
    if (exp >= (table[level] ?? 0)) return level;
  }
  return 1;
}

/** 次のレベルまでの進み具合（0〜1）。UI のゲージに使う。 */
export function expProgress(
  data: GameData,
  expType: ExpType,
  exp: number,
): { level: number; intoLevel: number; needed: number; ratio: number } {
  const level = levelForExp(data, expType, exp);
  if (level >= MAX_LEVEL) return { level, intoLevel: 0, needed: 0, ratio: 1 };
  const base = expForLevel(data, expType, level);
  const next = expForLevel(data, expType, level + 1);
  const needed = next - base;
  const intoLevel = exp - base;
  return { level, intoLevel, needed, ratio: needed === 0 ? 1 : intoLevel / needed };
}

/**
 * 倒した相手からの獲得経験値（第9世代のレベル差スケーリング）。
 *
 * 相手が自分より高レベルなら多く貰える ――
 * 「レベルを上げすぎると効率が落ちる」調整が式の側から自然にかかる。
 */
export function expGain(
  data: GameData,
  options: {
    fainted: BattlePokemon;
    winnerLevel: number;
    /** 野生は ×1、トレーナー戦は ×1.5。 */
    isWild: boolean;
    /** 周回加速（progression.md §7）。殿堂入り地方数で決まる。 */
    multiplier?: number;
  },
): number {
  const species = data.species(options.fainted.species);
  const base = species.baseExp;
  const foeLevel = options.fainted.level;
  const own = options.winnerLevel;

  const flat = (base * foeLevel) / 5;
  const scale = ((2 * foeLevel + 10) / (foeLevel + own + 10)) ** 2.5;
  const trainer = options.isWild ? 1 : 1.5;

  return Math.max(1, Math.floor(flat * scale * trainer * (options.multiplier ?? 1)));
}
