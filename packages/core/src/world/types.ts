/**
 * マップ・イベント・NPC の型（v0.7）。
 *
 * 「原作のマップを再現」は3つの希望の1つで、最も工数が重い。
 * だから目標は「良いマップを作る」ことではなく、
 * **マップを大量に流し込める仕組みを用意すること**に置く。
 *
 * 設計: docs/design/world.md
 */

import type { PartySpec } from "../normalize.js";
import type { ItemId, MoveId, RegionId, SpeciesId } from "../types.js";

export type MapId = string;
export type FlagId = string;
export type TrainerId = string;
export type EncounterTableId = string;
export type EventId = string;
export type ShopId = string;
/** 進行能力。秘伝技を廃止し、道具・フラグで解放する（world.md §7）。 */
export type FieldAbilityId = "cut" | "surf" | "strength" | "rockSmash" | "fly";

export const DIRECTIONS = ["up", "down", "left", "right"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** 1歩ぶんの移動量。 */
export const STEP: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * 地形。**タイル画像から推測しない。**
 * 見た目とルールを分けておかないと、タイルを差し替えた瞬間に挙動が変わる。
 */
export const TERRAINS = ["normal", "grass", "water", "sand", "cave", "ledge"] as const;
export type TerrainId = (typeof TERRAINS)[number];

export type Warp = {
  at: { x: number; y: number };
  to: { map: MapId; x: number; y: number; facing: Direction };
  /** 踏む / 調べる（ドアなど）。 */
  trigger: "step" | "interact";
};

export type MapObjectKind =
  | { type: "npc"; sprite: string; movement: "static" | "wander" | "route" }
  | { type: "trainer"; trainer: TrainerId; sight: number; direction: Direction }
  | { type: "item"; item: ItemId; hidden: boolean }
  | { type: "sign" }
  | { type: "obstacle"; clearedBy: FieldAbilityId };

export type MapObject = {
  id: string;
  at: { x: number; y: number };
  kind: MapObjectKind;
  /** 話しかけ・踏みつけで動くイベント。 */
  event?: EventId;
  /** この条件を満たすときだけ存在する。イベント進行で現れたり消えたりする。 */
  condition?: Condition;
};

/**
 * トレーナー。**マップには置かず、IDで参照する。**
 * 施設・カップの相手と同じで、実体は1箇所にまとめる
 * （同じトレーナーが再戦イベントや PWT に出てくるため）。
 */
export type Trainer = {
  id: TrainerId;
  name: string;
  /** 「たんぱんこぞう」。表示にだけ使う。 */
  class: string;
  party: PartySpec[];
  /** 賞金の基礎額。economy.md §3。 */
  reward: number;
  /** 撃破済みを記録するフラグ。宣言必須（検証項目 #46）。 */
  defeatedFlag: FlagId;
  mistakeRate?: number;
};

export type MapData = {
  id: MapId;
  name: string;
  region: string;
  size: { width: number; height: number };
  /** 描画用。3枚に固定する（可変にすると制作側の運用が崩れる）。 */
  layers: { ground: string[]; decoration: string[]; overhead: string[] };
  /** 通行可否。長さは width * height。 */
  collision: boolean[];
  terrain: TerrainId[];
  warps: Warp[];
  objects: MapObject[];
  encounters?: EncounterTableId;
  bgm?: string;
};

export type EncounterTable = {
  id: EncounterTableId;
  method: "grass" | "surf" | "fishing" | "cave" | "static" | "gift";
  entries: { species: SpeciesId; levelRange: [number, number]; rate: number }[];
};

// ─────────────────────────────────────────────
// イベント
// ─────────────────────────────────────────────

/**
 * 分岐の条件。
 * **イベント分岐・NPCの出現条件・ショップの解禁が同じ型を共有する**
 * （data-schema.md §5）。用途ごとに別の条件型を作らない。
 */
export type Condition =
  | { kind: "flag"; flag: FlagId; value: boolean }
  | { kind: "badges"; op: ">="; count: number }
  | { kind: "hasItem"; item: ItemId }
  | { kind: "hasSpecies"; species: SpeciesId }
  | { kind: "and"; of: Condition[] }
  | { kind: "or"; of: Condition[] };

/**
 * イベントのコマンド列。技効果・持ち物効果と同じデータ駆動。
 * 地方を追加してもコードが増えない形にするための中心。
 */
export type EventCommand =
  | { kind: "message"; speaker?: string; text: string }
  | { kind: "choice"; prompt: string; options: { text: string; then: EventCommand[] }[] }
  | { kind: "if"; cond: Condition; then: EventCommand[]; else?: EventCommand[] }
  | { kind: "setFlag"; flag: FlagId; value: boolean }
  /** **必ず EventScript の最後**（world.md §6）。原子性を保てない唯一のコマンド。 */
  | { kind: "battle"; trainer: TrainerId; onWin?: EventId; onLose?: EventId }
  | { kind: "giveItem"; item: ItemId; count: number }
  | { kind: "givePokemon"; species: SpeciesId; level: number; moves?: MoveId[] }
  | { kind: "giveMoney"; amount: number }
  | { kind: "takeMoney"; amount: number }
  | { kind: "healParty" }
  | { kind: "warp"; to: MapId; x: number; y: number; facing?: Direction }
  | { kind: "faceObject"; object: string; direction: Direction }
  | { kind: "wait"; frames: number }
  | { kind: "playSe" }
  | { kind: "shop"; inventory: ShopId }
  | { kind: "openBox" }
  | { kind: "openDex" }
  // ── 拠点（v0.10）──
  // 拠点は「地方の外側」にある唯一の場所で、9地方とエンドゲームを束ねる。
  // どれも**マップ上のオブジェクトから開く**ので、コマンドとして持つ
  /** 地方チャレンジへ入る。`null` を渡す道は無い（拠点へ戻るのは warp）。 */
  | { kind: "enterRegion"; region: RegionId }
  | { kind: "openFacility" }
  | { kind: "openTournament" }
  /** 共通ボックス。地方ボックス（`openBox`）とは**別物**（capture.md §4）。 */
  | { kind: "openStorage" };

/**
 * ショップの品揃え（v0.9）。
 *
 * **値段は道具側が持つ。** 店ごとに値段を持たせると、
 * 同じキズぐすりが町ごとに違う値段になり、直す場所が地方の数だけ増える。
 * 店が持つのは「何を置くか」だけ（economy.md §7）。
 */
export type Shop = {
  id: ShopId;
  name: string;
  items: ItemId[];
};

/**
 * 地方の定義（v0.10・regions.md §8）。
 *
 * **チャレンジ構造をデータとして持つ。** アローラ（島巡り）やパルデア
 * （オープンワールド）は「8ジム→四天王」に当てはまらないので、
 * 後から特例のコードを足す形にしない。
 *
 * `levelBands` は**レベルデザインの定義と、相棒のレベル同期（regions.md §6）を兼ねる。**
 * 1箇所に持つことで、両者がずれることがなくなる。
 */
export type RegionDefinition = {
  id: RegionId;
  name: string;
  /** 選択画面に出す難易度の目安。 */
  difficulty: 1 | 2 | 3;
  /** 遊べるか。**ロックではなく未実装の印**（regions.md §3 は段階解放を採らない）。 */
  available: boolean;
  description: string;
  /** 冒険の開始地点。`available` な地方だけが持つ。 */
  start?: { map: MapId; x: number; y: number; facing: Direction };
  starters?: [SpeciesId, SpeciesId, SpeciesId];
  challenge?:
    | { kind: "gyms"; gyms: NamedRef[]; elite4: NamedRef[]; champion: NamedRef }
    | { kind: "trials"; trials: string[]; kahunas: NamedRef[]; champion: NamedRef }
    | { kind: "open"; routes: string[][]; champion: NamedRef };
  levelBands?: { badges: number; min: number; max: number }[];
};

/** ネームドの ID。`core` は `NamedId` を endgame 側に持っているので別名で受ける。 */
type NamedRef = string;

export type EventScript = {
  id: EventId;
  commands: EventCommand[];
};
