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
import { fieldActionAt, objectKey, type FieldAction } from "./ability.js";
import { evaluate, type WorldState } from "./event.js";
import type {
  Direction,
  EncounterTable,
  EventId,
  FieldAbility,
  FieldAbilityId,
  MapData,
  MapId,
  MapObject,
  TerrainId,
  Warp,
} from "./types.js";
import { DIRECTIONS, STEP } from "./types.js";

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
  return canEnter(map, world, x, y, {});
}

/**
 * 経路探索の「見立て」（v1.1-a）。
 *
 * ゲーム本体は常に既定（どちらも false）で歩く ―― `isWalkable` がそれ。
 * **道具だけが見立てを変える**:
 *
 *   - 検証は「原理的に繋がっているか」を見る。進行で消える門番や、
 *     どければ通れる岩を壁として数えると、開通済みの道まで閉じてしまう
 *   - 台本は「今どけた岩」を `world.cleared` で知っているので、
 *     障害物は既定のまま（壁）でよい
 *
 * ここを options で分けずに各ツールが自前で書いていたのが v1.1-a 以前で、
 * 同じ判定が3箇所にあった。**見立ての差だけをここに集める。**
 */
export type NeighborOptions = {
  /** 条件つきオブジェクトを塞いでいない扱いにする。 */
  ignoreConditional?: boolean;
  /** 障害物を塞いでいない扱いにする（`world.cleared` を1件ずつ数える代わり）。 */
  ignoreObstacles?: boolean;
  /** 押せる岩を塞いでいない扱いにする（v1.1-f）。`ignoreObstacles` の岩版。 */
  ignorePushable?: boolean;
  /** 踏む warp を辿るか。既定 true。1枚のマップの中だけを塗るときは false。 */
  followWarps?: boolean;
};

/** そのマスに入れるか。見立てつき（`isWalkable` は見立て無しの呼び出し）。 */
export function canEnter(
  map: MapData,
  world: WorldState,
  x: number,
  y: number,
  options: NeighborOptions,
): boolean {
  if (!inBounds(map, x, y)) return false;
  if (map.collision[indexOf(map, x, y)] === true && !canSwimTo(map, world, x, y)) return false;
  return !visibleObjects(map, world).some((o) => {
    if (o.at.x !== x || o.at.y !== y || !blocksMovement(o)) return false;
    if (options.ignoreConditional === true && o.condition !== undefined) return false;
    if (options.ignoreObstacles === true && o.kind.type === "obstacle") return false;
    if (options.ignorePushable === true && o.kind.type === "boulder") return false;
    return true;
  });
}

export type Neighbor = { dir: Direction; map: MapId; x: number; y: number };

/**
 * 1歩で行ける先（v1.1-a）。**「隣とは何か」の唯一の定義。**
 *
 *   - 段差は南向きの飛び降りとしてだけ繋がる。着地は2マス先（原作どおりの一方通行）
 *   - 踏む warp のマスに入ると、その場で接続先へ移る ―― **同じ1歩の中で起きる**
 *
 * `stepPlayer` と同じ規則をなぞっているが、あちらは「1歩の結果」を返し、
 * こちらは「行き先の集合」を返す。氷の床（v1.1-f）で規則が増えたとき、
 * **直すのはこの2つだけで済む**ようにしてある。
 */
export function neighborsOf(
  map: MapData,
  world: WorldState,
  x: number,
  y: number,
  options: NeighborOptions = {},
  mapById?: ReadonlyMap<MapId, MapData>,
): Neighbor[] {
  const out: Neighbor[] = [];
  for (const dir of DIRECTIONS) {
    const { dx, dy } = STEP[dir];
    let nx = x + dx;
    let ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;

    if (terrainAt(map, nx, ny) === "ledge") {
      if (dir !== LEDGE_DIRECTION) continue;
      nx += dx;
      ny += dy;
    }
    if (!canEnter(map, world, nx, ny, options)) continue;

    const warp = options.followWarps === false ? null : warpAt(map, nx, ny, "step");
    if (warp === null) {
      out.push({ dir, map: map.id, x: nx, y: ny });
      continue;
    }
    // 接続先が手元に無いなら、その1歩は無かったことにする。
    // **黙って「同じマップの中を歩いた」ことにしない** ―― 経路が嘘になる
    if (mapById !== undefined && !mapById.has(warp.to.map)) continue;
    out.push({ dir, map: warp.to.map, x: warp.to.x, y: warp.to.y });
  }
  return out;
}

/**
 * 能力で入れる地形か（v0.12-d、v1.1-c で一般化）。
 *
 * **通行不可のまま置き、能力で例外にする。** 逆（水を通行可にして
 * 能力が無いときだけ塞ぐ）にすると、能力の実装を消した瞬間に
 * 海の上を歩けるマップができあがる。既定は塞がっている側に倒す。
 *
 * v0.12-d は `terrain === "water" && abilities.includes("surf")` と
 * **ペアを直接書いていた。** どの能力がどの地形を開けるかは
 * `field-abilities.json` にあるので、`world.walkable`（派生値）から引く。
 */
function canSwimTo(map: MapData, world: WorldState, x: number, y: number): boolean {
  return world.walkable.includes(terrainAt(map, x, y));
}

/**
 * 看板・NPC・障害物・押せる岩は通れない。
 * 落ちている道具とスイッチ（v1.1-f）は床なので踏める。
 */
const blocksMovement = (object: MapObject): boolean =>
  object.kind.type !== "item" && object.kind.type !== "switch";

/**
 * 条件を満たして今そこに居るオブジェクトだけ。
 *
 * **世界の「今の見え方」を作る唯一の場所。** 消えたもの（どけた障害物・
 * まだ見つかっていない隠しアイテム・条件を満たさないもの）をここで落とし、
 * 動いたもの（押した岩・v1.1-f）の座標をここで差し替える。
 * 当たり判定・描画・視線・調べる がすべてこの関数を通るので、
 * **1箇所直せば4つが勝手に揃う** ―― 別々に判定を足すとどれか1つを忘れる。
 */
export function visibleObjects(map: MapData, world: WorldState): MapObject[] {
  return map.objects.filter((o) => {
    // どけた障害物はもう居ない。**ここ1箇所で消す**ので、
    // 当たり判定・描画・視線が勝手に揃う（別々に判定を足すとどれか1つ忘れる）
    if (o.kind.type === "obstacle" && world.cleared.includes(objectKey(map.id, o))) return false;
    // 隠しアイテムは**まだ そこに無い**（v1.1-c）。同じ1箇所で消すので、
    // 描いてしまう・踏んで拾えてしまう、が起きない ――
    // 見つける道は `interact` が別に持っている（探す能力があるときだけ）
    if (o.kind.type === "item" && o.kind.hidden) return false;
    return o.condition === undefined || evaluate(o.condition, world);
  }).map((o) => {
    // 押した岩は今そこに無い（v1.1-f）。**座標だけを差し替えた別物を返す** ――
    // 元データを書き換えると、同じマップを2回読んだときに岩が戻らない
    const at = world.moved[objectKey(map.id, o)];
    return at === undefined ? o : { ...o, at };
  });
}

/** そのマスに埋まっている道具（v1.1-c）。**見えないので `objectAt` には出てこない。** */
export function hiddenItemAt(
  map: MapData,
  world: WorldState,
  x: number,
  y: number,
): MapObject | null {
  return (
    map.objects.find(
      (o) =>
        o.at.x === x &&
        o.at.y === y &&
        o.kind.type === "item" &&
        o.kind.hidden &&
        (o.condition === undefined || evaluate(o.condition, world)),
    ) ?? null
  );
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
  /**
   * 岩を押した（v1.1-f）。プレイヤーは岩が居たマスへ1歩進む。
   *
   * **`core` は世界を書き換えない。** 岩の新しい位置は `to` で返すだけで、
   * `world.moved` に入れるのは呼び出し側 ―― `cleared` と同じ受け渡し方。
   * `event` はスイッチに乗ったときだけ入る。
   */
  | { kind: "pushed"; object: MapObject; to: { x: number; y: number }; event?: EventId }
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
      // 床のスイッチは視線を遮らない（v1.1-f）。遮ると、岩を置いた瞬間に
      // 奥のトレーナーが見えなくなるという説明のつかない挙動になる
      const between = objectAt(map, world, sx, sy);
      if (between !== null && between.kind.type !== "switch") break;
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

  // 押せる岩（v1.1-f）。**壁の判定より先。** あとに置くと
  // 「通れないので blocked」で終わってしまい、押す機会が来ない
  const boulder = objectAt(map, world, nx, ny);
  if (boulder !== null && boulder.kind.type === "boulder") {
    const push = tryPush(map, world, boulder, boulder.kind.pushedBy, dx, dy);
    if (push === null) return { position, encounter, outcome: { kind: "blocked" } };
    return {
      position: { ...position, x: nx, y: ny },
      // 押した歩は野生を抽選しない。パズルの最中に割り込まれると、
      // 戻ってきたとき岩がどこまで動いたか分からなくなる
      encounter: { ...encounter, stepsSince: encounter.stepsSince + 1 },
      outcome: push,
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

/**
 * 岩を1マス押せるか。押せるなら結果を、押せないなら null を返す（v1.1-f）。
 *
 * **押した先の条件は3つとも「入れるマス」より厳しい:**
 *   - 段差の上には乗らない（飛び降り専用の一方通行なので、乗ると降りられない）
 *   - 踏む warp の上には乗らない（岩だけが別の階に落ちることになる）
 *   - 他のオブジェクトの上には乗らない ―― ただし**スイッチだけは例外**。
 *     そこに乗せるための床なので、乗せられないと道具として意味を成さない
 *
 * 検証 #103（初期位置から最低1方向へ押せる）もこの関数を呼ぶ。
 * **判定を2箇所に書くと、検証だけが通る岩ができる。**
 */
export function tryPush(
  map: MapData,
  world: WorldState,
  boulder: MapObject,
  pushedBy: FieldAbilityId,
  dx: number,
  dy: number,
): { kind: "pushed"; object: MapObject; to: { x: number; y: number }; event?: EventId } | null {
  if (!world.abilities.includes(pushedBy)) return null;

  const to = { x: boulder.at.x + dx, y: boulder.at.y + dy };
  if (!inBounds(map, to.x, to.y)) return null;
  if (terrainAt(map, to.x, to.y) === "ledge") return null;
  if (warpAt(map, to.x, to.y, "step") !== null) return null;
  if (!canEnter(map, world, to.x, to.y, {})) return null;

  const onto = objectAt(map, world, to.x, to.y);
  if (onto !== null && onto.kind.type !== "switch") return null;

  // スイッチに乗ったら、その場でイベント（中身は setFlag）
  const event = onto !== null && onto.kind.type === "switch" ? onto.event : undefined;
  return event === undefined
    ? { kind: "pushed", object: boulder, to }
    : { kind: "pushed", object: boulder, to, event };
}

/** その岩を今の状態から押せる向き（v1.1-f）。検証 #103 が数える。 */
export function pushableDirections(
  map: MapData,
  world: WorldState,
  boulder: MapObject,
  pushedBy: FieldAbilityId,
): Direction[] {
  return DIRECTIONS.filter((dir) => {
    const { dx, dy } = STEP[dir];
    // 押すには、岩の反対側に立てないといけない
    if (!canEnter(map, world, boulder.at.x - dx, boulder.at.y - dy, {})) return false;
    return tryPush(map, world, boulder, pushedBy, dx, dy) !== null;
  });
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
  method: EncounterTable["method"],
  tables: readonly EncounterTable[],
): EncounterTable | null {
  if (map.encounters === undefined) return null;
  for (const id of map.encounters) {
    const table = tables.find((t) => t.id === id);
    if (table !== undefined && table.method === method) return table;
  }
  return null;
}

/** 歩いたときに引く表（`METHOD_BY_TERRAIN` を通す）。 */
export function tableForTerrain(
  map: MapData,
  terrain: TerrainId,
  tables: readonly EncounterTable[],
): EncounterTable | null {
  const method = METHOD_BY_TERRAIN[terrain];
  return method === undefined ? null : tableFor(map, method, tables);
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
  const table = tableForTerrain(map, terrain, tables);
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
  | { kind: "obstacle"; object: MapObject; ability: FieldAbilityId }
  /**
   * フィールド行動（v1.1-c）。釣り・探知のように**何も置いていないマス**に
   * 向かって起きるもの。障害物（`obstacle`）と分けてあるのは、
   * あちらが「置いてあるものをどける」で、こちらが「地形に働きかける」だから。
   */
  | {
      kind: "field";
      ability: FieldAbility;
      action: FieldAction;
      /** `reveal` のときの隠しアイテム。それ以外は null。 */
      object: MapObject | null;
      at: { x: number; y: number };
    };

/** 目の前を調べる。話しかけ・看板・調べる warp・障害物。 */
export function interact(
  map: MapData,
  world: WorldState,
  position: PlayerPosition,
  /** 使えるフィールド行動の定義（v1.1-c）。省略すると釣りも探知も起きない。 */
  abilities: readonly FieldAbility[] = [],
): InteractResult | null {
  const { dx, dy } = STEP[position.facing];
  const x = position.x + dx;
  const y = position.y + dy;

  const warp = warpAt(map, x, y, "interact");
  if (warp !== null) return { kind: "warp", warp };

  const object = objectAt(map, world, x, y);
  if (object !== null) {
    if (object.kind.type === "obstacle") {
      return { kind: "obstacle", object, ability: object.kind.clearedBy };
    }
    if (object.event !== undefined) return { kind: "event", event: object.event, object };
    return null;
  }

  // **見えているものが先。** 何も無いマスに向かって初めて、地形に働きかける
  // （水面に釣り糸を垂らす・地面を探る）。順番を逆にすると、
  // 水の上に置いた道具を調べたときに釣りが始まる
  const buried = hiddenItemAt(map, world, x, y);
  const found = fieldActionAt(abilities, world, {
    terrain: terrainAt(map, x, y),
    hidden: buried !== null,
  });
  if (found === null) return null;
  return {
    kind: "field",
    ability: found.ability,
    action: found.action,
    object: found.action.kind === "reveal" ? buried : null,
    at: { x, y },
  };
}
