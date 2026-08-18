/**
 * バトル画面。1戦を最後まで進めて、勝った側を返す。
 *
 * フリーバトルもバトルタワーもこの1つを使う。
 * 「誰と戦うか」「勝ったらどうなるか」は呼び出し側の関心で、ここは1戦だけを見る。
 * 設計: docs/design/ui-flow.md §4
 */

import {
  activeOf,
  chooseBasicAction,
  chooseRandomAction,
  createBattle,
  createKnowledge,
  createRng,
  legalActions,
  observe,
  requiredSides,
  step,
  toAiView,
  type Action,
  type AiConfig,
  type BattleEvent,
  type BattlePokemonSource,
  type BattleState,
  type SideIndex,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";
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

export type Speed = "normal" | "fast" | "logOnly";
const SPEED_FACTOR: Record<Speed, number> = { normal: 1, fast: 0.3, logOnly: 0 };

let speed: Speed = "normal";
export const setSpeed = (value: Speed): void => {
  speed = value;
};
export const getSpeed = (): Speed => speed;

export const $ = <T extends HTMLElement>(sel: string): T =>
  document.querySelector<T>(sel) ?? (() => { throw new Error(`missing element: ${sel}`); })();

const sleep = (ms: number) =>
  ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

export type BattleOptions = {
  parties: [readonly BattlePokemonSource[], readonly BattlePokemonSource[]];
  seed: number;
  /** 相手の思考。"random" は v0.1 以来のフリーバトル用。 */
  ai: AiConfig | "random";
  /** ログの先頭に出す行。複数行なら1行ずつ出す。 */
  headline: string | readonly string[];
  /** 野生戦。逃げるが選べるようになる（v0.7）。 */
  isWild?: boolean;
  /**
   * 投げられるボール（v0.8）。`core` はバッグの在庫を知らないので、
   * 何を何個持っているかは呼び出し側が渡す。
   *
   * **配列ではなく関数で受け取る。** 配列だと投げたあとも最初の在庫を表示し、
   * 0個になったボールのボタンが残る（v0.9 で気づいた）。
   */
  balls?: () => { id: string; count: number }[];
  /** ボールを1つ消費した。バッグを減らすのは呼び出し側。 */
  onBallUsed?: (item: string) => void;
  /**
   * バッグから使える道具（v0.9）。ボールと同じく在庫は呼び出し側が持つ。
   * ボールと分けてあるのは、**投げる相手が違う**から ――
   * ボールは相手に、回復薬は自分の手持ちに向かう。
   */
  items?: () => { id: string; count: number }[];
  /** 道具を1つ消費した。 */
  onItemUsed?: (item: string) => void;
};

/**
 * 勝敗と、どう終わったか。逃走で終わった場合は winner が null になる。
 * `state` を返すのは、**戦った個体に結果を書き戻すため**（v0.8）。
 */
export type BattleOutcome = NonNullable<BattleState["result"]> & { state: BattleState };

export async function runBattle(options: BattleOptions): Promise<BattleOutcome> {
  let state: BattleState = createBattle(gameData, options.parties, options.seed, {
    isWild: options.isWild ?? false,
  });
  let view: BattleView = viewFromState(state);
  const knowledge = createKnowledge();
  let resolvePlayerAction: ((action: Action) => void) | null = null;

  // ── 表示 ──
  const hpClass = (ratio: number) => (ratio > 0.5 ? "high" : ratio > 0.2 ? "mid" : "low");

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

    const balls = Array.from({ length: state.sides[side].party.length }, (_, i) =>
      `<i class="ball ${i < v.remaining ? "alive" : ""}"></i>`).join("");

    // 特性と持ち物。相手のぶんは発動して初めて出る
    const gear = [
      v.ability === null ? "" : `<span class="gear ability">${gameData.ability(v.ability).name}</span>`,
      v.item === null ? "" : `<span class="gear item">${gameData.item(v.item).name}</span>`,
    ].join("");

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
          <div class="gears">${gear}</div>
          <div class="stages">${stages}</div>
        </div>
      </div>`;
  }

  const renderField = () => {
    $("#field").innerHTML = renderSide(1) + renderSide(0);
  };

  function log(text: string): void {
    const el = $("#log");
    const line = document.createElement("div");
    line.className = "line";
    line.textContent = text;
    el.appendChild(line);
    while (el.childElementCount > 200) el.firstElementChild?.remove();
    el.scrollTop = el.scrollHeight;
  }

  // ── 入力 ──
  const submit = (action: Action) => {
    const resolve = resolvePlayerAction;
    resolvePlayerAction = null;
    $("#controls").innerHTML = "";
    $("#prompt").textContent = "";
    resolve?.(action);
  };

  function showActions(forced: boolean): void {
    const actions = legalActions(gameData, state, 0);
    const active = activeOf(state, 0);
    const box = $("#controls");
    box.innerHTML = "";

    if (!forced) {
      const moveWrap = document.createElement("div");
      moveWrap.className = "moves";
      for (const action of actions) {
        if (action.kind !== "move") continue;
        const slot = active.moves[action.moveIndex];
        if (slot === undefined) {
          // 技を1つも持たない個体（アブラ・メタモン）。わるあがきしかできない
          const btn = document.createElement("button");
          btn.className = "move";
          btn.innerHTML = `<span class="mname">わるあがき</span>
            <span class="meta">つかえる わざが ない</span>`;
          btn.onclick = () => submit(action);
          moveWrap.appendChild(btn);
          continue;
        }
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
    }

    // ── ボール（v0.8）──
    // 「投げる」も1ターンを使う。削るか捕るかがここで選択になる
    const balls = (options.balls?.() ?? []).filter((b) => b.count > 0);
    if (!forced && (options.isWild ?? false) && balls.length > 0) {
      const wrap = document.createElement("div");
      wrap.className = "balls";
      for (const ball of balls) {
        const btn = document.createElement("button");
        btn.className = "ball";
        btn.innerHTML = `<span class="mname">${gameData.item(ball.id).name}</span>
          <span class="meta">のこり ${ball.count}こ</span>`;
        btn.onclick = () => {
          options.onBallUsed?.(ball.id);
          submit({ kind: "item", item: ball.id });
        };
        wrap.appendChild(btn);
      }
      box.appendChild(wrap);
    }

    // ── どうぐ（v0.9）──
    // 使うとその1ターンは戦えない。**回復するかどうかが判断になる**のはそのため
    const usable = (options.items?.() ?? []).filter((i) => i.count > 0);
    if (!forced && usable.length > 0) {
      const wrap = document.createElement("div");
      wrap.className = "items";
      for (const item of usable) {
        const btn = document.createElement("button");
        btn.className = "item";
        btn.innerHTML = `<span class="mname">${gameData.item(item.id).name}</span>
          <span class="meta">のこり ${item.count}こ</span>`;
        btn.onclick = () => chooseItemTarget(item.id);
        wrap.appendChild(btn);
      }
      box.appendChild(wrap);
    }

    if (actions.some((a) => a.kind === "run")) {
      const btn = document.createElement("button");
      btn.className = "run";
      btn.textContent = "にげる";
      btn.onclick = () => submit({ kind: "run" });
      box.appendChild(btn);
    }

    const switches = actions.filter((a) => a.kind === "switch");
    if (switches.length > 0) {
      const wrap = document.createElement("div");
      wrap.className = `switches${forced ? " forced" : ""}`;
      for (const action of switches) {
        if (action.kind !== "switch") continue;
        const mon = state.sides[0].party[action.partyIndex]!;
        const btn = document.createElement("button");
        btn.className = "switch";
        btn.innerHTML = `${forced ? "" : "こうたい → "}<strong>${mon.name}</strong> <span class="meta">${mon.currentHp}/${mon.maxHp}</span>`;
        btn.onclick = () => submit(action);
        wrap.appendChild(btn);
      }
      box.appendChild(wrap);
    }
  }

  /**
   * 道具を誰に使うか選ぶ。
   *
   * **倒れている手持ちにも使える**（げんきのかけら）ので、
   * 交代の選択肢とは別に、手持ち全員を出す。
   */
  function chooseItemTarget(item: string): void {
    const box = $("#controls");
    box.innerHTML = "";
    $("#prompt").textContent = `${gameData.item(item).name} を だれに つかう?`;

    const wrap = document.createElement("div");
    wrap.className = "switches";
    for (const [index, mon] of state.sides[0].party.entries()) {
      const btn = document.createElement("button");
      btn.className = "switch";
      btn.innerHTML = `<strong>${mon.name}</strong> <span class="meta">${mon.currentHp}/${mon.maxHp}</span>`;
      btn.onclick = () => {
        options.onItemUsed?.(item);
        submit({ kind: "item", item, target: index });
      };
      wrap.appendChild(btn);
    }
    box.appendChild(wrap);

    const back = document.createElement("button");
    back.className = "run";
    back.textContent = "やめる";
    back.onclick = () => {
      $("#prompt").textContent = "";
      showActions(false);
    };
    box.appendChild(back);
  }

  const waitForPlayerAction = (): Promise<Action> =>
    new Promise((resolve) => {
      resolvePlayerAction = resolve;
    });

  async function playEvents(events: readonly BattleEvent[], next: BattleState) {
    for (const event of events) {
      applyEvent(view, next, event);
      renderField();

      const message = messageOf(event, view);
      if (message !== null) log(message);
      for (const extra of extraMessagesOf(event)) log(extra);

      // 揺れはイベント1つの中の演出。core が返した回数をそのまま出す
      if (event.kind === "ballThrown") {
        for (let i = 0; i < event.shakes; i += 1) {
          await sleep(420 * SPEED_FACTOR[speed]);
          log("…");
        }
        await sleep(300 * SPEED_FACTOR[speed]);
        log(
          event.caught
            ? `やった! ${view[1].name} を つかまえた!`
            : `ああっ! ポケモンが とびだしてきた!`,
        );
      }

      await sleep(baseDelayOf(event) * SPEED_FACTOR[speed]);
    }
  }

  // ── ループ ──
  $("#log").innerHTML = "";
  $("#battle").classList.remove("hidden");
  renderField();
  for (const line of typeof options.headline === "string" ? [options.headline] : options.headline) {
    log(line);
  }

  while (state.result === null) {
    const sides = requiredSides(state);
    const actions: [Action | null, Action | null] = [null, null];

    if (sides.includes(0)) {
      const forced = state.pendingSwitch.includes(0);
      $("#prompt").textContent = forced ? "つぎの ポケモンを えらんでください" : "どうする?";
      showActions(forced);
      actions[0] = await waitForPlayerAction();
    }

    const rng = createRng(state.rng);
    if (sides.includes(1)) {
      actions[1] =
        options.ai === "random"
          ? chooseRandomAction(gameData, state, 1, rng)
          : chooseBasicAction(
              gameData,
              toAiView(gameData, state, 1, options.ai, knowledge),
              options.ai,
              rng,
            );
    }
    state = { ...state, rng: rng.state() };

    const result = step(gameData, state, actions);
    // AI が「見た」ものを更新する。相手の手持ちを覗かないための仕組み
    observe(knowledge, result.state, result.events, 0);
    await playEvents(result.events, result.state);
    state = result.state;
    view = viewFromState(state);
    renderField();
  }

  $("#prompt").textContent = "";
  $("#controls").innerHTML = "";
  return { ...state.result, state };
}

/** 画面下部にボタンを1つ出して、押されるまで待つ。 */
export function waitForButton(label: string, className = "again"): Promise<void> {
  return new Promise((resolve) => {
    const btn = document.createElement("button");
    btn.className = className;
    btn.textContent = label;
    btn.onclick = () => resolve();
    $("#controls").innerHTML = "";
    $("#controls").appendChild(btn);
  });
}
