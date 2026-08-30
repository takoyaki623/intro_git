/**
 * ダメージ計算（第9世代準拠）と命中判定。
 * 設計: docs/design/battle-system.md §4・§5・§7
 */

import type { GameData } from "./gamedata.js";
import {
  accuracyMultiplier as heldAccuracyMultiplier,
  attackMultiplier,
  blocksCrit,
  critStageBonus,
  defendMultiplier,
  ignoresBurnPenalty,
  statMultiplier,
} from "./held.js";
import type { Rng } from "./rng.js";
import { accuracyStageMultiplier, clampStage, effectiveStat } from "./stages.js";
import { BURN_ATTACK_MULTIPLIER } from "./status.js";
import { effectivenessAgainst } from "./typechart.js";
import type { BattlePokemon, Effectiveness, Move, ScreenId, Type, WeatherId } from "./types.js";

/** 急所ランク → 発生確率。 */
const CRIT_CHANCE_BY_STAGE = [1 / 24, 1 / 8, 1 / 2, 1] as const;
const CRIT_MULTIPLIER = 1.5;
const STAB_MULTIPLIER = 1.5;
/** リフレクター・ひかりのかべ の軽減率（1対1なので半分）。 */
const SCREEN_MULTIPLIER = 0.5;

export function critChance(stage: number): number {
  const i = Math.max(0, Math.min(stage, CRIT_CHANCE_BY_STAGE.length - 1));
  return CRIT_CHANCE_BY_STAGE[i]!;
}

/**
 * 命中判定。
 * 実効命中率 = 技の命中率 × 命中ランク補正(命中ランク − 回避ランク)
 */
export function rollAccuracy(
  data: GameData,
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  rng: Rng,
): boolean {
  if (move.accuracy === null) return true;
  const combined = clampStage(
    attacker.statStages.accuracy - defender.statStages.evasion,
  );
  const chance =
    (move.accuracy / 100) *
    accuracyStageMultiplier(combined) *
    heldAccuracyMultiplier(data, attacker);
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
/**
 * 天気による威力の倍率（v1.2-c）。
 *
 * **表にしない。** 4つしか無く、効くのは2つだけ ――
 * 表にすると「効かない2つ」を空欄で書くことになり、
 * 書き忘れと見分けが付かなくなる。
 */
export function weatherMultiplier(weather: WeatherId | null, moveType: Type): number {
  if (weather === "sun") {
    if (moveType === "fire") return 1.5;
    if (moveType === "water") return 0.5;
  }
  if (weather === "rain") {
    if (moveType === "water") return 1.5;
    if (moveType === "fire") return 0.5;
  }
  return 1;
}

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
    /**
     * 場の天気（v1.2-c）。**`BattleState` は渡さない** ――
     * ここが状態の全部を見られるようにすると、次に何を足しても
     * 「ダメージ計算が知っていること」が増え続ける。要るのは天気だけ。
     */
    weather?: WeatherId | null;
    /**
     * **受ける側**に張られている壁（v1.2-c）。
     * どちらの側のものかを間違えないよう、渡すのは防御側の分だけ。
     */
    screens?: readonly ScreenId[];
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

  // 特性・持ち物は急所ランクを上げることも、急所そのものを封じることもある。
  // 封じられる場合も抽選は行う ―― 乱数の消費数を特性の有無で変えないため。
  const critStage = (move.critStage ?? 0) + critStageBonus(data, attacker);
  const rolledCrit = opts.forceCritical ?? rng.chance(critChance(critStage));
  const critical = rolledCrit && !blocksCrit(data, defender);

  const physical = move.category === "physical";

  // 急所は「相手の防御上昇」と「自分の攻撃下降」を無視する
  const aStat = physical ? "atk" : "spa";
  const dStat = physical ? "def" : "spd";
  const a = Math.floor(
    effectiveStat(attacker, aStat, { ignoreDrop: critical }) *
      statMultiplier(data, attacker, aStat),
  );
  const d = Math.floor(
    effectiveStat(defender, dStat, { ignoreBoost: critical }) *
      statMultiplier(data, defender, dStat),
  );

  let dmg =
    Math.floor(
      Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * power * a) / d) / 50,
    ) + 2;

  // 3. 急所
  if (critical) dmg = Math.floor(dmg * CRIT_MULTIPLIER);

  // 3.5 壁（v1.2-c）。**急所は壁を貫く**（原作どおり）ので、急所の段のすぐ後ろ。
  //
  // リフレクター は物理を、ひかりのかべ は特殊を半分にする。
  // しんぴのまもり はダメージに効かない ―― ここに書くことは無い。
  const wall: ScreenId = physical ? "reflect" : "lightScreen";
  if (!critical && !opts.typeless && opts.screens?.includes(wall)) {
    dmg = Math.floor(dmg * SCREEN_MULTIPLIER);
  }

  // 4. 乱数 85〜100
  const roll = opts.forceRandom ?? rng.range(85, 100);
  dmg = Math.floor((dmg * roll) / 100);

  // 5. タイプ一致
  if (!opts.typeless && attacker.types.includes(move.type)) {
    dmg = Math.floor(dmg * STAB_MULTIPLIER);
  }

  // 6. タイプ相性
  dmg = Math.floor(dmg * effectiveness);

  // 7. やけど（物理技のみ。こんじょう等は無視する）
  if (attacker.status === "burn" && physical && !ignoresBurnPenalty(data, attacker)) {
    dmg = Math.floor(dmg * BURN_ATTACK_MULTIPLIER);
  }

  // 7.5 天気（v1.2-c）。**タイプ一致や相性と同じ「掛ける」段**に置く。
  //
  // にほんばれ は ほのお を1.5倍・みず を半分、あまごい はその逆。
  // すなあらし と あられ は威力を変えない（削るのはターン終了時）。
  const weatherRatio = weatherMultiplier(opts.weather ?? null, move.type);
  if (!opts.typeless && weatherRatio !== 1) dmg = Math.floor(dmg * weatherRatio);

  // 8. その他（持ち物・特性）
  if (!opts.typeless) {
    dmg = Math.floor(dmg * attackMultiplier(data, attacker, move, effectiveness));
    dmg = Math.floor(dmg * defendMultiplier(data, defender, move, effectiveness));
  }

  return { damage: Math.max(1, dmg), effectiveness, critical };
}
