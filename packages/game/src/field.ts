/**
 * マップ探索画面（v0.7）。
 *
 * core は「状態 + 入力 → 新しい状態 + 起きたこと」しか返さない。
 * ここは **描く・待つ・入力を取る** だけを担当する。
 *
 * 絵は1枚も無い前提で描く（game-plan.md §10）。
 * タイルの色は **地形と通行可否から決める** ―― タイル文字から決めると、
 * 見た目とルールを分けた意味が無くなる。
 *
 * 設計: docs/design/world.md / docs/design/ui-flow.md
 */

import {
  addCaught,
  isUsable,
  refused,
  teachToInstance,
  useOnInstance,
  applyBattleResult,
  chooseOption,
  createInstance,
  deposit,
  emptyEncounterState,
  PARTY_SIZE,
  reorder,
  emptyWorldState,
  evolutionFor,
  fieldAbilitiesFor,
  syncAbilities,
  objectKey,
  evolve,
  healParty,
  instanceToSpec,
  interact,
  pickEncounter,
  tableFor,
  type InteractResult,
  levelOf,
  maxHpOf,
  withdraw,
  release,
  replaceInstance,
  replaceMove,
  startEvent,
  stepEvent,
  stepPlayer,
  createRng,
  objectAt,
  visibleObjects,
  writeBack,
  type Direction,
  type EncounterState,
  type EventEffect,
  type EventId,
  type FieldAbilityId,
  type HallOfFameEntry,
  type MapData,
  type MapObject,
  type BattlePokemon,
  type PokemonInstance,
  type PostBattleEvent,
  type PlayerPosition,
  type Rng,
  type TerrainId,
  type WorldState,
} from "@pkmn/core";
import { speciesFigure } from "./art/sprites.js";
import {
  allBalls,
  artFor,
  allEncounterTables,
  allFieldAbilities,
  allFieldRules,
  allMaps,
  allItems,
  allNatures,
  allSpecies,
  eventById,
  gameData,
  mapById,
  regionById,
  shopById,
  trainerById,
} from "@pkmn/data";
import { $, runBattle, type BattleOutcome } from "./battle-screen.js";
import { escape } from "./team-select.js";
import {
  autosave,
  enterRegion,
  player,
  recordHallOfFame,
  returnToHub,
  save,
  sendToStorage,
} from "./player.js";
import { openExchangeScreen, openFacilityScreen, openTournamentScreen } from "./screens.js";
import { buildingsOf, drawBuilding } from "./art/buildings.js";
import { drawTile, shade, TILE_ALIAS, type TileView } from "./art/tiles.js";
import { STATUS_LABEL, TYPE_COLOR, TYPE_LABEL } from "./view.js";

const TILE = 28;
/** 表示するマス数。マップが小さいときは切り詰める。 */
const VIEW = { w: 15, h: 11 };
const WALK_MS = 130;
/**
 * じてんしゃ（v1.1-b）。**持っているだけで速い。**
 *
 * 変えるのは見た目の速さだけで、**1入力＝1マスは変えない。**
 * 2マス進む実装にすると `playthrough.mjs` と `shots.mjs` が同時に、
 * しかも黙ってずれる（1歩ぶんの予測と実際が食い違う）。
 * `core` は時間を持たないので、影響はこの定数1つに閉じる。
 */
const BIKE_MS = 62;
/**
 * いわくだき の岩から野生が出る確率（v1.1-c）。
 *
 * 原作は割ると必ず何か出るわけではない。**毎回出ると作業になり、
 * 出なさすぎると岩を割る意味が消える** ―― 半々から始めて、
 * 実測（world.md §5.1）を取り直すときに一緒に見直す。
 */
const ROCK_ENCOUNTER_RATE = 0.5;
const BICYCLE = "bicycle";

// ─────────────────────────────────────────────
// 見た目
//
// 描画そのものは art/ に置いてある（v0.10.5）。
// ここに残すのは「マップを読んで art/ に渡す」ぶんだけ。
// ─────────────────────────────────────────────

const OBJECT_COLOR: Record<string, string> = {
  npc: "#d95f5f",
  trainer: "#b23c8c",
  item: "#e0b33a",
  sign: "#8b6d4a",
  obstacle: "#6b5a3a",
  boulder: "#7d7266",
  switch: "#5a6b7d",
};

// ─────────────────────────────────────────────
// 画面
// ─────────────────────────────────────────────

export type FieldHandle = { stop: () => void };

/**
 * マップ画面を作る。
 *
 * `rebuild` は「この画面を捨てて作り直してくれ」と呼び出し側へ頼む口（v0.10）。
 * 地方へ入る／拠点へ戻るときは**居場所ごと変わる**ので、
 * 途中から書き換えるより作り直す方が安全 ―― 位置・手持ち・フラグが一斉に入れ替わる。
 */
export function playField(rebuild: () => void): FieldHandle {
  /**
   * `core` に渡す世界の状態。
   *
   * v0.8 まではここが独立した入れ物で、バッグだけ `player` 側と二重に持っていた。
   * v0.9 で **`player` を唯一の持ち主にした** ―― フラグ・バッグは同じオブジェクトを
   * 指すので、`core` が書き換えればそのまま保存される。数値（お金・バッジ）は
   * 参照を共有できないので、イベントの前後で写す。
   */
  const world: WorldState = emptyWorldState();
  const syncWorld = () => {
    world.flags = player.flags;
    world.bag = player.bag;
    world.badges = player.badges;
    world.money = player.money;
    world.partySpecies = party().map((p) => p.species);
    // **フラグ・バッジを写したあとで導く。** 順番を逆にすると、
    // ジムに勝った直後の1回だけ、まだ使えないことになる
    syncAbilities(allFieldAbilities, world);
  };
  const syncPlayer = () => {
    player.badges = world.badges;
    player.money = world.money;
  };

  let encounter: EncounterState = emptyEncounterState();
  /**
   * 規則のある場所で、あと何歩あるか（v1.1-h）。
   *
   * **保存しない。** `cleared` / `moved` と同じ派生値で、
   * 規則のある区画へ入るたびに数え直す ―― セーブに「あと何歩」が溜まると、
   * 歩数を変えた日に古いセーブが壊れる（それは規則ではなく事故）。
   */
  //
  // **持ち主は `player`**（v1.1-h）。ここ（`playField` の中）に置いていたら、
  // セーブ画面を開いて閉じるだけでフィールドが作り直され、500歩に戻っていた。
  const stepsLeft = () => player.rule?.stepsLeft ?? null;
  /** 今いる場所の規則。無ければ null。 */
  const ruleHere = () => {
    const id = currentMap().rules;
    return id === undefined ? null : (allFieldRules.find((r) => r.id === id) ?? null);
  };
  // 手持ち・ボックス・図鑑・バッグ・現在地は `player` に置く。
  // マップ画面の中に閉じ込めると、施設に持ち込めず、セーブにも載らない（player.ts）
  const party = () => player.storage.party;
  const setParty = (next: PokemonInstance[]) => {
    player.storage = { ...player.storage, party: next };
  };
  let stopped = false;
  let busy = false;
  /** 歩行アニメの進み具合（0→1）。描画にしか使わない。 */
  let walk: { from: PlayerPosition; to: PlayerPosition; start: number } | null = null;
  /** 今どちらを押しているか。離すまで歩き続ける（v0.8）。 */
  let heldDirection: Direction | null = null;

  const rng: Rng = createRng({ s: (Date.now() & 0x7fffffff) || 1, calls: 0 });

  // `world` を `player` に繋ぐ。これを忘れると、
  // **セーブから読んだフラグが効かず、開いたはずの道がまた閉じる**
  syncWorld();

  $("#menu").classList.add("hidden");
  $("#battle").classList.add("hidden");
  $("#run").classList.remove("hidden");
  $("#run").innerHTML = `
    <div class="field">
      <div class="field-head">
        <strong id="field-place"></strong>
        <span class="dim" id="field-party"></span>
      </div>
      <canvas id="field-canvas"></canvas>
      <div id="field-text" class="hidden"></div>
      <div id="field-panel" class="hidden"></div>
      <div class="field-pad">
        <div class="pad-cross">
          <button data-d="up">↑</button>
          <button data-d="left">←</button>
          <button data-d="right">→</button>
          <button data-d="down">↓</button>
        </div>
        <div class="pad-side">
          <button data-d="ok" class="pad-ok">けってい</button>
          <button id="open-box" class="pad-menu">てもち</button>
          <button id="open-bag" class="pad-menu">どうぐ</button>
          <button id="open-dex" class="pad-menu">ずかん</button>
          <button id="open-fly" class="pad-menu hidden">そらをとぶ</button>
        </div>
      </div>
      <p class="dim field-help">
        ボタンで いどう、「けってい」で しらべる<br />
        キーボードなら やじるしキー / WASD と Z
      </p>
    </div>`;

  const canvas = $<HTMLCanvasElement>("#field-canvas");
  const ctx = canvas.getContext("2d")!;

  const currentMap = (): MapData => mapById(player.position.map);

  // ── 描画 ──

  /** 足元の影。**これだけで「地面の上に立っている」ように見える。** */
  function dropShadow(cx: number, cy: number, radius: number): void {
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius, radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 今どこを見ているか（ピクセル単位）。
   *
   * v0.10 まではマス単位で、歩くたびに画面がガクッと1マスぶん飛んでいた。
   * 歩行アニメの進み具合をカメラにも反映すると、**地面が滑らかに流れる**。
   */
  function camera(map: MapData, px: number, py: number, cols: number, rows: number) {
    const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
    return {
      x: clamp(px - (cols - 1) / 2, map.size.width - cols) * TILE,
      y: clamp(py - (rows - 1) / 2, map.size.height - rows) * TILE,
    };
  }

  /** 1マスにかける時間。じてんしゃを持っていれば速い（v1.1-b）。 */
  const stepMs = () => ((player.bag[BICYCLE] ?? 0) > 0 ? BIKE_MS : WALK_MS);

  /** 歩行アニメを混ぜた「今の見た目の位置」。 */
  function shownPosition(): { x: number; y: number } {
    if (walk === null) return { x: player.position.x, y: player.position.y };
    const t = Math.min(1, (performance.now() - walk.start) / stepMs());
    return {
      x: walk.from.x + (walk.to.x - walk.from.x) * t,
      y: walk.from.y + (walk.to.y - walk.from.y) * t,
    };
  }

  function draw(): void {
    syncWorld();
    const map = currentMap();
    const cols = Math.min(VIEW.w, map.size.width);
    const rows = Math.min(VIEW.h, map.size.height);
    canvas.width = cols * TILE;
    canvas.height = rows * TILE;

    const shown = shownPosition();
    const cam = camera(map, shown.x, shown.y, cols, rows);
    const toScreenX = (mx: number) => mx * TILE - cam.x;
    const toScreenY = (my: number) => my * TILE - cam.y;

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 端数ぶん1マス多く描く（ピクセル単位で動かすと隙間が出るため）
    const firstX = Math.floor(cam.x / TILE);
    const firstY = Math.floor(cam.y / TILE);
    const lastX = Math.min(map.size.width - 1, firstX + cols);
    const lastY = Math.min(map.size.height - 1, firstY + rows);

    /**
     * そのマスの「種類」。同じ種類どうしは境目を描かない。
     *
     * `TILE_ALIAS` を通すので、**見えない壁は床と同じ種類**になる（v1.1-g）――
     * 通さないと、通行不可のマスの周りにだけ縁が出て、床の上に格子が浮かぶ。
     */
    const kindAt = (mx: number, my: number): string | null => {
      if (mx < 0 || my < 0 || mx >= map.size.width || my >= map.size.height) return null;
      const i = my * map.size.width + mx;
      const ground = map.layers.ground[i];
      const drawn = ground === undefined ? undefined : (TILE_ALIAS[ground] ?? ground);
      return drawn ?? map.terrain[i] ?? "normal";
    };

    // 建物のマスは後でまとめて描くので、地面の段では飛ばす
    const buildings = buildingsOf(map);
    const inBuilding = new Set<string>();
    for (const b of buildings) {
      for (let by = b.y; by < b.y + b.h; by += 1) {
        for (let bx = b.x; bx < b.x + b.w; bx += 1) inBuilding.add(`${bx},${by}`);
      }
    }

    for (let my = firstY; my <= lastY; my += 1) {
      for (let mx = firstX; mx <= lastX; mx += 1) {
        if (inBuilding.has(`${mx},${my}`)) continue;
        const i = my * map.size.width + mx;
        const kind = kindAt(mx, my);
        const view: TileView = {
          terrain: map.terrain[i] ?? "normal",
          blocked: map.collision[i] === true,
          hint: map.layers.ground[i],
          same: {
            up: kindAt(mx, my - 1) === kind,
            down: kindAt(mx, my + 1) === kind,
            left: kindAt(mx - 1, my) === kind,
            right: kindAt(mx + 1, my) === kind,
          },
        };
        drawTile(ctx, view, toScreenX(mx), toScreenY(my), TILE);
      }
    }

    // ── warp（床の模様）──
    // ドアが見えないと往復できない。**踏む warp は明るく、調べる warp は暗く**
    for (const warp of map.warps) {
      const x = toScreenX(warp.at.x);
      const y = toScreenY(warp.at.y);
      if (x < -TILE || y < -TILE || x > canvas.width || y > canvas.height) continue;
      ctx.fillStyle = warp.trigger === "step" ? "#f0e4bf" : "#5a3d21";
      ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
      ctx.fillStyle = shade(warp.trigger === "step" ? "#f0e4bf" : "#5a3d21", -0.15);
      ctx.fillRect(x + 4, y + TILE - 8, TILE - 8, 4);
    }

    // ── 建物 ──
    // 塊ごと描くので、warp（ドア）より後。ドアは建物の上に出したいので下でもう一度描く
    for (const b of buildings) {
      const x = toScreenX(b.x);
      const y = toScreenY(b.y);
      if (x + b.w * TILE < 0 || y + b.h * TILE < 0 || x > canvas.width || y > canvas.height) continue;
      drawBuilding(ctx, b, x, y, TILE);
    }
    // 建物の中にあるドアを描き直す（屋根に隠れてしまうため）
    for (const warp of map.warps) {
      if (!inBuilding.has(`${warp.at.x},${warp.at.y}`)) continue;
      const x = toScreenX(warp.at.x);
      const y = toScreenY(warp.at.y);
      ctx.fillStyle = "#6b4a2a";
      ctx.fillRect(x + 5, y + 4, TILE - 10, TILE - 4);
      ctx.fillStyle = "#d9c48c";
      ctx.fillRect(x + TILE - 10, y + TILE / 2, 3, 3);
    }

    /**
     * トレーナーの視線（v0.12）。
     *
     * `spotterAt` と**同じ規則で切る** ―― 壁や他のオブジェクトで途切れる。
     * 見えているものと当たり判定がずれると、そちらの方が理不尽になる。
     */
    function drawGaze(object: MapObject, on: MapData, ox: number, oy: number): void {
      if (object.kind.type !== "trainer") return;
      const dir = object.kind.direction;
      const dx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
      const dy = dir === "up" ? -1 : dir === "down" ? 1 : 0;

      // 向いている側の頭に印を置く（1マス先が壁でも、向きは分かるように）
      ctx.fillStyle = "#f5f0dc";
      ctx.fillRect(
        ox + TILE / 2 - 3 + dx * (TILE / 2 - 5),
        oy + TILE / 2 - 3 + dy * (TILE / 2 - 5),
        6,
        6,
      );

      ctx.save();
      // 薄すぎると「なんとなく明るい」で終わって読めない。
      // 濃すぎると地形が見えなくなる ―― 撮って見比べてこの辺りにした
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ffdf7a";
      for (let step = 1; step <= object.kind.sight; step += 1) {
        const sx = object.at.x + dx * step;
        const sy = object.at.y + dy * step;
        if (sx < 0 || sy < 0 || sx >= on.size.width || sy >= on.size.height) break;
        if (on.collision[sy * on.size.width + sx] === true) break;
        const between = objectAt(on, world, sx, sy);
        if (between !== null && between.kind.type !== "switch") break;
        ctx.fillRect(toScreenX(sx) + 4, toScreenY(sy) + 4, TILE - 8, TILE - 8);
      }
      ctx.restore();
    }

    // ── オブジェクト ──
    // **スイッチを先に描く**（v1.1-f）。床なので、乗っている岩に隠れる側でないと
    // 「岩の上に板が浮いている」絵になる
    const drawn = [...visibleObjects(map, world)].sort(
      (a, b) => Number(a.kind.type !== "switch") - Number(b.kind.type !== "switch"),
    );
    for (const object of drawn) {
      const x = toScreenX(object.at.x);
      const y = toScreenY(object.at.y);
      if (x < -TILE || y < -TILE || x > canvas.width || y > canvas.height) continue;
      const color = OBJECT_COLOR[object.kind.type] ?? "#888";

      if (object.kind.type === "item") {
        dropShadow(x + TILE / 2, y + TILE * 0.78, TILE * 0.22);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + TILE / 2, 6, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (object.kind.type === "switch") {
        // 床の板。岩が乗ると沈んで見えるように、上に岩があれば枠だけにする
        ctx.fillStyle = color;
        ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
        ctx.fillStyle = shade(color, 0.3);
        ctx.fillRect(x + 7, y + 7, TILE - 14, TILE - 14);
        continue;
      }
      if (object.kind.type === "boulder") {
        dropShadow(x + TILE / 2, y + TILE * 0.82, TILE * 0.3);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + TILE / 2, TILE * 0.36, 0, Math.PI * 2);
        ctx.fill();
        // 削れた面。ただの丸だと道具のボールと見分けがつかない
        ctx.fillStyle = shade(color, 0.22);
        ctx.beginPath();
        ctx.arc(x + TILE * 0.4, y + TILE * 0.4, TILE * 0.16, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (object.kind.type === "sign") {
        dropShadow(x + TILE / 2, y + TILE * 0.82, TILE * 0.26);
        ctx.fillStyle = shade(color, -0.25);
        ctx.fillRect(x + TILE / 2 - 2, y + TILE * 0.5, 4, TILE * 0.42);
        ctx.fillStyle = color;
        ctx.fillRect(x + 5, y + 5, TILE - 10, TILE * 0.46);
        continue;
      }
      // NPC。**足元に影を落とすと、地面の上に立って見える**
      dropShadow(x + TILE / 2, y + TILE * 0.84, TILE * 0.3);
      ctx.fillStyle = color;
      ctx.fillRect(x + 6, y + 4, TILE - 12, TILE - 9);
      ctx.fillStyle = shade(color, -0.28);
      ctx.fillRect(x + 6, y + TILE - 8, TILE - 12, 3);

      // トレーナーは**視線を見せる**（v0.12）。
      // 姿がただの四角である以上、どちらを向いているか分からないまま
      // 見つかるのは理不尽でしかない。見えている範囲だけ薄く引く
      if (object.kind.type === "trainer") drawGaze(object, map, x, y);
    }

    // ── プレイヤー ──
    const sx = toScreenX(shown.x);
    const sy = toScreenY(shown.y);
    dropShadow(sx + TILE / 2, sy + TILE * 0.86, TILE * 0.3);
    ctx.fillStyle = "#f4f2ee";
    ctx.fillRect(sx + 6, sy + 4, TILE - 12, TILE - 9);
    ctx.fillStyle = "#c9c4bb";
    ctx.fillRect(sx + 6, sy + TILE - 8, TILE - 12, 3);
    ctx.fillStyle = "#2a2a2a";
    const eye = { up: [0, -1], down: [0, 4], left: [-4, 1], right: [4, 1] }[player.position.facing]!;
    ctx.fillRect(sx + TILE / 2 - 3 + eye[0]!, sy + TILE / 2 - 2 + eye[1]!, 6, 3);

    // ── overhead ──
    // 木の下に入ったら上に葉がかぶる。**データにある層を初めて使う**（v0.7 から空だった）
    for (let my = firstY; my <= lastY; my += 1) {
      for (let mx = firstX; mx <= lastX; mx += 1) {
        const over = map.layers.overhead[my * map.size.width + mx];
        if (over === undefined || over === "" || over === ".") continue;
        ctx.globalAlpha = 0.75;
        drawTile(
          ctx,
          {
            terrain: "normal",
            blocked: true,
            hint: over,
            same: { up: false, down: false, left: false, right: false },
          },
          toScreenX(mx),
          toScreenY(my),
          TILE,
        );
        ctx.globalAlpha = 1;
      }
    }

    // **暗い場所**（v1.2-a）。フラッシュを使えるようになると解ける。
    //
    // 見えるマスの半径は `FieldRule.dark` が持つ ―― `core` は暗さを知らない。
    // 壁ではなく**幕**なので、暗くても歩けるし戦える（原作もそう）。
    // 幕は自機を中心に張る。歩行アニメの途中は `shown` が半端な座標を返すので、
    // **描いている位置（`shown`）に合わせる** ―― `player.position` に合わせると
    // 1歩ごとに明かりだけが先に飛ぶ。
    const dark = ruleHere()?.dark;
    const veiled = dark !== undefined && !world.abilities.includes("flash");
    // **幕が張られているかも印に出す**（v1.2-a）。`data-at` / `data-flags` と同じで、
    // 台本は絵を見られない ―― 出さないと「暗い」は確かめようの無い機能になる
    canvas.dataset["dark"] = veiled ? "1" : "0";
    if (veiled) {
      const cx = toScreenX(shown.x) + TILE / 2;
      const cy = toScreenY(shown.y) + TILE / 2;
      const inner = dark * TILE;
      const glow = ctx.createRadialGradient(cx, cy, inner * 0.55, cx, cy, inner);
      glow.addColorStop(0, "rgba(0,0,0,0)");
      glow.addColorStop(1, "rgba(0,0,0,0.93)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // 円の外は勾配が届かない。**塗り残すと四隅だけ明るい**ので、別に潰す
      ctx.fillStyle = "rgba(0,0,0,0.93)";
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.arc(cx, cy, inner, 0, Math.PI * 2);
      ctx.fill("evenodd");
      ctx.restore();
    }

    // 自動テストから現在地を読むための印（画面には出ない）
    canvas.dataset["at"] = `${player.position.map} ${player.position.x},${player.position.y} ${player.position.facing}`;
    // **立っているフラグも出す**（v1.1-g-3）。台本の経路探索が
    // 「そのオブジェクトは今そこに居るのか」を推測せずに読めるようにする ――
    // 推測していたころは、どかない門番を素通りできると思い込んで
    // 同じ壁に何十回もぶつかっていた。画面には出ない印
    canvas.dataset["flags"] = Object.entries(player.flags)
      .filter(([, on]) => on === true)
      .map(([id]) => id)
      .join(",");
    // **バッジの数も出す**（v1.2-a）。フィールド技の条件は「フラグ ∧ バッジ」の2段で、
    // フラグだけでは台本が「使えるかどうか」を導けない ――
    // 導けないと、能力の一覧を台本の中に手で持つことになる（実際そうなっていた）
    canvas.dataset["badges"] = `${player.badges}`;
    // **入力を受け付けているかも出す**（v1.1-i）。
    //
    // 台本は1歩ごとに待ち時間を置いて次のキーを押す。その待ちは
    // 「歩けたときのアニメ」に合わせて決めてあったが、**ぶつかったときは
    // `BUMP_MS`(110ms) 止まる** ―― 自転車の1歩(95ms)より長い。
    // 差は15msで、じてんしゃに乗った版でだけ z が飲み込まれ、
    // ぶつかった相手に永久に話しかけられなくなっていた。
    // **時間を数え直すのではなく、受け付けているかを言う。**
    canvas.dataset["busy"] = busy ? "1" : "0";
    // **のこり歩数は見せる**（v1.1-h）。
    //
    // 見せないと「あと何歩か分からないまま追い出される」＝理不尽になる。
    // 原作のサファリも歩数を表示している。
    // 同時に、台本が歩数を読む唯一の口でもある ―― 500歩あるいたつもりで
    // 追い出されない回に、**減っていないのか数え直されたのかを画面から言えなかった。**
    const left = stepsLeft();
    canvas.dataset["steps"] = left === null ? "" : `${left}`;
    $("#field-place").textContent = left === null ? map.name : `${map.name}（のこり ${left}歩）`;
    // 使えないうちは出さない。**押せるのに何も起きないボタン**を置くより、
    // 覚えた瞬間に増える方が「手に入った」ことが伝わる
    $("#open-fly").classList.toggle("hidden", !world.abilities.includes("fly"));
    $("#field-party").textContent =
      party().length === 0
        ? "てもち なし"
        : "てもち: " + party()
            .map((p) => {
              const name = p.nickname ?? gameData.species(p.species).name;
              return `${name} Lv${levelOf(gameData, p)} ${p.currentHp}/${maxHpOf(gameData, p)}`;
            })
            .join(" ・ ");
  }

  function animateWalk(from: PlayerPosition, to: PlayerPosition, ms = stepMs()): Promise<void> {
    walk = { from, to, start: performance.now() };
    return new Promise((resolve) => {
      const tick = () => {
        draw();
        if (walk === null || performance.now() - walk.start >= ms) {
          walk = null;
          draw();
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /** 氷の上を滑る速さ（v1.1-k）。歩きより速い ―― 止まれないことが伝わればよい。 */
  const SLIDE_MS = 55;

  /**
   * 滑走の演出（v1.1-k）。
   *
   * `core` は**通ったマスの並び**を返すだけで、時間を持たない。
   * ここでやるのは、その並びを順に見せることだけ ――
   * 途中で止める手段は用意しない（止められるなら、それは滑走ではない）。
   */
  async function animateSlide(
    from: PlayerPosition,
    path: readonly { x: number; y: number }[],
  ): Promise<void> {
    let at = from;
    for (const to of path) {
      const next = { ...at, x: to.x, y: to.y };
      await animateWalk(at, next, SLIDE_MS);
      at = next;
    }
  }

  // ── メッセージ・選択肢 ──
  const textBox = $("#field-text");

  /**
   * 一瞬だけ出して、勝手に消える表示（v0.12）。
   *
   * トレーナーに見つかったときの「！」に使う。
   * **ここでキー入力を要求しない** ―― 見つかったのはこちらの操作ではないので、
   * 「押さないと進まない」を挟むと、理不尽さの上に手間が乗る。
   */
  function flash(text: string, ms = 650): Promise<void> {
    textBox.classList.remove("hidden");
    textBox.innerHTML = `<div class="text flash">${escape(text)}</div>`;
    return new Promise((resolve) => {
      setTimeout(() => {
        hideText();
        resolve();
      }, ms);
    });
  }

  function say(text: string, speaker?: string): Promise<void> {
    textBox.classList.remove("hidden");
    textBox.innerHTML = `
      ${speaker === undefined ? "" : `<div class="speaker">${escape(speaker)}</div>`}
      <div class="text">${escape(text).replace(/\n/g, "<br />")}</div>
      <div class="next">▼</div>`;
    return new Promise((resolve) => {
      const done = () => {
        window.removeEventListener("keydown", onKey);
        textBox.onclick = null;
        resolve();
      };
      const onKey = (e: KeyboardEvent) => {
        if (["z", "Z", "Enter", " ", "x", "X", "Escape"].includes(e.key)) {
          e.preventDefault();
          done();
        }
      };
      window.addEventListener("keydown", onKey);
      textBox.onclick = done;
    });
  }

  function ask(prompt: string, options: readonly string[]): Promise<number> {
    textBox.classList.remove("hidden");
    textBox.innerHTML = `
      <div class="text">${escape(prompt)}</div>
      <div class="choices">
        ${options.map((o, i) => `<button data-i="${i}">${escape(o)}</button>`).join("")}
      </div>`;
    return new Promise((resolve) => {
      for (const button of textBox.querySelectorAll<HTMLElement>("button")) {
        button.onclick = () => resolve(Number(button.dataset["i"]));
      }
    });
  }

  const hideText = () => {
    textBox.classList.add("hidden");
    textBox.innerHTML = "";
  };

  // ── イベント ──

  async function applyEffect(effect: EventEffect): Promise<void> {
    switch (effect.kind) {
      case "message":
        await say(effect.text, effect.speaker);
        return;
      case "warp":
        player.position = {
          map: effect.to,
          x: effect.x,
          y: effect.y,
          facing: effect.facing ?? player.position.facing,
        };
        encounter = emptyEncounterState();
        draw();
        return;
      case "gotItem": {
        // 在庫を増やすのは `core` の仕事（`world.bag` は `player.bag` そのもの）。
        // v0.8 まではここでも足していて、**同じ道具を2回もらっていた**
        const item = gameData.item(effect.item);
        await say(`${item.name} を ${effect.count}こ てにいれた!`);
        return;
      }
      case "teachMove": {
        // 技教え人（v1.2-d）。**わざマシンと同じ道を通る** ――
        // 誰に教えるか選ばせ、4つ埋まっていれば入れ替えを選ばせるところまで、
        // 道具のときと同じ関数（`chooseMember` / `offerMove`）を使う。
        // 覚えられるかどうかは `tutorMoves` が決める（マシンとは別の表）
        const taught = gameData.move(effect.move);
        const target = await chooseMember(`${taught.name} を だれに おしえますか?`);
        if (target === null) {
          hideText();
          return;
        }
        const result = teachToInstance(gameData, effect.move, target);
        if (refused(result)) {
          await say(result.reason);
          hideText();
          return;
        }
        player.storage = replaceInstance(player.storage, result.instance);
        if (result.message !== "") await say(result.message);
        if (result.then?.kind === "learnMove") {
          await offerMove(result.instance.uid, result.then.move);
        }
        hideText();
        await autosave();
        return;
      }
      case "gavePokemon": {
        // **手持ちから1匹 消す**（v1.1-i）。同じ種が複数居るなら先頭の1匹。
        // `core` は「誰を渡したか」までは決めない ―― あちらは種しか持たない
        const at = party().findIndex((p) => p.species === effect.species);
        if (at >= 0) {
          const gone = party()[at]!;
          setParty(party().filter((_, i) => i !== at));
          draw();
          await say(`${gameData.species(effect.species).name} と おわかれした…`);
          void gone;
        }
        return;
      }
      case "gotPokemon": {
        const species = gameData.species(effect.species);
        const got = createInstance(
            gameData,
            {
              species: effect.species,
              level: effect.level,
              region: currentMap().region,
              ...(effect.moves.length > 0 ? { moves: [...effect.moves] } : {}),
            },
            rng,
            allNatures.map((n) => n.id),
          );
        player.storage = addCaught(player.storage, got).storage;
        player.dex[effect.species] = "caught";
        draw();
        await say(`${species.name} を てもちに くわえた!`);
        return;
      }
      case "healed":
        setParty(healParty(gameData, party()));
        // **回復してもらった場所が、全滅したときに戻る場所になる。**
        // 原作のポケモンセンターと同じ規則を、回復イベント側に持たせる
        player.respawn = { ...player.position };
        draw();
        await say("ポケモンたちは げんきに なった!");
        return;
      case "giveBadge":
        // バッジは進行の目盛り。**数が増えたときだけ言う**
        player.badges = effect.count;
        draw();
        await say(`バッジを てにいれた! いま ${effect.count}こ もっている。`);
        return;
      case "moneyChanged":
        // **ここで `player` に写す**（v1.1-h の訂正）。
        //
        // `takeMoney` が減らすのは `world.money` で、`player` に戻るのは
        // イベントが終わったあとの `syncPlayer()` ―― のはずだった。
        // ところが `syncWorld()`（`draw()` と `arrive()` が呼ぶ）は
        // `player.money` を `world` に**上書き**するので、同じイベントの中で
        // warp や描画が起きた瞬間に、払ったお金が丸ごと戻ってくる。
        // サファリの受付は最後に warp するので、500円はらった表示のまま
        // 財布が減らなかった。
        //
        // すぐ隣の `giveBadge` は最初から `player` を直接いじっていて、
        // **同じ形の効果なのに片方だけ写していなかった。**
        player.money = Math.max(0, player.money + effect.delta);
        draw();
        await say(effect.delta >= 0 ? `${effect.delta}円 てにいれた!` : `${-effect.delta}円 はらった。`);
        return;
      case "battle":
        await trainerBattle(effect.trainer, effect.onWin, effect.onLose);
        return;
      case "shop":
        await openShop(effect.inventory);
        return;
      case "openBox":
        showStorage();
        return;
      case "openDex":
        showDex();
        return;

      // ── 拠点（v0.10）──
      case "enterRegion":
        // マップ画面ごと作り直す。**この playField は用済みになる**ので、
        // 呼び出し側（main.ts）に作り直しを頼んで、ここでは走るのをやめる
        hideText();
        enterRegion(effect.region);
        await autosave();
        rebuild();
        return;
      case "returnToHub":
        hideText();
        returnToHub();
        await autosave();
        rebuild();
        return;
      case "openFacility":
        hideText();
        await openFacilityScreen();
        draw();
        return;
      case "openExchange":
        hideText();
        await openExchangeScreen();
        draw();
        return;
      case "openTournament":
        hideText();
        await openTournamentScreen();
        draw();
        return;
      case "openStorage":
        showStorage();
        return;
      case "hallOfFame":
        await enterHallOfFame();
        return;
      case "openHall":
        showHall(null);
        return;
      case "wildBattle":
        // 固定シンボル（v1.1-c）。**逃げても倒しても終わり**にするのは
        // イベント側の仕事 ―― 直後の `setFlag` でシンボルが消える
        hideText();
        await wildBattle(effect.species, effect.level);
        return;
      case "wait":
      case "playSe":
      case "faceObject":
      case "choice":
        return;
      default:
        // **書き忘れをここで止める**（v1.1-i）。
        //
        // `EventEffect` に1件足したとき、この switch に case を書き忘れても
        // TypeScript は黙っていた ―― 戻り値が `void` なので、
        // どの case にも当たらずに抜けるのが**型として正しい**から。
        // 実際 `gavePokemon` を足したとき、UI 側は何もせず、
        // 「交換したのに手持ちが減らない」になるところだった。
        //
        // `assertAllEventCommandsHandled`（コマンド側）と同じ番人を、効果側にも置く。
        throw new Error(`未処理の EventEffect: "${(effect as { kind: string }).kind}"`);
    }
  }

  /**
   * イベントを最後まで進める。
   * core は中断点を返してくるだけなので、待つのはこちら側の仕事。
   */
  async function runEvent(id: EventId): Promise<void> {
    syncWorld();
    let runner = startEvent(eventById(id).commands);
    // 壊れたデータで無限ループしないよう上限を置く
    for (let guard = 0; guard < 500; guard += 1) {
      const result = stepEvent(runner, world);
      runner = result.runner;

      let choice: { prompt: string; options: string[] } | null = null;
      for (const effect of result.effects) {
        if (effect.kind === "choice") choice = effect;
        else await applyEffect(effect);
      }
      if (choice !== null) {
        runner = chooseOption(runner, await ask(choice.prompt, choice.options));
        continue;
      }
      if (runner.done || !result.waiting) break;
    }
    syncPlayer();
    hideText();
    draw();
    await autosave();
  }

  // ── バトル ──

  /** 戦える個体だけを、倒れていない順に並べて出す。 */
  const playable = () =>
    [...party()]
      .sort((a, b) => Number(a.currentHp <= 0) - Number(b.currentHp <= 0))
      .map((p) => instanceToSpec(gameData, p));

  const alive = () => party().filter((p) => p.currentHp > 0);

  function enterBattle(): void {
    // 押しっぱなしのままバトルに入ると、戻ってきた瞬間に歩き出してしまう
    heldDirection = null;
    $("#run").classList.add("hidden");
    hideText();
  }

  function leaveBattle(): void {
    $("#battle").classList.add("hidden");
    $("#run").classList.remove("hidden");
    draw();
  }

  /**
   * バトルの結果を手持ちへ書き戻し、戦闘後シーケンスを回す。
   *
   * **core は「何が起きたか」を返すだけで、演出も回復も UI の仕事。**
   * バトル中の演出と同じ形にしてある。
   */
  async function afterBattle(outcome: BattleOutcome, isWild: boolean): Promise<void> {
    const mine = outcome.state.sides[0].party;
    const foes = outcome.state.sides[1].party;

    // ── 1. HP・PP・状態異常を書き戻す ──
    // 並べ替えて出しているので、uid で突き合わせる（位置は当てにならない）
    const brought = playable();
    setParty(
      party().map((p) => {
        const index = brought.findIndex((b) => b.uid === p.uid);
        const after = index < 0 ? undefined : mine[index];
        return after === undefined ? p : writeBack(gameData, p, after);
      }),
    );

    // ── 2. 戦闘後シーケンス ──
    //
    // **倒した相手のぶんは、勝っていなくても入る（v0.12 の訂正）。**
    // v0.8 から「勝ったときだけ」にしていたので、3体のうち2体を倒して
    // 負けると経験値が1も入らなかった ―― 遊ぶ側からは
    // 「全員倒さないと経験値が入らない」に見える。
    //
    // 原作は**倒れたその瞬間に**経験値が入る。捕まえた場合は入らない（原作準拠）。
    const beaten = outcome.reason === "caught" ? [] : foes.filter((f) => f.currentHp <= 0);
    const result = applyBattleResult(gameData, {
      party: party(),
      participants: party().filter((p) => p.currentHp > 0).map((p) => p.uid),
      defeated: beaten,
      encountered: foes.map((f) => f.species),
      isWild,
      dex: player.dex,
    });
    setParty(result.party);
    player.dex = result.dex;
    draw();

    await showPostBattle(result.events);
    await autosave();
  }

  /** 戦闘後の出来事を1つずつ見せる。技の入れ替えと進化はここで選ばせる。 */
  async function showPostBattle(events: readonly PostBattleEvent[]): Promise<void> {
    const nameOf = (uid: string) => {
      const p = party().find((x) => x.uid === uid);
      return p === undefined ? "" : (p.nickname ?? gameData.species(p.species).name);
    };

    for (const event of events) {
      switch (event.kind) {
        case "expGained":
          await say(`${nameOf(event.uid)} は ${event.amount} けいけんちを もらった!`);
          break;
        case "levelUp":
          await say(`${nameOf(event.uid)} は レベル ${event.to} に あがった!`);
          break;
        case "learned":
          await say(`${nameOf(event.uid)} は ${gameData.move(event.move).name} を おぼえた!`);
          break;
        case "canLearn":
          await offerMove(event.uid, event.move);
          break;
        case "canEvolve":
          await offerEvolution(event.uid, event.to);
          break;
        case "dexUpdated":
          break;
      }
    }
    hideText();
    draw();
  }

  /**
   * 技が4つ埋まっているときの入れ替え。**選ぶのはプレイヤー。**
   *
   * 起きたかどうかを返す（v1.1-b）―― わざマシンは**覚えたときだけ減る。**
   * 「やめる」で消えると、取り返しのつかない操作を確認なしでやったことになる。
   */
  async function offerMove(uid: string, move: string): Promise<boolean> {
    const target = party().find((p) => p.uid === uid);
    if (target === undefined) return false;
    const name = target.nickname ?? gameData.species(target.species).name;
    const learn = gameData.move(move).name;

    await say(`${name} は ${learn} を おぼえたい!\nしかし わざは 4つまで。`);
    const options = [...target.moves.map((m) => gameData.move(m.id).name), "おぼえない"];
    const choice = await ask(`どの わざを わすれさせる?`, options);
    if (choice >= target.moves.length) {
      await say(`${name} は ${learn} を おぼえなかった。`);
      return false;
    }
    const forgotten = gameData.move(target.moves[choice]!.id).name;
    player.storage = replaceInstance(player.storage, replaceMove(gameData, target, choice, move));
    await say(`${name} は ${forgotten} を わすれて\n${learn} を おぼえた!`);
    return true;
  }

  /** 進化。**中断できる**（原作どおり）。 */
  async function offerEvolution(uid: string, to: string): Promise<boolean> {
    const target = party().find((p) => p.uid === uid);
    if (target === undefined) return false;
    const before = target.nickname ?? gameData.species(target.species).name;
    const after = gameData.species(to).name;

    const choice = await ask(`おや? ${before} の ようすが...!`, ["しんかさせる", "やめる"]);
    if (choice !== 0) {
      await say(`${before} の しんかが とまった!`);
      return false;
    }
    player.storage = replaceInstance(player.storage, evolve(gameData, target, to));
    player.dex[to] = "caught";
    draw();
    await say(`おめでとう! ${before} は\n${after} に しんかした!`);
    return true;
  }

  /**
   * 全滅（economy.md §2）。
   *
   * 戻り先は固定の家ではなく `player.respawn` ―― 最後に回復した場所。
   * **お金は既定では失わない。** ペナルティは時間を奪うだけで何も教えないため、
   * 9地方ぶん積み重なる摩擦として落とした。原作の緊張感が要る人は設定で選ぶ。
   */
  const CLASSIC_LOSS_RATIO = 0.5;

  async function blackOut(): Promise<void> {
    setParty(healParty(gameData, party()));
    player.position = { ...player.respawn };
    encounter = emptyEncounterState();

    const lost =
      save.settings.lossPenalty === "classic"
        ? Math.floor(player.money * CLASSIC_LOSS_RATIO)
        : 0;
    player.money -= lost;
    syncWorld();
    draw();

    await say("めのまえが まっくらに なった...");
    if (lost > 0) await say(`${lost}円を おとしてしまった...`);
    await say(
      `${mapById(player.respawn.map).name} まで もどった。\nポケモンたちは げんきに なった!`,
    );
    hideText();
    draw();
    await autosave();
  }

  async function wildBattle(species: string, level: number): Promise<void> {
    const name = gameData.species(species).name;
    if (alive().length === 0) {
      // 手持ち0（または全員ひんし）でエンカウントすると戦闘が成立しない。
      // データ上は起きないはずだが、マップを足したときに真っ先に壊れるのがここ
      await say(`やせいの ${name} が とびだしてきた!\nしかし たたかえる ポケモンが いない ―― いそいで にげだした。`);
      hideText();
      return;
    }
    // 捕まえたときに手持ちへ入るのは**この個体そのもの**。
    // 見た目だけ同じ別個体を作ると、削ったHPも個体値も引き継がれない
    const target = wildInstance(species, level);

    // サファリでは技も交代も使えず、投げられるボールも1種類だけ（v1.1-h）。
    // **規則はマップが指しているものをそのまま読む** ―― 場所の名前で分岐しない
    const rule = ruleHere();
    const safari = rule !== null && !rule.canFight;

    enterBattle();
    const outcome = await runBattle({
      parties: [playable(), [instanceToSpec(gameData, target)]],
      seed: rng.int(1_000_000),
      ai: { policy: "basic", mistakeRate: 0.35, knowledge: "fair" },
      headline: `あっ! やせいの ${name} が とびだしてきた!`,
      isWild: true,
      ...(safari ? { safari: true } : {}),
      balls: () =>
        allBalls
          .map((b) => ({ id: b.id, count: player.bag[b.id] ?? 0 }))
          .filter((b) => b.count > 0)
          // 規則がボールを指定していれば、それ以外は投げられない
          .filter((b) => rule?.ball === undefined || b.id === rule.ball),
      onBallUsed: (item) => {
        player.bag[item] = Math.max(0, (player.bag[item] ?? 0) - 1);
      },
      items: () => (safari ? [] : usableItems("battle")),
      onItemUsed: spendItem,
    });
    leaveBattle();

    // **ボールが尽きたらそこで終わり**（v1.1-h）。
    // 歩数と並ぶもう1つの終わり方で、原作と同じ
    if (safari && rule !== null && (player.bag[rule.ball ?? ""] ?? 0) <= 0) {
      player.rule = null;
      if (rule.expire !== undefined) await runEvent(rule.expire);
      return;
    }

    if (outcome.reason === "caught") {
      await onCaught(target, outcome.state.sides[1].party[0]!, species);
      return;
    }

    await afterBattle(outcome, true);
    if (outcome.winner === 1) await blackOut();
  }

  /** 捕まえた1体を器へ入れ、図鑑を埋める。 */
  async function onCaught(
    target: PokemonInstance,
    after: BattlePokemon,
    species: string,
  ): Promise<void> {
    const name = gameData.species(species).name;
    // 弱らせた状態のまま手持ちに入る（満タンで入ると、削った意味が消える）
    const caught = writeBack(gameData, target, after);

    const first = (player.dex[species] ?? "unknown") !== "caught";
    player.dex[species] = "caught";

    const result = addCaught(player.storage, caught);
    player.storage = result.storage;
    draw();

    await say(
      result.to === "party"
        ? `${name} を てもちに くわえた!`
        : `${name} は ボックスに おくられた。`,
    );
    if (first) await say(`${name} の データが ずかんに とうろくされた!`);
    hideText();
    draw();
    await autosave();
  }

  /** 野生の1体。個体値も性格も個体ごとに決まる（捕まえられるのは v0.8 の後半）。 */
  const wildInstance = (species: string, level: number) =>
    createInstance(
      gameData,
      { species, level, region: currentMap().region },
      rng,
      allNatures.map((n) => n.id),
    );

  async function trainerBattle(id: string, onWin?: EventId, onLose?: EventId): Promise<void> {
    const trainer = trainerById(id);
    if (alive().length === 0) {
      await say("たたかえる ポケモンが いない...");
      hideText();
      return;
    }
    enterBattle();
    const outcome = await runBattle({
      parties: [playable(), trainer.party],
      seed: rng.int(1_000_000),
      ai: { policy: "basic", mistakeRate: trainer.mistakeRate ?? 0.25, knowledge: "fair" },
      headline: `${trainer.class} ${trainer.name} が しょうぶを しかけてきた!`,
      items: () => usableItems("battle"),
      onItemUsed: spendItem,
    });
    leaveBattle();

    await afterBattle(outcome, false);
    const next = outcome.winner === 0 ? onWin : onLose;
    if (next !== undefined) await runEvent(next);
    if (outcome.winner === 1) await blackOut();
  }

  // ── 入力 ──

  /** 向き直り・壁にぶつかったときの間。**0 にすると押しっぱなしが暴走する。** */
  const BUMP_MS = 110;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /**
   * 1入力ぶんの移動。
   *
   * `core` は原作どおり「違う方向を向いた最初の入力は向き直りだけ」を返す。
   * **ボタンを1回叩く操作では、これが「反応しなかった」に見える。**
   * そこで UI 側で、向き直ったあとに同じ方向へもう一度試す。
   *   - 進める先なら → 向き直り + 1歩（1タップで動く）
   *   - 壁や看板なら → 向き直りだけ（調べられる。原作の意図はこちら）
   * 向き直りの意味は「壁際で向きを変えられる」ことなので、これで損なわれない。
   */
  async function tryStep(direction: Direction, turned = false): Promise<void> {
    const map = currentMap();
    syncWorld();
    const before = player.position;
    const result = stepPlayer(map, world, player.position, encounter, direction, rng, allEncounterTables);
    player.position = result.position;
    encounter = result.encounter;
    // **岩の移動を世界に書くのはここだけ**（v1.1-f）。`core` は
    // 「押せた・押した先はここ」としか言わない ―― `cleared` と同じ受け渡しで、
    // 保存しない状態を1箇所に集める。
    // **draw() より前**に置くのは、あとにすると押した瞬間の1フレームだけ
    // 岩とプレイヤーが同じマスに重なって見えるから
    if (result.outcome.kind === "pushed") {
      world.moved[objectKey(before.map, result.outcome.object)] = result.outcome.to;
    }

    /**
     * 着いたところまで見せる（v1.1-k）。
     *
     * 滑ったときは**通ったマスを順に**、そうでなければいつもの1歩。
     * `outcome` ごとに `animateWalk` を書くと、滑走を足した日に
     * **1箇所だけ直し忘れて瞬間移動する出口**ができる ―― 入口を1つにする。
     */
    const arrive = async (): Promise<void> => {
      if (result.slid !== undefined) await animateSlide(before, result.slid);
      else await animateWalk(before, player.position);
    };

    if (result.outcome.kind === "moved" || result.outcome.kind === "jumped") {
      await arrive();
      await spendStep();
      return;
    }
    // **滑って何かに行き当たったときは、先に滑りを見せる。**
    // `draw()` だけ先に呼ぶと、出入口や野生の直前で1フレーム瞬間移動する
    if (result.slid !== undefined) await animateSlide(before, result.slid);
    draw();

    switch (result.outcome.kind) {
      case "warp":
        await doWarp(result.outcome.warp);
        return;
      case "encounter":
        if (result.slid === undefined) await arrive();
        await wildBattle(result.outcome.species, result.outcome.level);
        return;
      case "event":
        if (result.slid === undefined) await arrive();
        await runEvent(result.outcome.event);
        return;
      case "spotted": {
        // **見つかった側が近づいてくる**（原作の「!」）。
        // プレイヤーの位置は動かさない ―― 動かすと、戦ったあとに
        // どこに立っていたか分からなくなる
        if (result.slid === undefined) await arrive();
        const spotter = result.outcome.object;
        player.position = { ...player.position, facing: facingTowards(spotter.at) };
        draw();
        await flash("！");
        await runEvent(result.outcome.event);
        return;
      }
      case "pushed": {
        // 岩は上（draw() の前）で動かしてある。ここでやるのは演出だけ ――
        // 歩きを見せて、スイッチに乗ったときだけイベントを流す
        const { event } = result.outcome;
        await animateWalk(before, player.position);
        // スイッチに乗ったときだけイベント（中身は setFlag）
        if (event !== undefined) await runEvent(event);
        return;
      }
      case "turned":
        // 向き直った直後に1回だけ続ける（無限に再帰しないよう turned で止める）
        if (!turned) await tryStep(direction, true);
        else await sleep(BUMP_MS);
        return;
      default:
        // 壁。**歩いていないので待ち時間が無い。**
        // ここで待たないと、押しっぱなしの繰り返しが await を挟まず回り続け、
        // 画面が固まって指を離すことすらできなくなる
        await sleep(BUMP_MS);
        return;
    }
  }

  /**
   * 歩数を1つ使う（v1.1-h）。尽きたら追い出しのイベントへ。
   *
   * **減らすのは「歩けた」ときだけ。** 壁にぶつかった入力や向き直りで
   * 減ると、遊ぶ側から見て理由の分からない終わり方になる。
   */
  async function spendStep(): Promise<void> {
    const active = player.rule;
    if (active === null) return;
    const left = active.stepsLeft - 1;
    if (left > 0) {
      player.rule = { ...active, stepsLeft: left };
      return;
    }
    const rule = ruleHere();
    player.rule = null;
    if (rule?.expire !== undefined) await runEvent(rule.expire);
  }

  /** そのマスの方を向く。見つかったときに、こちらも相手を見る。 */
  function facingTowards(at: { x: number; y: number }): Direction {
    const dx = at.x - player.position.x;
    const dy = at.y - player.position.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
  }

  async function doWarp(warp: { to: { map: string; x: number; y: number; facing: Direction } }) {
    player.position = { map: warp.to.map, x: warp.to.x, y: warp.to.y, facing: warp.to.facing };
    encounter = emptyEncounterState();
    draw();
    await new Promise((r) => setTimeout(r, 80));
    // マップ遷移はセーブ点（save-data.md §6）。落ちても直前の建物には戻れる
    await autosave();
    await arrive();
  }

  /**
   * 今どのマップに居ることになっているか。`arrive()` の判定に使う。
   *
   * **空文字から始める。** 現在地で初期化すると、続きから始めた町だけが
   * 「まだ来ていない」ままになり、そらをとぶ の行き先から抜け落ちる。
   */
  let lastMap = "";

  /**
   * マップに入った直後の処理（v0.12-d）。
   *
   * warp を踏んだ直後だけでなく、**イベントの中で飛ばされた場合にも要る**ので、
   * 「マップIDが変わっていたら」で判定する。呼び出し口を増やしても二重に走らない。
   *
   * ここでしかフラグを立てないので、`onEnter` を書き忘れたマップは
   * そらをとぶ の行き先にならない ―― それは検証が落とす。
   */
  async function arrive(): Promise<void> {
    // onEnter がさらに warp することがある（戻れない部屋）。回数で歯止めをかける
    for (let guard = 0; guard < 8; guard += 1) {
      if (player.position.map === lastMap) break;
      lastMap = player.position.map;
      // どけた障害物と押した岩は出入りで元に戻る（原作と同じ）
      world.cleared = [];
      world.moved = {};
      // 規則のある区画に入ったら歩数を数え直す（v1.1-h）。
      // **同じ規則の中を歩き回っても数え直さない** ―― サファリの
      // 4枚は1つの区画で、エリアを跨ぐたびに満タンに戻ったら制限にならない。
      // **規則が無い場所へ出たら null に戻す** ―― 残したままにすると、
      // サファリの外を歩いて「じかんです」と言われる
      // **歩数を持たない規則もある**（暗い洞窟・v1.2-a）。数えないので `rule` に載せない
      const rule = ruleHere();
      if (rule === null || rule.steps === undefined) player.rule = null;
      else if (player.rule?.id !== rule.id) player.rule = { id: rule.id, stepsLeft: rule.steps };
      const script = currentMap().onEnter;
      if (script === undefined) break;
      await runEvent(script);
    }
    syncWorld();
    draw();
  }

  async function tryInteract(): Promise<void> {
    syncWorld();
    const found = interact(currentMap(), world, player.position, allFieldAbilities);
    if (found === null) return;
    if (found.kind === "warp") await doWarp(found.warp);
    else if (found.kind === "obstacle") await tryClear(found.object, found.ability);
    else if (found.kind === "field") await tryFieldAction(found);
    else await runEvent(found.event);
  }

  /**
   * 地形に働きかける（v1.1-c）―― 釣りと探知。
   *
   * **どちらも「何も置いていないマス」に向かって起きる。**
   * 岩や木のように置いてあるものをどける `tryClear` とは分けてある。
   */
  async function tryFieldAction(
    found: Extract<InteractResult, { kind: "field" }>,
  ): Promise<void> {
    const { ability, action } = found;
    try {
      await say(ability.useText.replace("{name}", ability.name));
      if (action.kind === "reveal") {
        const event = found.object?.event;
        if (event === undefined) {
          await say("なにも みつからなかった。");
          return;
        }
        hideText();
        await runEvent(event);
        return;
      }
      const table = tableFor(currentMap(), action.method, allEncounterTables);
      // **表が無ければ何も釣れない。** 空振りを黙って無かったことにせず、文を出す
      if (table === null || table.entries.length === 0) {
        await say("...なにも かからない。");
        return;
      }
      const picked = pickEncounter(table, rng);
      hideText();
      await wildBattle(picked.species, picked.level);
    } finally {
      hideText();
      draw();
    }
  }

  /**
   * 障害物をどける（v0.12-d）。
   *
   * **どけた記録は `world.cleared` にしか残らない**（`core` の設計どおり
   * セーブに載せない）。マップを出入りすれば元に戻る ―― 原作と同じ。
   */
  async function tryClear(object: MapObject, ability: FieldAbilityId): Promise<void> {
    const spec = allFieldAbilities.find((a) => a.id === ability);
    if (spec === undefined) return;
    // **どの道を通っても最後に会話枠を閉じる。**
    // 閉じ忘れると `press()` が入力を会話側へ渡し続け、
    // 岩をどけた直後から一歩も動けなくなる（v0.12-d の台本が丸ごと止まった）
    try {
      await say(spec.lockedText);
      if (!world.abilities.includes(ability)) return;
      if ((await ask(`${spec.name} を つかいますか?`, ["はい", "いいえ"])) !== 0) return;
      world.cleared.push(objectKey(player.position.map, object));
      await say(spec.useText.replace("{name}", spec.name));

      // **どけた先から野生が出る**（いわくだき・v1.1-c）。
      // 「どける」と「出る」を1つの能力に持たせてあるので、
      // データに `then` を1行足すだけで別の能力にも付けられる
      const then = (spec.effect?.kind === "clear" ? spec.effect.then : undefined) ?? null;
      if (then !== null) {
        const table = tableFor(currentMap(), then.method, allEncounterTables);
        if (table !== null && table.entries.length > 0 && rng.chance(ROCK_ENCOUNTER_RATE)) {
          const picked = pickEncounter(table, rng);
          hideText();
          draw();
          await wildBattle(picked.species, picked.level);
        }
      }
    } finally {
      hideText();
      draw();
    }
  }

  const KEYS: Record<string, Direction> = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };

  /**
   * 押しっぱなしで歩き続ける。
   *
   * 1歩ごとに入力を要求すると、**スマホでは指を何度も叩くことになる。**
   * しかも歩行アニメ中の入力を捨てていたので、連打しても進まなかった。
   * 「今どちらを押しているか」を状態として持ち、離すまで歩き続ける形にする。
   */
  function press(action: Direction | "ok"): void {
    if (stopped) return;
    // 会話中は十字キーを効かせない（メッセージ側が入力を取っている）
    if (!textBox.classList.contains("hidden")) return;
    if (action === "ok") {
      void once(tryInteract);
      return;
    }
    heldDirection = action;
    void walkWhileHeld();
  }

  /** 十字キーを離した。core の `release`（ポケモンを逃がす）とは別物。 */
  function releaseInput(action: Direction | "ok"): void {
    if (action !== "ok" && heldDirection === action) heldDirection = null;
  }

  /** 押している間だけ歩く。二重に走らないよう busy で入口を1つに絞る。 */
  async function walkWhileHeld(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      // 1回は必ず歩く（軽いタップでも反応する）
      do {
        const direction = heldDirection;
        if (direction === null) break;
        await tryStep(direction);
      } while (heldDirection !== null && !stopped);
      await arrive();
    } finally {
      busy = false;
    }
  }

  async function once(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await action();
      await arrive();
    } finally {
      busy = false;
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    // メッセージ表示中はそちらが入力を取る
    if (!textBox.classList.contains("hidden")) return;
    const direction = KEYS[e.key];
    if (direction !== undefined) {
      e.preventDefault();
      if (!e.repeat) press(direction);
      return;
    }
    if (["z", "Z", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      press("ok");
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const direction = KEYS[e.key];
    if (direction !== undefined) releaseInput(direction);
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // ── 十字キー ──
  // click ではなく pointer で取る。押した瞬間に歩き出し、離すまで続ける
  const pad = $("#run").querySelector<HTMLElement>(".field-pad")!;
  const actionOf = (target: EventTarget | null): Direction | "ok" | null => {
    const value = (target as HTMLElement | null)?.dataset?.["d"];
    return value === undefined ? null : (value as Direction | "ok");
  };

  pad.addEventListener("pointerdown", (e) => {
    const action = actionOf(e.target);
    if (action === null) return;
    e.preventDefault();
    // 指が動いてもボタンから外れないように捕まえておく
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    press(action);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) {
    pad.addEventListener(type, (e) => {
      const action = actionOf(e.target);
      if (action !== null) releaseInput(action);
    });
  }
  // 押しっぱなしで文脈メニューが出るのを止める
  pad.addEventListener("contextmenu", (e) => e.preventDefault());

  // ── 手持ち・ボックス・図鑑 ──
  const panel = $("#field-panel");
  const closePanel = () => {
    panel.classList.add("hidden");
    panel.innerHTML = "";
  };

  /** 一覧に出す小さい姿（v0.12.5）。バトル画面と同じレシピで描く。 */
  const iconOf = (id: string) => `<span class="mon-icon">${speciesFigure(artFor(id))}</span>`;

  const lineOf = (p: PokemonInstance) => {
    const species = gameData.species(p.species);
    const hp = `${p.currentHp}/${maxHpOf(gameData, p)}`;
    const status = p.status === null ? "" : ` <span class="st">${STATUS_LABEL[p.status]}</span>`;
    return `${iconOf(p.species)}<strong>${escape(p.nickname ?? species.name)}</strong>
      <span class="meta">Lv${levelOf(gameData, p)} ・ ${hp}${status}</span>`;
  };

  /**
   * 手持ちとボックス。
   *
   * **どのボックスを見ているかは居場所で変わる**（v0.10・capture.md §4）。
   *   地方に居る … 地方ボックス。共通ボックスへ「おくる」ことはできるが引き出せない
   *   拠点に居る … 共通ボックス。ここでだけ引き出して編成できる
   *
   * 設計（capture.md §5）は検索・ソート・チーム保存まで求めているが、
   * **数千個体になるまで要らない。** 数が増えてから足す。
   */
  /**
   * そらをとぶ（v0.12-d）。
   *
   * 行き先は **マップ側が名乗る**（`flyPoint`）。「行ける町の一覧」を
   * どこか別の表に持つと、マップを消したときにそこだけ残る。
   *
   * 建物の中からは飛べない ―― 原作と同じで、屋根の下から空へは出られない。
   */
  function showFly(): void {
    const outside = currentMap().encounters !== undefined || currentMap().flyPoint !== undefined;
    const places = allMaps.filter(
      (m) =>
        m.flyPoint !== undefined &&
        m.region === player.region &&
        (player.flags[m.flyPoint.flag] ?? false),
    );
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="panel-head">
        <strong>そらをとぶ</strong>
        <button class="ghost" id="panel-close">とじる</button>
      </div>
      ${
        !outside
          ? `<p class="dim">ここでは そらへ でられません。</p>`
          : places.length === 0
            ? `<p class="dim">まだ いったことのある まちが ありません。</p>`
            : `<ul class="mon-list">${places
                .map(
                  (m) => `<li>
                    <strong>${escape(m.name)}</strong>
                    <span class="row-actions">
                      <button data-fly="${m.id}"${
                        m.id === player.position.map ? " disabled" : ""
                      }>とぶ</button>
                    </span>
                  </li>`,
                )
                .join("")}</ul>`
      }`;
    $("#panel-close").onclick = closePanel;
    for (const button of panel.querySelectorAll<HTMLElement>("[data-fly]")) {
      button.onclick = () => {
        const target = mapById(button.dataset["fly"]!);
        const point = target.flyPoint!;
        closePanel();
        void once(async () => {
          await say(`そらを とんで ${target.name} へ むかった!`);
          hideText();
          await doWarp({ to: { map: target.id, x: point.x, y: point.y, facing: "down" } });
        });
      };
    }
  }

  /**
   * 殿堂入り（v1.0）。
   *
   * **記録を残してから見せる。** 見せてから残すと、途中で閉じたときに
   * 「殿堂入りしたのに記録が無い」状態になる。
   */
  async function enterHallOfFame(): Promise<void> {
    const region = player.region;
    if (region === null) return;
    const entry = recordHallOfFame(region);
    await autosave();
    await new Promise<void>((resolve) => {
      showHall(entry, resolve);
    });
  }

  /** 殿堂の記録を見る。`entry` があればその1件を大きく出す（殿堂入りの直後）。 */
  function showHall(entry: HallOfFameEntry | null, onClose?: () => void): void {
    const all = save.global.hallOfFame;
    const shown = entry === null ? all : [entry];
    const date = (at: number) => new Date(at).toLocaleDateString("ja-JP");
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="panel-head">
        <strong>${entry === null ? "でんどういり の きろく" : "でんどういり!"}</strong>
        <button class="ghost" id="panel-close">とじる</button>
      </div>
      ${
        entry !== null
          ? `<p class="dim">${escape(regionById(entry.region).name)}チャンピオン。
             つれていた ${entry.party.length}ひきを きろくしました。</p>`
          : ""
      }
      ${
        shown.length === 0
          ? `<p class="dim">まだ 1つも ありません。</p>`
          : shown
              .map(
                (e) => `
                <div class="panel-head">
                  <strong>${escape(regionById(e.region).name)} ${e.count}かいめ</strong>
                  <span class="dim">${date(e.at)}</span>
                </div>
                <ul class="mon-list">
                  ${e.party
                    .map(
                      (m) => `<li>
                        ${iconOf(m.species)}
                        <strong>${escape(m.nickname ?? gameData.species(m.species).name)}</strong>
                        <span class="meta">Lv${m.level}${m.shiny ? " ・ ✦" : ""}</span>
                      </li>`,
                    )
                    .join("")}
                </ul>`,
              )
              .join("")
      }`;
    $("#panel-close").onclick = () => {
      closePanel();
      onClose?.();
    };
  }

  function showStorage(): void {
    const inHub = player.region === null;
    const full = player.storage.party.length >= PARTY_SIZE;
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="panel-head">
        <strong>てもち（${player.storage.party.length}/${PARTY_SIZE}）</strong>
        <button class="ghost" id="panel-close">とじる</button>
      </div>
      <ul class="mon-list">
        ${player.storage.party
          .map(
            (p, i) => `<li>
              ${lineOf(p)}
              <span class="row-actions">
                ${i > 0 ? `<button data-up="${p.uid}">▲</button>` : ""}
                <button data-hold="${p.uid}">${
                  p.item === null ? "もたせる" : escape(gameData.item(p.item).name)
                }</button>
                ${player.storage.party.length > 1 ? `<button data-deposit="${p.uid}">あずける</button>` : ""}
                ${
                  !inHub && player.storage.party.length > 1
                    ? `<button data-send="${p.uid}">ほかんこへ</button>`
                    : ""
                }
              </span>
            </li>`,
          )
          .join("")}
      </ul>
      <div class="panel-head">
        <strong>${inHub ? "ほかんこ（きょうつう）" : "ちほうボックス"}（${player.storage.box.length}）</strong>
      </div>
      ${
        inHub
          ? ""
          : `<p class="dim">ちほうの ちょうせんちゅうは、ほかんこから ひきだせません。
             おくるのは いつでも できます。</p>`
      }
      ${
        player.storage.box.length === 0
          ? `<p class="dim">まだ だれも いません。</p>`
          : `<ul class="mon-list">${player.storage.box
              .map(
                (p) => `<li>
                  ${lineOf(p)}
                  <span class="row-actions">
                    <button data-withdraw="${p.uid}">${full ? "いれかえ" : "つれていく"}</button>
                    ${!inHub ? `<button data-send="${p.uid}">ほかんこへ</button>` : ""}
                    <button data-release="${p.uid}" class="danger">にがす</button>
                  </span>
                </li>`,
              )
              .join("")}</ul>`
      }`;

    $("#panel-close").onclick = closePanel;
    bind("data-up", (uid) => {
      const i = player.storage.party.findIndex((p) => p.uid === uid);
      player.storage = reorder(player.storage, i, i - 1);
    });
    bind("data-hold", async (uid) => {
      await chooseHeldItem(uid);
    });
    bind("data-send", async (uid) => {
      // **一方通行。** 送ったら地方チャレンジ中は戻せない（capture.md §4.1）
      const target = findInPanel(uid);
      if (target === null) return;
      const name = target.nickname ?? gameData.species(target.species).name;
      const choice = await ask(`${name} を ほかんこへ おくる?\nこの ちほうでは とりだせません。`, [
        "やめる",
        "おくる",
      ]);
      hideText();
      if (choice !== 1) return;
      sendToStorage([uid]);
      await say(`${name} を ほかんこへ おくった。`);
      hideText();
    });
    bind("data-deposit", (uid) => {
      player.storage = deposit(player.storage, uid);
    });
    bind("data-withdraw", async (uid) => {
      if (player.storage.party.length < PARTY_SIZE) {
        player.storage = withdraw(player.storage, uid);
        return;
      }
      const choice = await ask(
        "だれと いれかえる?",
        [...player.storage.party.map((p) => p.nickname ?? gameData.species(p.species).name), "やめる"],
      );
      hideText();
      if (choice >= player.storage.party.length) return;
      player.storage = withdraw(player.storage, uid, player.storage.party[choice]!.uid);
    });
    bind("data-release", async (uid) => {
      const target = findInPanel(uid);
      if (target === null) return;
      const name = target.nickname ?? gameData.species(target.species).name;
      const choice = await ask(`${name} を にがしますか?`, ["やめる", "にがす"]);
      hideText();
      if (choice !== 1) return;
      player.storage = release(player.storage, uid);
    });
  }

  /**
   * 持ち物を持たせる／外す（v0.9）。
   *
   * バトル側の持ち物効果は v0.5 から動いていたが、**本編で持たせる手段が無かった。**
   * 35種のハンドラが施設の貸しポケモンでしか働いていなかったことになる。
   */
  async function chooseHeldItem(uid: string): Promise<void> {
    const target = findInPanel(uid);
    if (target === null) return;

    const held = allItems.filter((i) => i.category === "held" && (player.bag[i.id] ?? 0) > 0);
    const options = [
      ...(target.item === null ? [] : ["はずす"]),
      ...held.map((i) => `${i.name}（${player.bag[i.id] ?? 0}こ）`),
      "やめる",
    ];
    if (options.length === 1) {
      await say("もたせられる どうぐが ない。");
      hideText();
      return;
    }

    const choice = await ask("なにを もたせる?", options);
    hideText();
    if (choice === options.length - 1) return;

    // 外す。持っていたものはバッグへ戻す（消えると取り返しがつかない）
    if (target.item !== null && choice === 0) {
      player.bag[target.item] = (player.bag[target.item] ?? 0) + 1;
      player.storage = replaceInstance(player.storage, { ...target, item: null });
      await say(`${gameData.item(target.item).name} を はずした。`);
      hideText();
      return;
    }

    const item = held[choice - (target.item === null ? 0 : 1)];
    if (item === undefined) return;
    // 既に持っているものは入れ替え。**元の持ち物を落とさない**
    if (target.item !== null) player.bag[target.item] = (player.bag[target.item] ?? 0) + 1;
    spendItem(item.id);
    player.storage = replaceInstance(player.storage, { ...target, item: item.id });
    await say(`${target.nickname ?? gameData.species(target.species).name} に\n${item.name} を もたせた。`);
    hideText();
  }

  const findInPanel = (uid: string): PokemonInstance | null =>
    [...player.storage.party, ...player.storage.box].find((p) => p.uid === uid) ?? null;

  /** ボタンに操作を結び、終わったら画面を作り直す。 */
  function bindPanel(
    attr: string,
    run: (value: string) => void | Promise<void>,
    redraw: () => void,
  ): void {
    for (const el of panel.querySelectorAll<HTMLElement>(`[${attr}]`)) {
      el.onclick = () => {
        void (async () => {
          try {
            await run(el.getAttribute(attr)!);
          } catch (error) {
            await say(error instanceof Error ? error.message : String(error));
            hideText();
          }
          draw();
          redraw();
          // 預ける・逃がす・道具を使うは取り返しがつかない。**その場で保存する**
          await autosave();
        })();
      };
    }
  }

  const bind = (attr: string, run: (uid: string) => void | Promise<void>) =>
    bindPanel(attr, run, showStorage);

  /** 図鑑。見つけた種は姿と名前、捕まえた種は数値まで（capture.md §6）。 */
  function showDex(): void {
    const seen = allSpecies.filter((s) => (player.dex[s.id] ?? "unknown") !== "unknown");
    const caught = allSpecies.filter((s) => player.dex[s.id] === "caught");
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="panel-head">
        <strong>ずかん</strong>
        <span class="dim">みつけた ${seen.length} ・ つかまえた ${caught.length} / ${allSpecies.length}</span>
        <button class="ghost" id="panel-close">とじる</button>
      </div>
      ${
        seen.length === 0
          ? `<p class="dim">まだ 1ぴきも みつけていません。</p>`
          : `<ul class="dex-list">${seen
              .map((s) => {
                const got = player.dex[s.id] === "caught";
                const types = s.types
                  .map((t) => `<span class="type" style="background:${TYPE_COLOR[t]}">${TYPE_LABEL[t]}</span>`)
                  .join("");
                return `<li class="${got ? "caught" : "seen"}">
                  <span class="no">${String(s.dexNo).padStart(3, "0")}</span>
                  ${iconOf(s.id)}
                  <strong>${escape(s.name)}</strong>
                  ${types}
                  <span class="meta">${got ? `HP${s.baseStats.hp} こう${s.baseStats.atk} すば${s.baseStats.spe}` : "みつけた"}</span>
                </li>`;
              })
              .join("")}</ul>`
      }`;
    $("#panel-close").onclick = closePanel;
  }

  // ── どうぐ（v0.9）──

  /** バッグの中で、今この場面で使える道具だけ。 */
  const usableItems = (where: "battle" | "field") =>
    allItems
      .filter((i) => isUsable(i, where) && (player.bag[i.id] ?? 0) > 0)
      .map((i) => ({ id: i.id, count: player.bag[i.id] ?? 0 }));

  const spendItem = (item: string) => {
    player.bag[item] = Math.max(0, (player.bag[item] ?? 0) - 1);
    if (player.bag[item] === 0) delete player.bag[item];
  };

  /**
   * バッグ。
   *
   * **使えなかったら減らさない。** `core` が理由を返してくるので、
   * 「HP は まんたんだ」と言いながら道具だけ消える、という事故が起きない。
   */
  function showBag(): void {
    const rows = allItems
      .filter((i) => (player.bag[i.id] ?? 0) > 0)
      .map((i) => ({ item: i, count: player.bag[i.id] ?? 0 }));

    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="panel-head">
        <strong>どうぐ</strong>
        <span class="dim">おかね ${player.money}円</span>
        <button class="ghost" id="panel-close">とじる</button>
      </div>
      ${
        rows.length === 0
          ? `<p class="dim">なにも もっていません。</p>`
          : `<ul class="mon-list">${rows
              .map(
                ({ item, count }) => `<li>
                  <strong>${escape(item.name)}</strong>
                  <span class="meta">${count}こ</span>
                  <span class="row-actions">
                    ${isUsable(item, "field") ? `<button data-use="${item.id}">つかう</button>` : ""}
                  </span>
                </li>`,
              )
              .join("")}</ul>`
      }`;

    $("#panel-close").onclick = closePanel;
    bindPanel("data-use", async (id) => {
      const target = await chooseMember(`${gameData.item(id).name} を だれに つかう?`);
      if (target === null) return;
      const result = useOnInstance(gameData, id, target);
      if (refused(result)) {
        await say(result.reason);
        hideText();
        return;
      }
      player.storage = replaceInstance(player.storage, result.instance);
      await say(
        `${gameData.item(id).name} を つかった!` +
          (result.message === "" ? "" : `\n${result.message}`),
      );
      // **続きがある道具**（わざマシン・進化の石・つながりのヒモ・v1.1-b）。
      // 入れ替えと進化はプレイヤーが選ぶものなので、
      // レベルアップのときと**同じ関数**に渡す ―― 選び方が2通りになると、
      // いつか片方だけ「やめる」が効かなくなる。
      // **道具が減るのは起きたときだけ**（「やめる」で消えない）
      const happened =
        result.then === undefined
          ? true
          : result.then.kind === "learnMove"
            ? await offerMove(result.instance.uid, result.then.move)
            : await offerEvolution(result.instance.uid, result.then.to);
      if (happened) spendItem(id);
      hideText();
      await autosave();
    }, showBag);
  }

  /**
   * 誰に使うか選ぶ。倒れている個体も選べる（げんきのかけら）。
   *
   * **問いの文ごと受け取る**（v1.2-d）―― 道具は「つかう」、技教え人は「おしえる」で、
   * 語尾だけ違う2つ目の関数を作ると、選ばせ方が2通りになる。
   */
  async function chooseMember(prompt: string): Promise<PokemonInstance | null> {
    const members = party();
    const choice = await ask(
      prompt,
      [...members.map((p) => p.nickname ?? gameData.species(p.species).name), "やめる"],
    );
    hideText();
    return members[choice] ?? null;
  }

  /**
   * ショップ（v0.9）。
   *
   * **値段は道具が持っていて、店は品揃えしか持たない**（world.md `Shop`）。
   * 売値は買値の半額 ―― 原作と同じで、この比率だけがここにある数字。
   */
  const SELL_RATIO = 0.5;

  async function openShop(id: string): Promise<void> {
    const shop = shopById(id);
    hideText();

    for (;;) {
      const stock = shop.items.map((itemId) => gameData.item(itemId));
      const labels = stock.map((i) => `${i.name}  ${i.price ?? 0}円`);
      const choice = await ask(`なにを かいますか?（しょじきん ${player.money}円）`, [
        ...labels,
        "やめる",
      ]);
      const item = stock[choice];
      if (item === undefined) break;

      const price = item.price ?? 0;
      if (player.money < price) {
        await say("おかねが たりません。");
        continue;
      }
      player.money -= price;
      player.bag[item.id] = (player.bag[item.id] ?? 0) + 1;
      await say(`${item.name} を かった!\nのこり ${player.money}円`);
    }
    hideText();
    draw();
    await autosave();
  }

  $("#open-bag").onclick = () => {
    if (panel.classList.contains("hidden")) showBag();
    else closePanel();
  };

  $("#open-box").onclick = () => {
    if (panel.classList.contains("hidden")) showStorage();
    else closePanel();
  };
  $("#open-dex").onclick = () => {
    if (panel.classList.contains("hidden")) showDex();
    else closePanel();
  };
  $("#open-fly").onclick = () => {
    if (panel.classList.contains("hidden")) showFly();
    else closePanel();
  };

  draw();
  void (async () => {
    // **その地方を初めて始めたとき1回きり。** 続きから遊ぶときには出さないし、
    // 拠点でも出さない（v0.9 では「マップ画面を開くたび」出ていた）。
    // 文面は地方ごとに違うので regions.json が持つ
    await arrive();
    if (player.region === null || player.started) return;
    player.started = true;
    const intro = regionById(player.region).intro;
    if (intro !== undefined) {
      await say(intro);
      hideText();
    }
    await autosave();
  })();

  return {
    stop: () => {
      stopped = true;
      heldDirection = null;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
