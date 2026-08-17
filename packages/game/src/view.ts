/**
 * バトル画面の表示状態。
 *
 * 重要: この層は BattleState を毎ターン覗きにいかない。
 * core が返す BattleEvent を順に適用して、自分の表示状態を更新する。
 * これにより「演出を飛ばしても結果が変わらない」ことが構造的に保証される。
 * 設計: docs/design/ui-flow.md §4
 */

import type {
  AbilityId,
  BattleEvent,
  BattleState,
  ItemId,
  SideIndex,
  StatusId,
  Type,
} from "@pkmn/core";
import { activeOf } from "@pkmn/core";

export type SideView = {
  partyIndex: number;
  name: string;
  level: number;
  types: readonly Type[];
  hp: number;
  maxHp: number;
  status: StatusId | null;
  stages: Record<string, number>;
  remaining: number;
  /** 発動して初めて見えるので、既定は null（相手の持ち物は伏せられている）。 */
  ability: AbilityId | null;
  item: ItemId | null;
};

export type BattleView = [SideView, SideView];

export function viewFromState(state: BattleState): BattleView {
  const build = (side: SideIndex): SideView => {
    const p = activeOf(state, side);
    return {
      partyIndex: state.sides[side].activeIndex,
      name: p.name,
      level: p.level,
      types: p.types,
      hp: p.currentHp,
      maxHp: p.maxHp,
      status: p.status,
      stages: { ...p.statStages },
      remaining: state.sides[side].party.filter((m) => m.currentHp > 0).length,
      // 自分の特性・持ち物は最初から見える。相手のは発動して初めて見える
      ability: side === 0 ? p.ability : null,
      item: side === 0 && !p.itemConsumed ? p.item : null,
    };
  };
  return [build(0), build(1)];
}

/**
 * イベントを1件だけ表示状態に反映する。
 * 名前・HP・状態異常の変化はすべてイベント経由で伝わる。
 */
export function applyEvent(view: BattleView, state: BattleState, event: BattleEvent): void {
  switch (event.kind) {
    case "switchIn": {
      const p = state.sides[event.side].party[event.partyIndex]!;
      const v = view[event.side];
      v.partyIndex = event.partyIndex;
      v.name = p.name;
      v.level = p.level;
      v.types = p.types;
      v.maxHp = p.maxHp;
      v.hp = p.currentHp;
      v.status = p.status;
      v.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      v.ability = event.side === 0 ? p.ability : null;
      v.item = event.side === 0 && !p.itemConsumed ? p.item : null;
      break;
    }
    case "damage":
    case "recoil":
    case "drain":
    case "heal":
    case "statusDamage":
    case "confusionHit":
    case "itemDamage":
      view[event.side].hp = event.remainingHp;
      break;
    // 相手の特性・持ち物は、発動して初めて分かる
    case "ability":
    case "abilityChanged":
      view[event.side].ability = event.ability;
      break;
    case "item":
      view[event.side].item = event.item;
      break;
    case "itemConsumed":
      view[event.side].item = null;
      break;
    case "cured":
      view[event.side].status = null;
      break;
    case "statusApplied":
      view[event.side].status = event.status;
      break;
    case "wokeUp":
    case "thawed":
      view[event.side].status = null;
      break;
    case "statChange":
      view[event.side].stages[event.stat] = event.stage;
      break;
    case "faint":
      view[event.side].hp = 0;
      view[event.side].remaining = Math.max(0, view[event.side].remaining - 1);
      break;
    default:
      break;
  }
}

// ─────────────────────────────────────────────
// 表示用のラベル
// ─────────────────────────────────────────────

export const STATUS_LABEL: Record<StatusId, string> = {
  poison: "どく",
  toxic: "もうどく",
  paralysis: "まひ",
  burn: "やけど",
  sleep: "ねむり",
  freeze: "こおり",
};

export const STAT_LABEL: Record<string, string> = {
  atk: "こうげき",
  def: "ぼうぎょ",
  spa: "とくこう",
  spd: "とくぼう",
  spe: "すばやさ",
  accuracy: "めいちゅう",
  evasion: "かいひ",
};

export const TYPE_LABEL: Record<Type, string> = {
  normal: "ノーマル", fire: "ほのお", water: "みず", electric: "でんき",
  grass: "くさ", ice: "こおり", fighting: "かくとう", poison: "どく",
  ground: "じめん", flying: "ひこう", psychic: "エスパー", bug: "むし",
  rock: "いわ", ghost: "ゴースト", dragon: "ドラゴン", dark: "あく",
  steel: "はがね", fairy: "フェアリー",
};

/**
 * タイプごとの色。
 * アセットが1枚も無い状態でも成立させるための代替表現。
 * 設計: docs/game-plan.md §10「アセットなしでも動くこと」
 */
export const TYPE_COLOR: Record<Type, string> = {
  normal: "#9099a1", fire: "#ff6b3d", water: "#3d9bff", electric: "#f7cf2e",
  grass: "#54c26b", ice: "#66d3e0", fighting: "#d3425f", poison: "#a95cc0",
  ground: "#c0a24a", flying: "#8fa8dd", psychic: "#f76e8a", bug: "#8fbe2c",
  rock: "#b7a05e", ghost: "#5f6dbc", dragon: "#4f6cd4", dark: "#5a5366",
  steel: "#8f9fb0", fairy: "#ef8fd3",
};
