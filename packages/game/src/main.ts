/**
 * v0.3 バトル画面。
 *
 * プレイヤー(side 0) vs ランダムAI(side 1)。
 * core が返すイベント列を順に演出し、演出速度は完全にこの層の関心事。
 * 設計: docs/design/ui-flow.md
 */

import {
  chooseRandomAction,
  createBattle,
  createRng,
  legalActions,
  requiredSides,
  step,
  type Action,
  type BattleState,
  type BattlePokemonSource,
  type SideIndex,
} from "@pkmn/core";
import { allSpecies, gameData } from "@pkmn/data";
import { baseDelayOf, extraMessagesOf, messageOf } from "./messages.js";
import {
  applyEvent,
  STATUS_LABEL,
  STAT_LABEL,
  TYPE_COLOR,
  TYPE_LABEL,
  viewFromState,
  type BattleView,
} from "./view.js";

const LEVEL = 50;
const TEAM_SIZE = 3;

type Speed = "normal" | "fast" | "logOnly";
const SPEED_FACTOR: Record<Speed, number> = { normal: 1, fast: 0.3, logOnly: 0 };

let speed: Speed = "normal";
let state: BattleState;
let view: BattleView;
let resolvePlayerAction: ((action: Action) => void) | null = null;

const $ = <T extends HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel) ?? (() => { throw new Error(`missing element: ${sel}`); })();

const sleep = (ms: number) =>
  ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────
// チーム生成
// ─────────────────────────────────────────────

function teamFrom(seed: number, offset: number): BattlePokemonSource[] {
  const rng = createRng({ s: (seed + offset * 7919) >>> 0 || 1, calls: 0 });
  const pool = [...allSpecies];
  const team: BattlePokemonSource[] = [];
  for (let i = 0; i < TEAM_SIZE; i++) {
    const species = pool.splice(rng.int(pool.length), 1)[0]!;
    const moves = species.learnset
      .filter((l) => l.level <= LEVEL)
      .map((l) => l.move)
      .slice(-4);
    team.push({ species: species.id, level: LEVEL, moves });
  }
  return team;
}

// ─────────────────────────────────────────────
// 描画
// ─────────────────────────────────────────────

function hpClass(ratio: number): string {
  return ratio > 0.5 ? "high" : ratio > 0.2 ? "mid" : "low";
}

function renderSide(side: SideIndex): string {
  const v = view[side];
  const ratio = v.maxHp === 0 ? 0 : v.hp / v.maxHp;
  const stages = Object.entries(v.stages)
    .filter(([, n]) => n !== 0)
    .map(([stat, n]) => {
      const arrows = (n > 0 ? "↑" : "↓").repeat(Math.min(3, Math.abs(n)));
      return `<span class="stage ${n > 0 ? "up" : "down"}">${STAT_LABEL[stat] ?? stat}${arrows}</span>`;
    })
    .join("");

  const types = v.types
    .map((t) => `<span class="type" style="background:${TYPE_COLOR[t]}">${TYPE_LABEL[t]}</span>`)
    .join("");

  const balls = Array.from({ length: TEAM_SIZE }, (_, i) =>
    `<i class="ball ${i < v.remaining ? "alive" : ""}"></i>`).join("");

  return `
    <div class="mon ${side === 0 ? "ally" : "foe"}">
      <div class="figure" style="--c:${TYPE_COLOR[v.types[0]!]}">
        <div class="blob"></div>
      </div>
      <div class="panel">
        <div class="row">
          <strong>${v.name}</strong>
          <span class="lv">Lv${v.level}</span>
          ${v.status ? `<span class="status ${v.status}">${STATUS_LABEL[v.status]}</span>` : ""}
        </div>
        <div class="types">${types}</div>
        <div class="hpbar"><div class="fill ${hpClass(ratio)}" style="width:${ratio * 100}%"></div></div>
        <div class="row small">
          <span>${v.hp} / ${v.maxHp}</span>
          <span class="balls">${balls}</span>
        </div>
        <div class="stages">${stages}</div>
      </div>
    </div>`;
}

function renderField(): void {
  $("#field").innerHTML = renderSide(1) + renderSide(0);
}

function log(text: string): void {
  const el = $("#log");
  const line = document.createElement("div");
  line.className = "line";
  line.textContent = text;
  el.appendChild(line);
  while (el.childElementCount > 200) el.firstElementChild?.remove();
  el.scrollTop = el.scrollHeight;
}

// ─────────────────────────────────────────────
// 入力
// ─────────────────────────────────────────────

function setPrompt(text: string): void {
  $("#prompt").textContent = text;
}

function clearControls(): void {
  $("#controls").innerHTML = "";
}

function showActions(): void {
  const actions = legalActions(state, 0);
  const active = state.sides[0].party[state.sides[0].activeIndex]!;
  const box = $("#controls");
  box.innerHTML = "";

  const moveWrap = document.createElement("div");
  moveWrap.className = "moves";
  for (const action of actions) {
    if (action.kind !== "move") continue;
    const slot = active.moves[action.moveIndex]!;
    const move = gameData.move(slot.id);
    const btn = document.createElement("button");
    btn.className = "move";
    btn.style.setProperty("--c", TYPE_COLOR[move.type]);
    btn.innerHTML = `
      <span class="mname">${move.name}</span>
      <span class="meta">${TYPE_LABEL[move.type]} ・ ${move.power ?? "—"} ・ ${slot.pp}/${slot.maxPp}</span>`;
    btn.onclick = () => submit(action);
    moveWrap.appendChild(btn);
  }
  box.appendChild(moveWrap);

  const switches = actions.filter((a) => a.kind === "switch");
  if (switches.length > 0) {
    const swWrap = document.createElement("div");
    swWrap.className = "switches";
    for (const action of switches) {
      if (action.kind !== "switch") continue;
      const mon = state.sides[0].party[action.partyIndex]!;
      const btn = document.createElement("button");
      btn.className = "switch";
      btn.innerHTML = `こうたい → <strong>${mon.name}</strong> <span class="meta">${mon.currentHp}/${mon.maxHp}</span>`;
      btn.onclick = () => submit(action);
      swWrap.appendChild(btn);
    }
    box.appendChild(swWrap);
  }
}

function showForcedSwitch(): void {
  const box = $("#controls");
  box.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "switches forced";
  for (const action of legalActions(state, 0)) {
    if (action.kind !== "switch") continue;
    const mon = state.sides[0].party[action.partyIndex]!;
    const btn = document.createElement("button");
    btn.className = "switch";
    btn.innerHTML = `<strong>${mon.name}</strong> <span class="meta">${mon.currentHp}/${mon.maxHp}</span>`;
    btn.onclick = () => submit(action);
    wrap.appendChild(btn);
  }
  box.appendChild(wrap);
}

function submit(action: Action): void {
  const resolve = resolvePlayerAction;
  resolvePlayerAction = null;
  clearControls();
  setPrompt("");
  resolve?.(action);
}

const waitForPlayerAction = (): Promise<Action> =>
  new Promise((resolve) => {
    resolvePlayerAction = resolve;
  });

// ─────────────────────────────────────────────
// 演出
// ─────────────────────────────────────────────

async function playEvents(events: readonly import("@pkmn/core").BattleEvent[], next: BattleState) {
  for (const event of events) {
    applyEvent(view, next, event);
    renderField();

    const message = messageOf(event, view);
    if (message !== null) log(message);
    for (const extra of extraMessagesOf(event)) log(extra);

    await sleep(baseDelayOf(event) * SPEED_FACTOR[speed]);
  }
}

// ─────────────────────────────────────────────
// ループ
// ─────────────────────────────────────────────

async function run(seed: number): Promise<void> {
  state = createBattle(gameData, [teamFrom(seed, 1), teamFrom(seed, 2)], seed);
  view = viewFromState(state);
  $("#log").innerHTML = "";
  renderField();
  log(`しょうぶ かいし! (seed ${seed})`);

  while (state.result === null) {
    const sides = requiredSides(state);
    const actions: [Action | null, Action | null] = [null, null];

    if (sides.includes(0)) {
      setPrompt(
        state.pendingSwitch.includes(0)
          ? "つぎの ポケモンを えらんでください"
          : "どうする?",
      );
      if (state.pendingSwitch.includes(0)) showForcedSwitch();
      else showActions();
      actions[0] = await waitForPlayerAction();
    }

    const rng = createRng(state.rng);
    if (sides.includes(1)) actions[1] = chooseRandomAction(state, 1, rng);
    state = { ...state, rng: rng.state() };

    const result = step(gameData, state, actions);
    await playEvents(result.events, result.state);
    state = result.state;
    view = viewFromState(state);
    renderField();
  }

  setPrompt("");
  const btn = document.createElement("button");
  btn.className = "again";
  btn.textContent = "もう いちど";
  btn.onclick = () => void run(Math.floor(Math.random() * 1_000_000));
  $("#controls").innerHTML = "";
  $("#controls").appendChild(btn);
}

// ─────────────────────────────────────────────
// 起動
// ─────────────────────────────────────────────

$("#app").innerHTML = `
  <header>
    <h1>ポケモン風RPG <span class="ver">v0.3</span></h1>
    <div class="tools">
      <label>seed <input id="seed" type="number" value="1" /></label>
      <button id="restart">はじめから</button>
      <div class="speed" id="speed">
        <button data-s="normal" class="on">つうじょう</button>
        <button data-s="fast">こうそく</button>
        <button data-s="logOnly">ログのみ</button>
      </div>
    </div>
  </header>
  <main>
    <section id="field"></section>
    <section id="log"></section>
    <p id="prompt"></p>
    <section id="controls"></section>
  </main>
  <footer>
    同じ seed なら まったく おなじ しょうぶに なります（設計: シード固定の疑似乱数）
  </footer>`;

$("#speed").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const value = target.dataset["s"] as Speed | undefined;
  if (value === undefined) return;
  speed = value;
  for (const b of $("#speed").querySelectorAll("button")) b.classList.toggle("on", b === target);
});

$("#restart").addEventListener("click", () => {
  const seed = Number(($("#seed") as HTMLInputElement).value) || 1;
  void run(seed);
});

void run(1);
