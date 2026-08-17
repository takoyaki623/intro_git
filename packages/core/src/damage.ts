/**
 * ダメージ計算（第9世代準拠）と命中判定。
 * 設計: docs/design/battle-system.md §4・§5・§7
 */

import type { GameData } from "./gamedata.js";
import type { Rng } from "./rng.js";
import { accuracyStageMultiplier, clampStage, effectiveStat } from "./stages.js";
import { BURN_ATTACK_MULTIPLIER } from "./status.js";
import { effectivenessAgainst } from "./typechart.js";
import type { BattlePokemon, Effectiveness, Move } from "./types.js";

/** 急所ランク → 発生確率。 */
const CRIT_CHANCE_BY_STAGE = [1 / 24, 1 / 8, 1 / 2, 1] as const;
const CRIT_MULTIPLIER = 1.5;
const STAB_MULTIPLIER = 1.5;

export function critChance(stage: number): number {
  const i = Math.max(0, Math.min(stage, CRIT_CHANCE_BY_STAGE.length - 1));
  return CRIT_CHANCE_BY_STAGE[i]!;
}

/**
 * 命中判定。
 * 実効命中率 = 技の命中率 × 命中ランク補正(命中ランク − 回避ランク)
 */
export function rollAccuracy(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  rng: Rng,
): boolean {
  if (move.accuracy === null) return true;
  const combined = clampStage(
    attacker.statStages.accuracy - defender.statStages.evasion,
  );
  const chance = (move.accuracy / 100) * accuracyStageMultiplier(combined);
  return rng.chance(chance);
}

export type DamageResult = {
  damage: number;
  effectiveness: Effectiveness;
  critical: boolean;
};

/**
 * base = floor(floor(floor(2*Lv/5 + 2) * 威力 * A / D) / 50) + 2
 *
 * 補正は設計 §4 の順で適用する。v0.2 では 複数対象・天候は対象外。
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
    /** わるあがき・混乱の自傷はタイプの影響を受けない。 */
    typeless?: boolean;
    /** 威力の上書き（混乱の自傷など）。 */
    powerOverride?: number;
  } = {},
): DamageResult {
  const power = opts.powerOverride ?? move.power;
  if (power === null || move.category === "status") {
    return { damage: 0, effectiveness: 1, critical: false };
  }

  const effectiveness: Effectiveness = opts.typeless
    ? 1
    : effectivenessAgainst(data.typeChart, move.type, defender.types);
  if (effectiveness === 0) {
    return { damage: 0, effectiveness: 0, critical: false };
  }

  const critical =
    opts.forceCritical ?? rng.chance(critChance(move.critStage ?? 0));

  const physical = move.category === "physical";

  // 急所は「相手の防御上昇」と「自分の攻撃下降」を無視する
  const a = effectiveStat(attacker, physical ? "atk" : "spa", {
    ignoreDrop: critical,
  });
  const d = effectiveStat(defender, physical ? "def" : "spd", {
    ignoreBoost: critical,
  });

  let dmg =
    Math.floor(
      Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * power * a) / d) / 50,
    ) + 2;

  // 3. 急所
  if (critical) dmg = Math.floor(dmg * CRIT_MULTIPLIER);

  // 4. 乱数 85〜100
  const roll = opts.forceRandom ?? rng.range(85, 100);
  dmg = Math.floor((dmg * roll) / 100);

  // 5. タイプ一致
  if (!opts.typeless && attacker.types.includes(move.type)) {
    dmg = Math.floor(dmg * STAB_MULTIPLIER);
  }

  // 6. タイプ相性
  dmg = Math.floor(dmg * effectiveness);

  // 7. やけど（物理技のみ）
  if (attacker.status === "burn" && physical) {
    dmg = Math.floor(dmg * BURN_ATTACK_MULTIPLIER);
  }

  return { damage: Math.max(1, dmg), effectiveness, critical };
}
