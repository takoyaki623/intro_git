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
  applyBattleResult,
  chooseOption,
  createInstance,
  emptyEncounterState,
  emptyWorldState,
  evolutionFor,
  evolve,
  healParty,
  instanceToSpec,
  interact,
  levelOf,
  maxHpOf,
  replaceMove,
  startEvent,
  stepEvent,
  stepPlayer,
  createRng,
  visibleObjects,
  writeBack,
  type Direction,
  type EncounterState,
  type EventEffect,
  type EventId,
  type DexState,
  type MapData,
  type MapObject,
  type PokemonInstance,
  type PostBattleEvent,
  type PlayerPosition,
  type Rng,
  type TerrainId,
  type WorldState,
} from "@pkmn/core";
import {
  allEncounterTables,
  allNatures,
  eventById,
  gameData,
  mapById,
  trainerById,
} from "@pkmn/data";
import { $, runBattle, type BattleOutcome } from "./battle-screen.js";
import { escape } from "./team-select.js";

const TILE = 28;
/** 表示するマス数。マップが小さいときは切り詰める。 */
const VIEW = { w: 15, h: 11 };
const WALK_MS = 130;

const START = { map: "kanto-players-house-1f", x: 3, y: 5, facing: "down" as Direction };

// ─────────────────────────────────────────────
// 見た目（アセット無しのフォールバック）
// ─────────────────────────────────────────────

/**
 * 凡例の文字ごとの色。**見た目のヒントにしか使わない。**
 *
 * 通行可否と地形は `collision` / `terrain` が持っていて、ここは一切関与しない。
 * 逆に、規則からだけ色を決めると「木の茂み」と「家の壁」が同じ緑になり、
 * 町が森に見えてしまう ―― 見た目とルールを分けたのは、
 * 片方をもう片方から**導出しない**ためなので、見た目の情報はここに持たせる。
 */
const TILE_HINT: Record<string, string> = {
  T: "#2f4a2c", // 木
  H: "#a8624a", // 家の壁
  W: "#8e8578", // 屋内の壁
  B: "#7a6ba8", // ベッド
  C: "#5d6a7a", // パソコン
  M: "#5a6f7d", // 機械
  D: "#7a5230", // ドア
};

/** 地形と通行可否から決める色。凡例の文字に色が無ければこちら。 */
function colorOf(terrain: TerrainId, blocked: boolean, hint: string | undefined): string {
  if (terrain === "water") return "#2f6fb5";
  if (terrain === "grass") return "#4f9b46";
  if (terrain === "ledge") return "#8a6a3d";
  if (terrain === "sand") return "#d8c48a";
  if (terrain === "cave") return blocked ? "#4a4642" : "#7b736b";
  const named = hint === undefined ? undefined : TILE_HINT[hint];
  if (named !== undefined) return named;
  return blocked ? "#3d5a3a" : "#cbbf9c";
}

const OBJECT_COLOR: Record<string, string> = {
  npc: "#d95f5f",
  trainer: "#b23c8c",
  item: "#e0b33a",
  sign: "#8b6d4a",
  obstacle: "#6b5a3a",
};

// ─────────────────────────────────────────────
// 画面
// ─────────────────────────────────────────────

export type FieldHandle = { stop: () => void };

export function playField(): FieldHandle {
  const world: WorldState = emptyWorldState();
  let position: PlayerPosition = { ...START };
  let encounter: EncounterState = emptyEncounterState();
  /**
   * 手持ち。**v0.8 から実個体**になり、HP・PP・状態異常が歩いても残る。
   * これが入るまで、野生戦には消耗が無かった。
   */
  let party: PokemonInstance[] = [];
  /** 図鑑。v0.9 でセーブに繋ぐ。 */
  let dex: Record<string, DexState> = {};
  let stopped = false;
  let busy = false;
  /** 歩行アニメの進み具合（0→1）。描画にしか使わない。 */
  let walk: { from: PlayerPosition; to: PlayerPosition; start: number } | null = null;

  const rng: Rng = createRng({ s: (Date.now() & 0x7fffffff) || 1, calls: 0 });

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
      <div class="field-pad">
        <button data-d="up">↑</button>
        <div class="pad-row">
          <button data-d="left">←</button>
          <button data-d="ok">けってい</button>
          <button data-d="right">→</button>
        </div>
        <button data-d="down">↓</button>
      </div>
      <p class="dim field-help">
        ボタンで いどう、「けってい」で しらべる<br />
        キーボードなら やじるしキー / WASD と Z
      </p>
    </div>`;

  const canvas = $<HTMLCanvasElement>("#field-canvas");
  const ctx = canvas.getContext("2d")!;

  const currentMap = (): MapData => mapById(position.map);

  // ── 描画 ──
  function draw(): void {
    const map = currentMap();
    const cols = Math.min(VIEW.w, map.size.width);
    const rows = Math.min(VIEW.h, map.size.height);
    canvas.width = cols * TILE;
    canvas.height = rows * TILE;

    // 追従カメラ。マップの端では止める
    const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
    const camX = clamp(position.x - (cols >> 1), map.size.width - cols);
    const camY = clamp(position.y - (rows >> 1), map.size.height - rows);

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const mx = camX + x;
        const my = camY + y;
        const i = my * map.size.width + mx;
        const terrain = map.terrain[i] ?? "normal";
        ctx.fillStyle = colorOf(terrain, map.collision[i] === true, map.layers.ground[i]);
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

        if (terrain === "grass") {
          ctx.fillStyle = "#3d7c36";
          for (const [gx, gy] of [[6, 18], [13, 12], [20, 19]] as const) {
            ctx.fillRect(x * TILE + gx, y * TILE + gy, 3, 7);
          }
        }
        if (terrain === "ledge") {
          ctx.fillStyle = "#5f4726";
          ctx.fillRect(x * TILE, y * TILE + TILE - 7, TILE, 7);
        }
        if (map.collision[i] === true) {
          // 通れないことは、色ではなく形（枠）で示す。色を当てにしない
          ctx.strokeStyle = "rgba(0,0,0,.28)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
        }
      }
    }

    // warp は床の模様として見せる（ドアが見えないと往復できない）
    for (const warp of map.warps) {
      const x = warp.at.x - camX;
      const y = warp.at.y - camY;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      ctx.fillStyle = warp.trigger === "step" ? "#efe6c8" : "#6b4a2a";
      ctx.fillRect(x * TILE + 5, y * TILE + 5, TILE - 10, TILE - 10);
    }

    for (const object of visibleObjects(map, world)) {
      const x = object.at.x - camX;
      const y = object.at.y - camY;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      ctx.fillStyle = OBJECT_COLOR[object.kind.type] ?? "#888";
      if (object.kind.type === "item") {
        ctx.beginPath();
        ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(x * TILE + 5, y * TILE + 3, TILE - 10, TILE - 6);
      }
    }

    // ── プレイヤー ──
    let px = position.x;
    let py = position.y;
    if (walk !== null) {
      const t = Math.min(1, (performance.now() - walk.start) / WALK_MS);
      px = walk.from.x + (walk.to.x - walk.from.x) * t;
      py = walk.from.y + (walk.to.y - walk.from.y) * t;
    }
    const sx = (px - camX) * TILE;
    const sy = (py - camY) * TILE;
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(sx + 6, sy + 4, TILE - 12, TILE - 8);
    ctx.fillStyle = "#222";
    const eye = { up: [0, -1], down: [0, 4], left: [-4, 1], right: [4, 1] }[position.facing]!;
    ctx.fillRect(sx + TILE / 2 - 3 + eye[0]!, sy + TILE / 2 - 2 + eye[1]!, 6, 3);

    // 自動テストから現在地を読むための印（画面には出ない）
    canvas.dataset["at"] = `${position.map} ${position.x},${position.y} ${position.facing}`;
    $("#field-place").textContent = map.name;
    $("#field-party").textContent =
      party.length === 0
        ? "てもち なし"
        : "てもち: " + party
            .map((p) => {
              const name = p.nickname ?? gameData.species(p.species).name;
              return `${name} Lv${levelOf(gameData, p)} ${p.currentHp}/${maxHpOf(gameData, p)}`;
            })
            .join(" ・ ");
  }

  function animateWalk(from: PlayerPosition, to: PlayerPosition): Promise<void> {
    walk = { from, to, start: performance.now() };
    return new Promise((resolve) => {
      const tick = () => {
        draw();
        if (walk === null || performance.now() - walk.start >= WALK_MS) {
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

  // ── メッセージ・選択肢 ──
  const textBox = $("#field-text");

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
        position = {
          map: effect.to,
          x: effect.x,
          y: effect.y,
          facing: effect.facing ?? position.facing,
        };
        encounter = emptyEncounterState();
        draw();
        return;
      case "gotItem": {
        const item = gameData.item(effect.item);
        await say(`${item.name} を ${effect.count}こ てにいれた!`);
        return;
      }
      case "gotPokemon": {
        const species = gameData.species(effect.species);
        party.push(
          createInstance(
            gameData,
            {
              species: effect.species,
              level: effect.level,
              region: currentMap().region,
              ...(effect.moves.length > 0 ? { moves: [...effect.moves] } : {}),
            },
            rng,
            allNatures.map((n) => n.id),
          ),
        );
        dex[effect.species] = "caught";
        draw();
        await say(`${species.name} を てもちに くわえた!`);
        return;
      }
      case "healed":
        party = healParty(gameData, party);
        draw();
        await say("ポケモンたちは げんきに なった!");
        return;
      case "moneyChanged":
        await say(effect.delta >= 0 ? `${effect.delta}円 てにいれた!` : `${-effect.delta}円 はらった。`);
        return;
      case "battle":
        await trainerBattle(effect.trainer, effect.onWin, effect.onLose);
        return;
      case "shop":
      case "openBox":
      case "openDex":
        await say("まだ つかえない。");
        return;
      case "wait":
      case "playSe":
      case "faceObject":
      case "choice":
        return;
    }
  }

  /**
   * イベントを最後まで進める。
   * core は中断点を返してくるだけなので、待つのはこちら側の仕事。
   */
  async function runEvent(id: EventId): Promise<void> {
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
    hideText();
    draw();
  }

  // ── バトル ──

  /** 戦える個体だけを、倒れていない順に並べて出す。 */
  const playable = () =>
    [...party]
      .sort((a, b) => Number(a.currentHp <= 0) - Number(b.currentHp <= 0))
      .map((p) => instanceToSpec(gameData, p));

  const alive = () => party.filter((p) => p.currentHp > 0);

  function enterBattle(): void {
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
    party = party.map((p) => {
      const index = brought.findIndex((b) => b.uid === p.uid);
      const after = index < 0 ? undefined : mine[index];
      return after === undefined ? p : writeBack(gameData, p, after);
    });

    // ── 2. 戦闘後シーケンス ──
    const result = applyBattleResult(gameData, {
      party,
      participants: party.filter((p) => p.currentHp > 0).map((p) => p.uid),
      defeated: outcome.winner === 0 ? foes.filter((f) => f.currentHp <= 0) : [],
      encountered: foes.map((f) => f.species),
      isWild,
      dex,
    });
    party = result.party;
    dex = result.dex;
    draw();

    await showPostBattle(result.events);
  }

  /** 戦闘後の出来事を1つずつ見せる。技の入れ替えと進化はここで選ばせる。 */
  async function showPostBattle(events: readonly PostBattleEvent[]): Promise<void> {
    const nameOf = (uid: string) => {
      const p = party.find((x) => x.uid === uid);
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

  /** 技が4つ埋まっているときの入れ替え。**選ぶのはプレイヤー。** */
  async function offerMove(uid: string, move: string): Promise<void> {
    const target = party.find((p) => p.uid === uid);
    if (target === undefined) return;
    const name = target.nickname ?? gameData.species(target.species).name;
    const learn = gameData.move(move).name;

    await say(`${name} は ${learn} を おぼえたい!\nしかし わざは 4つまで。`);
    const options = [...target.moves.map((m) => gameData.move(m.id).name), "おぼえない"];
    const choice = await ask(`どの わざを わすれさせる?`, options);
    if (choice >= target.moves.length) {
      await say(`${name} は ${learn} を おぼえなかった。`);
      return;
    }
    const forgotten = gameData.move(target.moves[choice]!.id).name;
    party = party.map((p) => (p.uid === uid ? replaceMove(gameData, p, choice, move) : p));
    await say(`${name} は ${forgotten} を わすれて\n${learn} を おぼえた!`);
  }

  /** 進化。**中断できる**（原作どおり）。 */
  async function offerEvolution(uid: string, to: string): Promise<void> {
    const target = party.find((p) => p.uid === uid);
    if (target === undefined) return;
    const before = target.nickname ?? gameData.species(target.species).name;
    const after = gameData.species(to).name;

    const choice = await ask(`おや? ${before} の ようすが...!`, ["しんかさせる", "やめる"]);
    if (choice !== 0) {
      await say(`${before} の しんかが とまった!`);
      return;
    }
    party = party.map((p) => (p.uid === uid ? evolve(gameData, p, to) : p));
    dex[to] = "caught";
    draw();
    await say(`おめでとう! ${before} は\n${after} に しんかした!`);
  }

  /** 全滅。手持ちを回復して家に戻す（本編の敗北処理は v0.9）。 */
  async function blackOut(): Promise<void> {
    party = healParty(gameData, party);
    position = { ...START };
    encounter = emptyEncounterState();
    draw();
    await say("いそいで じぶんの いえに もどった。\nポケモンたちは げんきに なった!");
    hideText();
    draw();
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
    enterBattle();
    const outcome = await runBattle({
      parties: [playable(), [instanceToSpec(gameData, wildInstance(species, level))]],
      seed: rng.int(1_000_000),
      ai: { policy: "basic", mistakeRate: 0.35, knowledge: "fair" },
      headline: `あっ! やせいの ${name} が とびだしてきた!`,
      isWild: true,
    });
    leaveBattle();

    await afterBattle(outcome, true);
    if (outcome.winner === 1) await blackOut();
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
    });
    leaveBattle();

    await afterBattle(outcome, false);
    const next = outcome.winner === 0 ? onWin : onLose;
    if (next !== undefined) await runEvent(next);
    if (outcome.winner === 1) await blackOut();
  }

  // ── 入力 ──

  async function tryStep(direction: Direction): Promise<void> {
    const map = currentMap();
    const before = position;
    const result = stepPlayer(map, world, position, encounter, direction, rng, allEncounterTables);
    position = result.position;
    encounter = result.encounter;

    if (result.outcome.kind === "moved" || result.outcome.kind === "jumped") {
      await animateWalk(before, position);
      return;
    }
    draw();

    switch (result.outcome.kind) {
      case "warp":
        await doWarp(result.outcome.warp);
        return;
      case "encounter":
        await animateWalk(before, position);
        await wildBattle(result.outcome.species, result.outcome.level);
        return;
      case "event":
        await animateWalk(before, position);
        await runEvent(result.outcome.event);
        return;
      default:
        return;
    }
  }

  async function doWarp(warp: { to: { map: string; x: number; y: number; facing: Direction } }) {
    position = { map: warp.to.map, x: warp.to.x, y: warp.to.y, facing: warp.to.facing };
    encounter = emptyEncounterState();
    draw();
    await new Promise((r) => setTimeout(r, 80));
  }

  async function tryInteract(): Promise<void> {
    const found = interact(currentMap(), world, position);
    if (found === null) return;
    if (found.kind === "warp") await doWarp(found.warp);
    else await runEvent(found.event);
  }

  const KEYS: Record<string, Direction> = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };

  async function handle(action: Direction | "ok"): Promise<void> {
    if (busy || stopped) return;
    busy = true;
    try {
      if (action === "ok") await tryInteract();
      else await tryStep(action);
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
      void handle(direction);
      return;
    }
    if (["z", "Z", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      void handle("ok");
    }
  };
  window.addEventListener("keydown", onKeyDown);

  $("#run").querySelector(".field-pad")!.addEventListener("click", (e) => {
    const value = (e.target as HTMLElement).dataset["d"];
    if (value === undefined) return;
    void handle(value as Direction | "ok");
  });

  draw();
  void (async () => {
    // 家の中から始める。母との会話が最初の案内になる
    await say("いえの そとに でて、オーキドはかせを たずねよう。");
    hideText();
  })();

  return {
    stop: () => {
      stopped = true;
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
