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
export const FIELD_ABILITIES = [
  "cut",
  "surf",
  "strength",
  "rockSmash",
  "fly",
  "oldRod",
  "goodRod",
  "superRod",
  "itemfinder",
] as const;
export type FieldAbilityId = (typeof FIELD_ABILITIES)[number];

/**
 * フィールド行動が何をするか（v1.1-c）。
 *
 * v0.12-d の5つは**どれも「障害物をどける」**だったので、
 * `FieldAbility` は「解放条件」しか持っていなかった。
 * 釣り・探知が入ると種類が要る ―― **足りなかったのは
 * 「何をする能力か」だけ**で、条件のしくみはそのまま使える。
 *
 * 省略したら `clear` にしてある。既存の5件はデータを1文字も変えずに済む。
 */
export type FieldEffect =
  /** 障害物をどける。`then` があると、どけた先で野生が出る（いわくだき）。 */
  | { kind: "clear"; then?: { method: EncounterTable["method"] } }
  /** その地形の上を移動できる（なみのり）。 */
  | { kind: "walk"; terrain: TerrainId }
  /** 水面を調べて釣る。さおの種類で出る表が変わる。 */
  | { kind: "fish"; method: EncounterTable["method"] }
  /** 隠れているものを見つける（ダウジングマシン）。 */
  | { kind: "reveal" }
  /** 行ったことのある町へ飛ぶ（そらをとぶ）。 */
  | { kind: "travel" };

/**
 * フィールド技の定義（v0.12-d）。
 *
 * **使えるかどうかは手持ちではなくプレイヤー自身で決まる**（world.md §7）。
 * 条件は分岐・NPCの出現条件と同じ `Condition` を使い回す（data-schema.md §5）
 * ―― 「解放条件」という専用の型を作ると、書き方が2つに割れる。
 */
export type FieldAbility = {
  id: FieldAbilityId;
  /** 「いあいぎり」。表示にだけ使う。 */
  name: string;
  requires: Condition;
  /** 何をする能力か（v1.1-c）。省略すると障害物をどける。 */
  effect?: FieldEffect;
  /** まだ使えないときに障害物を調べて出す文。 */
  lockedText: string;
  /** 使ったときに出す文。`{name}` は能力名に置き換わる。 */
  useText: string;
};

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
  | { type: "obstacle"; clearedBy: FieldAbilityId }
  /**
   * 押せる岩（v1.1-f）。
   *
   * **`obstacle` と紛らわしいが、別物として分ける。**
   * どちらも「能力で対処する通れないもの」だが、消えるか動くかが違う ――
   * `obstacle` は `world.cleared` に id を1件足せば済むのに対し、
   * こちらは**どこへ動いたか**を持たないといけない（`world.moved`）。
   * 1つの kind にまとめると「消えた岩の座標」という無意味な状態が表現できてしまう。
   */
  | { type: "boulder"; pushedBy: FieldAbilityId }
  /**
   * 岩を乗せるスイッチ（v1.1-f）。**床なので通行を妨げない。**
   *
   * 岩が乗った瞬間に `event` が走る ―― その中身は `setFlag` で、
   * 以降の扉は既存のフラグ機構で開く。**新しい `Condition` は作らない**：
   * 岩の位置は保存しない派生値なので、条件に載せると
   * 保存するもの / しないものの境界が濁る（world.md §7.1）。
   */
  | { type: "switch" };

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
  /**
   * 出現テーブル。**複数持てる**（v0.12-d）。
   *
   * 1つしか持てなかった頃は「草むらの表」しか置けず、
   * なみのりで水の上へ出た瞬間に**草むらのポケモンが海から出てくる**。
   * どの表を引くかは地形が決める（`method` と地形の対応・`METHOD_BY_TERRAIN`）。
   */
  encounters?: EncounterTableId[];
  /**
   * そらをとぶ の行き先（v0.12-d）。**この欄があるマップだけが行き先になる。**
   * 「行ける町の一覧」をどこか別の表に持つと、マップを消したときに残る。
   *
   * `flag` は「一度でも来たか」の記録。`onEnter` で立てる約束にしてあり、
   * **立てていなければ検証が落とす**（行き先に宣言したのに永久に開かない、を防ぐ）。
   */
  flyPoint?: { x: number; y: number; flag: FlagId };
  /**
   * マップに入った瞬間に走るイベント（v0.12-d）。
   *
   * 「訪れた」の記録に使う（そらをとぶ の解放）。
   * 四天王の「戻れない部屋」もここで塞ぐ想定。
   */
  onEnter?: EventId;
  bgm?: string;
};

export type EncounterTable = {
  id: EncounterTableId;
  /**
   * 引き方（v1.1-a）。
   *
   * **`fishing` は v0.7 から宣言だけされて一度も使われていなかった。**
   * 原作の さお は3段階で出るものが違うので、3つに割って実際に使う。
   */
  method:
    | "grass"
    | "cave"
    | "surf"
    | "fishing-old"
    | "fishing-good"
    | "fishing-super"
    | "rock-smash"
    | "static"
    | "gift";
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
  /**
   * バッジを渡す（v0.12）。`count` は「これで何個目になるか」。
   *
   * 増分ではなく**到達点**にしてあるので、同じイベントを2回踏んでも増えない。
   * ジムの順番を入れ替えても数が狂わない（バッジは進行の目盛りなので、
   * 「何個持っているか」だけが意味を持つ）。
   */
  | { kind: "giveBadge"; count: number }
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
  /**
   * 地方チャレンジへ入る。**前回いた場所から再開する**ので warp では表せない
   * （warp は行き先が固定で、続きから始められない）。
   */
  | { kind: "enterRegion"; region: RegionId }
  /** 拠点へ戻る。`enterRegion` の対。地方の進行はセーブに残る。 */
  | { kind: "returnToHub" }
  | { kind: "openFacility" }
  /** BP交換所。**施設とは別の画面**（v0.11 で分けた。理由は event.ts）。 */
  | { kind: "openExchange" }
  | { kind: "openTournament" }
  /** 共通ボックス。地方ボックス（`openBox`）とは**別物**（capture.md §4）。 */
  | { kind: "openStorage" }
  /**
   * 殿堂入り（v1.0）。**その地方のチャレンジが終わったことの記録。**
   *
   * 実際に何を書くかは UI の仕事（そのときの手持ちを写す）。
   * `core` は「殿堂入りした」という出来事だけを返す ―― バトルと同じ分担。
   */
  | { kind: "hallOfFame" }
  /** 殿堂の記録を見る（v1.0）。**残すのではなく見るだけ。** */
  | { kind: "openHall" }
  /**
   * その場で野生と戦う（v1.1-c）。**固定シンボル**（カビゴン・三鳥・ミュウツー）。
   *
   * `battle` はトレーナー戦で、勝てば終わる。こちらは**捕まえるための戦い**で、
   * 逃げても倒しても「もう そこには居ない」ことをフラグで表す ――
   * だから `battle` に相乗りさせず、別のコマンドにしてある。
   * `EncounterTable.method: "static"` が v0.7 から宣言だけされていたのは、
   * この日のためだった。
   */
  | { kind: "wildBattle"; species: SpeciesId; level: number };

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
  /** 初めてその地方に入ったときの案内。**地方ごとに違うのでデータが持つ。** */
  intro?: string;
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
