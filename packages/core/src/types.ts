/**
 * 基本型。
 *
 * v0.2 の範囲では特性・持ち物・天候を含まない（v0.5 / v1.1）。
 * 型の側だけ先に用意しておくものは、その旨をコメントで示す。
 * 設計: docs/design/battle-system.md
 */

export const TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const;
export type Type = (typeof TYPES)[number];

export const STATS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export type StatId = (typeof STATS)[number];
export type StatSpread = Record<StatId, number>;

/** ランク補正を持つ能力。命中・回避は倍率表が異なる。 */
export const STAGED_STATS = ["atk", "def", "spa", "spd", "spe", "accuracy", "evasion"] as const;
export type StagedStat = (typeof STAGED_STATS)[number];
export type StatStages = Record<StagedStat, number>;

export type MoveCategory = "physical" | "special" | "status";

/** v0.2 では単体対象のみ。ダブル対応の余地として値を分けてある。 */
export type MoveTarget = "foe" | "self";

/** 状態異常。同時に1つのみ。混乱は別枠（volatile）。 */
export const STATUSES = ["poison", "toxic", "paralysis", "burn", "sleep", "freeze"] as const;
export type StatusId = (typeof STATUSES)[number];

/**
 * ID 型。
 * 設計では tools/gen-ids.ts が JSON から実際のユニオン型を生成する（v0.4）。
 */
export type SpeciesId = string;
export type MoveId = string;
export type NatureId = string;
export type AbilityId = string;
export type ItemId = string;

// ─────────────────────────────────────────────
// マスタデータ
// ─────────────────────────────────────────────

export type Species = {
  id: SpeciesId;
  dexNo: number;
  name: string;
  types: [Type] | [Type, Type];
  baseStats: StatSpread;
  /** v0.5 で特性を導入するまで参照されない。 */
  abilities: AbilityId[];
  learnset: { level: number; move: MoveId }[];
  catchRate: number;
  expType: string;
  evYield: Partial<StatSpread>;
  genderRatio: number | null;
};

export type Move = {
  id: MoveId;
  name: string;
  type: Type;
  category: MoveCategory;
  /** 変化技は null。 */
  power: number | null;
  /** null は必中。 */
  accuracy: number | null;
  pp: number;
  priority: number;
  target: MoveTarget;
  /** 急所ランクの加算。きりさく等。既定 0。 */
  critStage?: number;
  effect?: MoveEffect;
};

/**
 * 技の効果。効果ID とハンドラのレジストリで解決する。
 * 技を1件足しても、既存の kind の組み合わせならコードは増えない。
 * 設計: docs/design/battle-system.md §11
 */
export type MoveEffect =
  | { kind: "recoil"; ratio: number }
  | { kind: "drain"; ratio: number }
  | { kind: "heal"; ratio: number }
  | { kind: "status"; status: StatusId; chance: number }
  | { kind: "confuse"; chance: number }
  | { kind: "flinch"; chance: number }
  | {
      kind: "statChange";
      target: "self" | "foe";
      stat: StagedStat;
      stages: number;
      chance: number;
    }
  | { kind: "multiHit"; min: number; max: number };

export type NatureModifier = {
  id: NatureId;
  name: string;
  increased: StatId | null;
  decreased: StatId | null;
};

/** 攻撃タイプ → 防御タイプ → 倍率。 */
export type TypeChart = Record<Type, Record<Type, number>>;

// ─────────────────────────────────────────────
// バトル
// ─────────────────────────────────────────────

export type SideIndex = 0 | 1;

export type BattleMove = {
  id: MoveId;
  pp: number;
  maxPp: number;
};

/** 交代で消える一時的な状態。 */
export type Volatile = {
  confusionTurns: number;
  flinched: boolean;
};

export type BattlePokemon = {
  species: SpeciesId;
  name: string;
  level: number;
  types: readonly Type[];
  /** 実数値。ランク補正はここに含めず、参照時に掛ける。 */
  stats: StatSpread;
  maxHp: number;
  currentHp: number;
  moves: BattleMove[];

  status: StatusId | null;
  /** ねむりの残りターン / もうどくの経過ターン。 */
  statusCounter: number;
  statStages: StatStages;
  volatile: Volatile;
};

export type Side = {
  party: BattlePokemon[];
  activeIndex: number;
};

export type RngState = {
  s: number;
  calls: number;
};

export type BattleState = {
  sides: [Side, Side];
  turn: number;
  rng: RngState;
  result: { winner: SideIndex | null } | null;
  /**
   * ひんしにより交代を要求されている側。
   * 空でない間、次の step はその側の switch 行動のみを処理し、ターンを進めない。
   */
  pendingSwitch: SideIndex[];
};

/**
 * 行動。v0.2 で実装するのは move / switch。
 * item / run は v0.7〜v0.8 だが、型は最初から4種すべて定義する。
 * 設計: docs/design/battle-system.md §2
 */
export type Action =
  | { kind: "move"; moveIndex: number }
  | { kind: "switch"; partyIndex: number }
  | { kind: "item"; item: ItemId } // v0.7〜v0.8
  | { kind: "run" }; // v0.7

export type Effectiveness = 0 | 0.25 | 0.5 | 1 | 2 | 4;

/** 行動できなかった理由。 */
export type BlockedReason = "sleep" | "freeze" | "paralysis" | "confusion" | "flinch";

/**
 * UI はこのイベント列を順に消費して演出する。
 * core は時間の概念を持たない。設計: docs/design/ui-flow.md §4
 */
export type BattleEvent =
  | { kind: "turnStart"; turn: number }
  | { kind: "switchIn"; side: SideIndex; partyIndex: number }
  | { kind: "moveUsed"; side: SideIndex; move: MoveId }
  | { kind: "struggle"; side: SideIndex }
  | { kind: "blocked"; side: SideIndex; reason: BlockedReason }
  | { kind: "wokeUp" | "thawed" | "snappedOut"; side: SideIndex }
  | { kind: "missed"; side: SideIndex }
  | { kind: "noEffect"; side: SideIndex }
  | { kind: "failed"; side: SideIndex }
  | {
      kind: "damage";
      side: SideIndex;
      amount: number;
      remainingHp: number;
      effectiveness: Effectiveness;
      critical: boolean;
    }
  | { kind: "hitCount"; side: SideIndex; hits: number }
  | { kind: "confusionHit"; side: SideIndex; amount: number; remainingHp: number }
  | { kind: "recoil"; side: SideIndex; amount: number; remainingHp: number }
  | { kind: "drain" | "heal"; side: SideIndex; amount: number; remainingHp: number }
  | { kind: "statusApplied"; side: SideIndex; status: StatusId }
  | { kind: "confused"; side: SideIndex }
  | { kind: "statusDamage"; side: SideIndex; status: StatusId; amount: number; remainingHp: number }
  | { kind: "statChange"; side: SideIndex; stat: StagedStat; delta: number; stage: number }
  | { kind: "statChangeFailed"; side: SideIndex; stat: StagedStat }
  | { kind: "faint"; side: SideIndex }
  | { kind: "battleEnd"; winner: SideIndex | null };

export type StepResult = {
  state: BattleState;
  events: BattleEvent[];
};

export const EMPTY_STAGES: StatStages = {
  atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0,
};
