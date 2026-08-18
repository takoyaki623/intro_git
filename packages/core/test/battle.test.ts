import { describe, expect, it } from "vitest";
import {
  chooseRandomAction,
  createBattle,
  createRng,
  legalActions,
  step,
  type BattleEvent,
  type BattleState,
} from "@pkmn/core";
import { createGameData, gameData } from "@pkmn/data";

const pika = { species: "pikachu", level: 50, moves: ["thunder-shock", "quick-attack"] };
const bulba = { species: "bulbasaur", level: 50, moves: ["tackle", "vine-whip"] };

/** ランダムAI同士で1戦を最後まで進める。 */
function playOut(seed: number): { state: BattleState; events: BattleEvent[]; turns: number } {
  let state = createBattle(gameData, [[pika], [bulba]], seed);
  const events: BattleEvent[] = [];
  let turns = 0;

  while (state.result === null) {
    const rng = createRng(state.rng);
    const actions = [
      chooseRandomAction(gameData, state, 0, rng),
      chooseRandomAction(gameData, state, 1, rng),
    ] as const;
    // AI が消費した乱数も状態に反映する（決定性のため）
    state = { ...state, rng: rng.state() };

    const result = step(gameData, state, [actions[0], actions[1]]);
    state = result.state;
    events.push(...result.events);
    turns++;
  }
  return { state, events, turns };
}

describe("バトルの基本", () => {
  it("開始状態は満タンで結果が無い", () => {
    const state = createBattle(gameData, [[pika], [bulba]], 1);
    expect(state.result).toBeNull();
    expect(state.turn).toBe(0);
    expect(state.sides[0].party[0]!.currentHp).toBe(state.sides[0].party[0]!.maxHp);
  });

  it("step は呼び出し元の state を変更しない", () => {
    const state = createBattle(gameData, [[pika], [bulba]], 1);
    const before = structuredClone(state);
    step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(state).toEqual(before);
  });

  it("技を使うと PP が減る", () => {
    const state = createBattle(gameData, [[pika], [bulba]], 1);
    const { state: next } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(next.sides[0].party[0]!.moves[0]!.pp).toBe(29);
    expect(next.sides[1].party[0]!.moves[0]!.pp).toBe(34);
  });

  it("優先度の高い技が先に出る", () => {
    // ピカチュウ(素早さ高) が通常技、フシギダネが... 逆に遅い側が先制技を使う場合を見る
    const slowWithPriority = {
      species: "geodude", level: 50, moves: ["quick-attack", "tackle"],
    };
    const state = createBattle(gameData, [[slowWithPriority], [pika]], 1);
    const { events } = step(gameData, state, [
      { kind: "move", moveIndex: 0 }, // でんこうせっか（優先度+1）
      { kind: "move", moveIndex: 0 },
    ]);
    const firstMove = events.find((e) => e.kind === "moveUsed");
    expect(firstMove).toMatchObject({ side: 0, move: "quick-attack" });
  });

  it("素早さ順に行動する（優先度が同じ場合）", () => {
    const state = createBattle(gameData, [[bulba], [pika]], 1);
    const { events } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    // ピカチュウ(spe 110) > フシギダネ(spe 85) なので side 1 が先
    const firstMove = events.find((e) => e.kind === "moveUsed");
    expect(firstMove).toMatchObject({ side: 1 });
  });

  it("相性0倍は noEffect になりダメージが出ない", () => {
    const geo = { species: "geodude", level: 50, moves: ["tackle"] };
    const state = createBattle(gameData, [[pika], [geo]], 1);
    const { events } = step(gameData, state, [
      { kind: "move", moveIndex: 0 }, // でんきショック → いわ/じめんに無効
      { kind: "move", moveIndex: 0 },
    ]);
    expect(events.some((e) => e.kind === "noEffect" && e.side === 1)).toBe(true);
    expect(events.some((e) => e.kind === "damage" && e.side === 1)).toBe(false);
  });

  it("決着後に step を呼ぶと投げる", () => {
    const { state } = playOut(7);
    expect(state.result).not.toBeNull();
    expect(() =>
      step(gameData, state, [
        { kind: "move", moveIndex: 0 },
        { kind: "move", moveIndex: 0 },
      ]),
    ).toThrow(/already over/);
  });

  it("回復薬をバトル中に使える。効かない道具は断られるが例外は投げない（v0.9）", () => {
    const state = createBattle(gameData, [[pika], [bulba]], 1, { isWild: true });
    state.sides[0].party[0]!.currentHp = 5;

    const { events } = step(gameData, state, [
      { kind: "item", item: "potion" },
      { kind: "move", moveIndex: 0 },
    ]);
    // 回復した結果の HP はターン終了時点では相手の攻撃を受けた後なので、
    // ここで見るのは**道具が働いたこと**。回復量そのものは use-item.test.ts
    const used = events.find((e) => e.kind === "itemUsed");
    expect(used?.kind === "itemUsed" && used.text).toContain("かいふく");

    // 持ち物としての効果しか無い道具は「使えない」と返るだけ。進行は止めない
    const fresh = createBattle(gameData, [[pika], [bulba]], 1, { isWild: true });
    const refusedRun = step(gameData, fresh, [
      { kind: "item", item: "leftovers" },
      { kind: "move", moveIndex: 0 },
    ]);
    const refusedEvent = refusedRun.events.find((e) => e.kind === "itemUsed");
    expect(refusedEvent?.kind === "itemUsed" && refusedEvent.text).toContain("つかえない");
  });

  it("道具を使ったターンは技を出せない（1ターンを取り合う）", () => {
    const state = createBattle(gameData, [[pika], [bulba]], 1, { isWild: true });
    state.sides[0].party[0]!.currentHp = 5;
    const { events } = step(gameData, state, [
      { kind: "item", item: "potion" },
      { kind: "move", moveIndex: 0 },
    ]);
    // 自分の技は出ていない（相手だけが動く）
    expect(events.some((e) => e.kind === "moveUsed" && e.side === 0)).toBe(false);
    expect(events.some((e) => e.kind === "moveUsed" && e.side === 1)).toBe(true);
  });

  it("トレーナー戦では逃げられず、ボールも投げられない（v0.7 / v0.8）", () => {
    const state = createBattle(gameData, [[pika], [bulba]], 1);
    expect(state.isWild).toBe(false);
    expect(() =>
      step(gameData, state, [{ kind: "run" }, { kind: "move", moveIndex: 0 }]),
    ).toThrow(/野生戦/);
    expect(() =>
      step(gameData, state, [{ kind: "item", item: "poke-ball" }, { kind: "move", moveIndex: 0 }]),
    ).toThrow(/野生戦/);
  });
});

describe("効果レジストリ", () => {
  it("とっしんの反動で自分も減る", () => {
    // イシツブテは いしあたま を持ち、反動を受けない（v0.5）。反動そのものを見る
    const attacker = { species: "rattata", level: 50, moves: ["take-down"] };
    const state = createBattle(gameData, [[attacker], [bulba]], 3);
    const { events } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    const dmg = events.find((e) => e.kind === "damage" && e.side === 1);
    const recoil = events.find((e) => e.kind === "recoil" && e.side === 0);
    if (dmg?.kind !== "damage" || recoil?.kind !== "recoil") {
      // 外した場合はこのシードでは検証できない
      expect(events.some((e) => e.kind === "missed")).toBe(true);
      return;
    }
    expect(recoil.amount).toBe(Math.max(1, Math.floor(dmg.amount * 0.25)));
  });
});

describe("わるあがき（PP切れでも決着する）", () => {
  it("PP が尽きるとわるあがきになり、反動で自滅する", () => {
    // ピカチュウ(spe 110) が先に動くので、倒される前にわるあがきを撃てる
    const state = createBattle(gameData, [[pika], [bulba]], 11);

    // ピカチュウの全ての技の PP を 0 にする
    for (const m of state.sides[0].party[0]!.moves) m.pp = 0;

    const { events } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(events.some((e) => e.kind === "struggle" && e.side === 0)).toBe(true);
    expect(events.some((e) => e.kind === "recoil" && e.side === 0)).toBe(true);
  });

  it("legalActions は PP 切れでも空にならない", () => {
    const state = createBattle(gameData, [[pika], [bulba]], 1);
    for (const m of state.sides[0].party[0]!.moves) m.pp = 0;
    expect(legalActions(gameData, state, 0).length).toBeGreaterThan(0);
  });
});

describe("GameData の注入", () => {
  it("部分的なデータだけを渡してもバトルが成立する", () => {
    // core はデータを静的に持たない。
    const minimal = createGameData({
      species: gameData ? [gameData.species("pikachu"), gameData.species("bulbasaur")] : [],
      moves: [gameData.move("thunder-shock"), gameData.move("tackle")],
    });
    const state = createBattle(
      minimal,
      [
        [{ species: "pikachu", level: 50, moves: ["thunder-shock"] }],
        [{ species: "bulbasaur", level: 50, moves: ["tackle"] }],
      ],
      1,
    );
    const { events } = step(minimal, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(events.length).toBeGreaterThan(0);
  });

  it("存在しない ID は MissingDataError になる", () => {
    // 実在しそうな名前を使うと、後でその技を実装したときにテストの前提が崩れる。
    // （v0.4 で hyper-beam を追加したとき実際に起きた）
    expect(() => gameData.species("__no-such-species__")).toThrow(/species not found/);
    expect(() => gameData.move("__no-such-move__")).toThrow(/move not found/);
  });
});

export { playOut };
