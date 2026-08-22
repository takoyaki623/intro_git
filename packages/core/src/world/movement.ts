/**
 * 移動・衝突・warp・エンカウント判定（v0.7）。
 *
 * バトルと同じく「状態 + 入力 → 新しい状態 + 起きたこと」の純関数にする。
 * 描画も時間も持たない。UI は返ってきた出来事を演出するだけ。
 *
 * 設計: docs/design/world.md §3・§5
 */

import type { Rng } from "../rng.js";
import type { SpeciesId } from "../types.js";
import { obstacleKey } from "./ability.js";
import { evaluate, type WorldState } from "./event.js";
import type {
  Direction,
  EncounterTable,
  EventId,
  FieldAbilityId,
  MapData,
  MapObject,
  TerrainId,
  Warp,
} from "./types.js";
import { STEP } from "./types.js";

export type PlayerPosition = {
  map: string;
  x: number;
  y: number;
  facing: Direction;
};

/**
 * エンカウントの救済（world.md §5）。
 *
 * 原作より緩める。9地方を周回する本作では、
 * 理不尽な連続エンカウントは摩擦として重すぎる。
 */
export type EncounterState = {
  /** 直前のエンカウントからの歩数。 */
  stepsSince: number;
  /** 草むらを歩いた累計歩数（出なさすぎの救済に使う）。 */
  stepsInGrass: number;
};

export const emptyEncounterState = (): EncounterState => ({ stepsSince: 0, stepsInGrass: 0 });

/**
 * 調整項目。
 *
 * **`rateByTerrain` は実効遭遇率ではない。** 実測（v0.7）:
 *
 * |                | 平均 | 最小 | 最大 | 実効率 |
 * | -------------- | ---- | ---- | ---- | ------ |
 * | この設定       | 13.2 |    6 |   37 |  7.6%  |
 * | 猶予なし       |  8.3 |    1 |   36 | 12.1%  |
 * | 救済ぜんぶ無し |  8.5 |    1 |   79 | 11.8%  |
 *
 * 猶予歩数は「連続で出続ける」を防ぐつもりの仕掛けだが、
 * **遭遇の総量そのものを4割減らす**（12% → 7.6%）。
 * 一方 pity は平均をほとんど動かさず、最悪ケースだけを 79歩 → 37歩 に切る。
 * 同じ「救済」でも効く場所が違うので、まとめて増減させてはいけない。
 */
export const ENCOUNTER = {
  /** 地形ごとの基本遭遇率。ここに無い地形では出ない。 */
  rateByTerrain: { grass: 0.12, water: 0.08, cave: 0.1 } as Partial<Record<TerrainId, number>>,
  /** 直前のエンカウントからこの歩数までは絶対に出さない。 */
  graceSteps: 5,
  /** 草むらでこの歩数を超えたら、1歩ごとに確率を上げる。 */
  pityAfter: 25,
  pityStep: 0.05,
};

/**
 * 段差を飛び降りられる向き。原作は南向きだけ。
 * 向きを地形側に持たせる（`ledge-left` 等に増やす）案もあるが、
 * カントー〜9地方を通して南向き以外はごく少数なので、まず1方向で始める。
 */
const LEDGE_DIRECTION: Direction = "down";

const indexOf = (map: MapData, x: number, y: number) => y * map.size.width + x;

export const inBounds = (map: MapData, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < map.size.width && y < map.size.height;

export function terrainAt(map: MapData, x: number, y: number): TerrainId {
  if (!inBounds(map, x, y)) return "normal";
  return map.terrain[indexOf(map, x, y)] ?? "normal";
}

/** そのマスに入れるか。マップの通行判定とオブジェクトの両方を見る。 */
export function isWalkable(
  map: MapData,
  world: WorldState,
  x: number,
  y: number,
): boolean {
  if (!inBounds(map, x, y)) return false;
  if (map.collision[indexOf(map, x, y)] === true && !canSwimTo(map, world, x, y)) return false;
  return !visibleObjects(map, world).some(
    (o) => o.at.x === x && o.at.y === y && blocksMovement(o),
  );
}

/**
 * なみのり で入れる水面か（v0.12-d）。
 *
 * **水は通行不可のまま置き、能力で例外にする。** 逆（水を通行可にして
 * 能力が無いときだけ塞ぐ）にすると、能力の実装を消した瞬間に
 * 海の上を歩けるマップができあがる。既定は塞がっている側に倒す。
 */
function canSwimTo(map: MapData, world: WorldState, x: number, y: number): boolean {
  return terrainAt(map, x, y) === "water" && world.abilities.includes("surf");
}

/** 看板・NPC・障害物は通れない。落ちている道具は踏める。 */
const blocksMovement = (object: MapObject): boolean => object.kind.type !== "item";

/** 条件を満たして今そこに居るオブジェクトだけ。 */
export function visibleObjects(map: MapData, world: WorldState): MapObject[] {
  return map.objects.filter((o) => {
    // どけた障害物はもう居ない。**ここ1箇所で消す**ので、
    // 当たり判定・描画・視線が勝手に揃う（別々に判定を足すとどれか1つ忘れる）
    if (o.kind.type === "obstacle" && world.cleared.includes(obstacleKey(map.id, o))) return false;
    return o.condition === undefined || evaluate(o.condition, world);
  });
}

export function objectAt(
  map: MapData,
  world: WorldState,
  x: number,
  y: number,
): MapObject | null {
  return visibleObjects(map, world).find((o) => o.at.x === x && o.at.y === y) ?? null;
}

export function warpAt(map: MapData, x: number, y: number, trigger: Warp["trigger"]): Warp | null {
  return map.warps.find((w) => w.at.x === x && w.at.y === y && w.trigger === trigger) ?? null;
}

// ─────────────────────────────────────────────
// 1歩
// ─────────────────────────────────────────────

export type StepOutcome =
  | { kind: "moved" }
  /**
   * トレーナーに見つかった（v0.12）。
   * `object` はそのトレーナー。UI が「!」を出して近づかせ、イベントを流す。
   */
  | { kind: "spotted"; object: MapObject; event: EventId }
  | { kind: "blocked" }
  /** 向きだけ変えた（原作の「向き直り」）。 */
  | { kind: "turned" }
  | { kind: "warp"; warp: Warp }
  /** 段差を飛び降りた。着地は2マス先。 */
  | { kind: "jumped" }
  | { kind: "encounter"; species: SpeciesId; level: number }
  | { kind: "event"; event: EventId; object: MapObject };

export type StepPlayerResult = {
  position: PlayerPosition;
  encounter: EncounterState;
  outcome: StepOutcome;
};

/**
 * 視線に入ったトレーナーを探す（v0.12）。
 *
 * 原作の規則をそのまま:
 *   - **向いている方向にだけ** `sight` マスぶん見る
 *   - 途中に通れないマスや別のオブジェクトがあれば、そこで視線が切れる
 *   - 撃破済みは `condition` で消えるので、ここには出てこない
 *
 * **近い方を優先する。** 2人の視線が重なるマスに立ったとき、
 * 遠い方が先に来ると「すり抜けて奥から呼ばれた」ように見える。
 */
export function spotterAt(
  map: MapData,
  world: WorldState,
  x: number,
  y: number,
): MapObject | null {
  let best: { object: MapObject; distance: number } | null = null;

  for (const object of visibleObjects(map, world)) {
    if (object.kind.type !== "trainer") continue;
    const { dx, dy } = STEP[object.kind.direction];
    if (dx === 0 && dy === 0) continue;

    for (let step = 1; step <= object.kind.sight; step += 1) {
      const sx = object.at.x + dx * step;
      const sy = object.at.y + dy * step;
      if (sx === x && sy === y) {
        if (best === null || step < best.distance) best = { object, distance: step };
        break;
      }
      // 壁の向こうは見えない。他のオブジェクトも視線を遮る
      if (!inBounds(map, sx, sy)) break;
      if (map.collision[indexOf(map, sx, sy)] === true) break;
      if (objectAt(map, world, sx, sy) !== null) break;
    }
  }
  return best?.object ?? null;
}

/**
 * 1歩進もうとする。
 *
 * 原作と同じく、**違う方向を向いた最初の入力は「向き直り」だけ**で移動しない。
 * これが無いと、壁際で向きを変えられず看板が読めない。
 */
export function stepPlayer(
  map: MapData,
  world: WorldState,
  position: PlayerPosition,
  encounter: EncounterState,
  direction: Direction,
  rng: Rng,
  tables: readonly EncounterTable[],
): StepPlayerResult {
  if (position.facing !== direction) {
    return {
      position: { ...position, facing: direction },
      encounter,
      outcome: { kind: "turned" },
    };
  }

  const { dx, dy } = STEP[direction];
  const nx = position.x + dx;
  const ny = position.y + dy;

  // 段差。飛び降りる向きからしか入れない一方通行（原作準拠）
  if (terrainAt(map, nx, ny) === "ledge") {
    const landing = { x: nx + dx, y: ny + dy };
    if (direction !== LEDGE_DIRECTION || !isWalkable(map, world, landing.x, landing.y)) {
      return { position, encounter, outcome: { kind: "blocked" } };
    }
    return {
      position: { ...position, ...landing },
      // 飛び降りた先でいきなり野生が出ると理不尽なので、猶予をリセットする
      encounter: emptyEncounterState(),
      outcome: { kind: "jumped" },
    };
  }

  if (!isWalkable(map, world, nx, ny)) {
    return { position, encounter, outcome: { kind: "blocked" } };
  }

  const moved: PlayerPosition = { ...position, x: nx, y: ny };

  // 踏むタイプの warp が最優先。エンカウントより先に判定する
  const warp = warpAt(map, nx, ny, "step");
  if (warp !== null) {
    return { position: moved, encounter: emptyEncounterState(), outcome: { kind: "warp", warp } };
  }

  // 踏んだ場所のイベント（落ちている道具など）
  const object = objectAt(map, world, nx, ny);
  if (object !== null && object.kind.type === "item" && object.event !== undefined) {
    return {
      position: moved,
      encounter: { ...encounter, stepsSince: encounter.stepsSince + 1 },
      outcome: { kind: "event", event: object.event, object },
    };
  }

  // **視線は野生より先。** 草むらを横切ってトレーナーの前に出たとき、
  // 野生が割り込むと「見つかったのに何も起きない」状態になる
  const spotter = spotterAt(map, world, nx, ny);
  if (spotter !== null && spotter.event !== undefined) {
    return {
      position: moved,
      encounter: emptyEncounterState(),
      outcome: { kind: "spotted", object: spotter, event: spotter.event },
    };
  }

  const next = advanceEncounterState(encounter, terrainAt(map, nx, ny));
  const wild = rollEncounter(map, terrainAt(map, nx, ny), next, rng, tables);
  if (wild !== null) {
    return { position: moved, encounter: emptyEncounterState(), outcome: wild };
  }

  return { position: moved, encounter: next, outcome: { kind: "moved" } };
}

function advanceEncounterState(state: EncounterState, terrain: TerrainId): EncounterState {
  return {
    stepsSince: state.stepsSince + 1,
    stepsInGrass: terrain === "grass" ? state.stepsInGrass + 1 : state.stepsInGrass,
  };
}

/**
 * 地形とエンカウント方式の対応（v0.12-d）。
 *
 * **地形が方式を決める。** マップ側に「この表は水用」と書かせると、
 * 書き忘れたマップで草むらのポケモンが海から出てくる。
 */
export const METHOD_BY_TERRAIN: Partial<Record<TerrainId, EncounterTable["method"]>> = {
  grass: "grass",
  cave: "cave",
  water: "surf",
};

/** その地形で引く表。無ければ null（＝その地形では出ない）。 */
export function tableFor(
  map: MapData,
  terrain: TerrainId,
  tables: readonly EncounterTable[],
): EncounterTable | null {
  const method = METHOD_BY_TERRAIN[terrain];
  if (method === undefined || map.encounters === undefined) return null;
  for (const id of map.encounters) {
    const table = tables.find((t) => t.id === id);
    if (table !== undefined && table.method === method) return table;
  }
  return null;
}

/** 1歩ぶんのエンカウント抽選。出なければ null。 */
export function rollEncounter(
  map: MapData,
  terrain: TerrainId,
  state: EncounterState,
  rng: Rng,
  tables: readonly EncounterTable[],
): { kind: "encounter"; species: SpeciesId; level: number } | null {
  const base = ENCOUNTER.rateByTerrain[terrain];
  if (base === undefined) return null;
  if (state.stepsSince <= ENCOUNTER.graceSteps) return null;

  // **抽選より先に表を決める。** 表が無い地形で乱数を回すと、
  // 「出るはずだったのに何も起きなかった」ぶんだけ乱数がずれ、再生が合わなくなる
  const table = tableFor(map, terrain, tables);
  if (table === null || table.entries.length === 0) return null;

  // 出なさすぎの救済。歩くほど確率が上がる
  const pity = Math.max(0, state.stepsInGrass - ENCOUNTER.pityAfter) * ENCOUNTER.pityStep;
  if (!rng.chance(Math.min(1, base + pity))) return null;
  return { kind: "encounter", ...pickEncounter(table, rng) };
}

/** 出現テーブルから1件抽選する。`rate` の重み付き。 */
export function pickEncounter(
  table: EncounterTable,
  rng: Rng,
): { species: SpeciesId; level: number } {
  const total = table.entries.reduce((n, e) => n + e.rate, 0);
  let roll = rng.next() * total;
  for (const entry of table.entries) {
    roll -= entry.rate;
    if (roll <= 0) {
      const [lo, hi] = entry.levelRange;
      return { species: entry.species, level: rng.range(lo, hi) };
    }
  }
  const last = table.entries[table.entries.length - 1]!;
  return { species: last.species, level: last.levelRange[0] };
}

export type InteractResult =
  | { kind: "event"; event: EventId; object: MapObject }
  | { kind: "warp"; warp: Warp }
  /**
   * 障害物（v0.12-d）。`ability` を持っていれば どけられる。
   * **どけられるかどうかの判定はここでしない** ―― UI が文章を出し分ける都合上、
   * 「何が要るか」だけ返して、可否は `canClear` に一本化する。
   */
  | { kind: "obstacle"; object: MapObject; ability: FieldAbilityId };

/** 目の前を調べる。話しかけ・看板・調べる warp・障害物。 */
export function interact(
  map: MapData,
  world: WorldState,
  position: PlayerPosition,
): InteractResult | null {
  const { dx, dy } = STEP[position.facing];
  const x = position.x + dx;
  const y = position.y + dy;

  const warp = warpAt(map, x, y, "interact");
  if (warp !== null) return { kind: "warp", warp };

  const object = objectAt(map, world, x, y);
  if (object === null) return null;
  if (object.kind.type === "obstacle") {
    return { kind: "obstacle", object, ability: object.kind.clearedBy };
  }
  if (object.event !== undefined) return { kind: "event", event: object.event, object };
  return null;
}
