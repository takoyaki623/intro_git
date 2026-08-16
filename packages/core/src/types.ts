/**
 * 基本型。
 *
 * v0.1 の範囲では状態異常・ランク補正・特性・持ち物を含まない（v0.2 / v0.5）。
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

export type MoveCategory = "physical" | "special" | "status";

/** v0.1 では単体対象のみ。ダブル対応の余地として値を分けてある。 */
export type MoveTarget = "foe" | "self";

/**
 * ID 型。
 * 設計では tools/gen-ids.ts が JSON から実際のユニオン型を生成する（v0.4）。
 * v0.1 は件数が少ないため string 別名で運用し、v0.4 で生成型に差し替える。
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
  genderRatio: number | null; // オスの比率(0..1)。null は性別不明
};

export type Move = {
  id: MoveId;
  name: string;
  type: Type;
  category: MoveCategory;
  /** 変化技は null。v0.1 では変化技を持たない。 */
  power: number | null;
  /** null は必中。 */
  accuracy: number | null;
  pp: number;
  priority: number;
  target: MoveTarget;
  effect?: MoveEffect;
};

/**
 * 技の効果。効果ID とハンドラのレジストリで解決する。
 * 技を1件足しても、既存の kind の組み合わせならコードは増えない。
 * 設計: docs/design/battle-system.md §11
 */
export type MoveEffect =
  | { kind: "recoil"; ratio: number }
  | { kind: "drain"; ratio: number };
// v0.2 で status / statChange / flinch / multiHit / heal を追加する

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

export type BattlePokemon = {
  species: SpeciesId;
  name: string;
  level: number;
  types: readonly Type[];
  /** 実数値。レベル・個体値・努力値・性格から算出済み。 */
  stats: StatSpread;
  maxHp: number;
  currentHp: number;
  moves: BattleMove[];
};

/**
 * v0.1 は手持ち1体のみ。交代は v0.2 で party を配列化して対応する。
 */
export type Side = {
  active: BattlePokemon;
};

export type RngState = {
  /** xorshift32 の内部状態。 */
  s: number;
  /** 消費した乱数の回数。リプレイ・デバッグ用。 */
  calls: number;
};

export type BattleState = {
  sides: [Side, Side];
  turn: number;
  rng: RngState;
  result: { winner: SideIndex | null } | null;
};

/**
 * 行動。v0.1 で実装するのは move のみだが、4種すべてを定義しておく。
 * 型を後から広げると行動順の処理を書き直すことになるため。
 * 設計: docs/design/battle-system.md §2
 */
export type Action =
  | { kind: "move"; moveIndex: number }
  | { kind: "switch"; partyIndex: number } // v0.2
  | { kind: "item"; item: ItemId } // v0.7〜v0.8
  | { kind: "run" }; // v0.7

export type Effectiveness = 0 | 0.25 | 0.5 | 1 | 2 | 4;

/**
 * UI はこのイベント列を順に消費して演出する。
 * core は時間の概念を持たない。設計: docs/design/ui-flow.md §4
 */
export type BattleEvent =
  | { kind: "turnStart"; turn: number }
  | { kind: "moveUsed"; side: SideIndex; move: MoveId }
  | { kind: "struggle"; side: SideIndex }
  | { kind: "missed"; side: SideIndex }
  | { kind: "noEffect"; side: SideIndex }
  | {
      kind: "damage";
      side: SideIndex; // ダメージを受けた側
      amount: number;
      remainingHp: number;
      effectiveness: Effectiveness;
      critical: boolean;
    }
  | { kind: "recoil"; side: SideIndex; amount: number; remainingHp: number }
  | { kind: "drain"; side: SideIndex; amount: number; remainingHp: number }
  | { kind: "faint"; side: SideIndex }
  | { kind: "battleEnd"; winner: SideIndex | null };

export type StepResult = {
  state: BattleState;
  events: BattleEvent[];
};
