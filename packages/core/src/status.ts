/**
 * 状態異常。同時に1つのみ。混乱は別枠（volatile）で重複する。
 * 設計: docs/design/battle-system.md §8
 */

import type { Rng } from "./rng.js";
import type { BattlePokemon, StatusId, Type } from "./types.js";

/** そのタイプは該当の状態異常にならない。 */
const IMMUNE_TYPES: Record<StatusId, readonly Type[]> = {
  poison: ["poison", "steel"],
  toxic: ["poison", "steel"],
  paralysis: ["electric"],
  burn: ["fire"],
  sleep: [],
  freeze: ["ice"],
};

export const SLEEP_MIN_TURNS = 1;
export const SLEEP_MAX_TURNS = 3;
export const CONFUSION_MIN_TURNS = 1;
export const CONFUSION_MAX_TURNS = 4;

/** まひの行動不能率。 */
export const PARALYSIS_BLOCK_CHANCE = 0.25;
/** こおりの自然解凍率。 */
export const THAW_CHANCE = 0.2;
/** 混乱時に自分を攻撃する確率。 */
export const CONFUSION_SELF_HIT_CHANCE = 1 / 3;
/** 混乱の自傷は威力40・タイプなしの物理。 */
export const CONFUSION_SELF_HIT_POWER = 40;

export const PARALYSIS_SPEED_MULTIPLIER = 0.5;
export const BURN_ATTACK_MULTIPLIER = 0.5;

export function isImmuneToStatus(pokemon: BattlePokemon, status: StatusId): boolean {
  return IMMUNE_TYPES[status].some((t) => pokemon.types.includes(t));
}

/** 付与できたら true。既に状態異常なら false（重ねがけ不可）。 */
export function applyStatus(
  pokemon: BattlePokemon,
  status: StatusId,
  rng: Rng,
  /** ねむりのターン数の倍率（はやおき = 0.5）。 */
  sleepTurnsMultiplier = 1,
): boolean {
  if (pokemon.status !== null) return false;
  if (isImmuneToStatus(pokemon, status)) return false;

  pokemon.status = status;
  pokemon.statusCounter =
    status === "sleep"
      ? Math.max(1, Math.round(rng.range(SLEEP_MIN_TURNS, SLEEP_MAX_TURNS) * sleepTurnsMultiplier))
      : status === "toxic"
        ? 1
        : 0;
  return true;
}

export function applyConfusion(pokemon: BattlePokemon, rng: Rng): boolean {
  if (pokemon.volatile.confusionTurns > 0) return false;
  pokemon.volatile.confusionTurns = rng.range(CONFUSION_MIN_TURNS, CONFUSION_MAX_TURNS);
  return true;
}

/** ターン終了時のスリップダメージ。0 なら何も起きない。 */
export function residualDamage(pokemon: BattlePokemon): number {
  switch (pokemon.status) {
    case "poison":
      return Math.max(1, Math.floor(pokemon.maxHp / 8));
    case "toxic":
      return Math.max(1, Math.floor((pokemon.maxHp * pokemon.statusCounter) / 16));
    case "burn":
      return Math.max(1, Math.floor(pokemon.maxHp / 16));
    default:
      return 0;
  }
}

/**
 * 交代時のリセット。
 * 状態異常・HP・PP は持ち越し、ランク補正と混乱は消える。
 *
 * もうどくのカウンタは交代でリセットされるが、もうどく自体は解除されない
 * （設計文書 §8 は「通常のどくに戻る」としていたが、原作の挙動はカウンタのみリセット）。
 */
export function onSwitchOut(pokemon: BattlePokemon): void {
  pokemon.statStages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
  pokemon.volatile = {
    confusionTurns: 0,
    flinched: false,
    choiceLocked: null,
    boostedMoveType: null,
  };
  // トレースで書き換わった特性は戻る。持ち物の消費は戻らない。
  pokemon.ability = pokemon.innateAbility;
  if (pokemon.status === "toxic") pokemon.statusCounter = 1;
}
