/**
 * ダメージ計算（第9世代準拠）。
 * 設計: docs/design/battle-system.md §4・§7
 */

import type { GameData } from "./gamedata.js";
import type { Rng } from "./rng.js";
import { effectivenessAgainst } from "./typechart.js";
import type { BattlePokemon, Effectiveness, Move } from "./types.js";

/** 急所ランク → 発生確率の分母。v0.1 はランク0固定。 */
const CRIT_CHANCE_BY_STAGE = [1 / 24, 1 / 8, 1 / 2, 1] as const;
const CRIT_MULTIPLIER = 1.5;
const STAB_MULTIPLIER = 1.5;

export function critChance(stage: number): number {
  const i = Math.max(0, Math.min(stage, CRIT_CHANCE_BY_STAGE.length - 1));
  return CRIT_CHANCE_BY_STAGE[i]!;
}

export type DamageResult = {
  damage: number;
  effectiveness: Effectiveness;
  critical: boolean;
};

/**
 * base = floor(floor(floor(2*Lv/5 + 2) * 威力 * A / D) / 50) + 2
 *
 * 補正は設計 §4 の順で適用する。v0.1 では 複数対象・天候・やけどは対象外。
 */
export function calcDamage(
  data: GameData,
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  rng: Rng,
  opts: {
    forceCritical?: boolean;
    forceRandom?: number;
    /** わるあがきはタイプの影響を受けない（相性もタイプ一致も無し）。 */
    typeless?: boolean;
  } = {},
): DamageResult {
  if (move.power === null || move.category === "status") {
    return { damage: 0, effectiveness: 1, critical: false };
  }

  const effectiveness: Effectiveness = opts.typeless
    ? 1
    : effectivenessAgainst(data.typeChart, move.type, defender.types);
  if (effectiveness === 0) {
    return { damage: 0, effectiveness: 0, critical: false };
  }

  const physical = move.category === "physical";
  const a = physical ? attacker.stats.atk : attacker.stats.spa;
  const d = physical ? defender.stats.def : defender.stats.spd;

  let dmg =
    Math.floor(
      Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * move.power * a) / d) / 50,
    ) + 2;

  // 3. 急所
  const critical = opts.forceCritical ?? rng.chance(critChance(0));
  if (critical) dmg = Math.floor(dmg * CRIT_MULTIPLIER);

  // 4. 乱数 85〜100（16段階の整数）
  const roll = opts.forceRandom ?? rng.range(85, 100);
  dmg = Math.floor((dmg * roll) / 100);

  // 5. タイプ一致
  if (!opts.typeless && attacker.types.includes(move.type)) {
    dmg = Math.floor(dmg * STAB_MULTIPLIER);
  }

  // 6. タイプ相性
  dmg = Math.floor(dmg * effectiveness);

  // 最低1（相性0倍は上で返している）
  return { damage: Math.max(1, dmg), effectiveness, critical };
}
