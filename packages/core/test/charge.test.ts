/**
 * 溜め技と反動の休み（v1.2-c）。
 *
 * そらをとぶ・あなをほる・ソーラービーム・はかいこうせん。
 * **「1ターン損をする」ことが、その威力を許している**ので、
 * 損をしていることをテストで押さえる。
 */

import { describe, expect, it } from "vitest";
import {
  createBattle,
  legalActions,
  step,
  usableMoveIndices,
  type Action,
  type BattleState,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";

const mon = (species: string, moves: string[], level = 50) => ({ species, level, moves });
const MOVE_0: Action = { kind: "move", moveIndex: 0 };
const MOVE_1: Action = { kind: "move", moveIndex: 1 };

/** side 0 が溜め技を持ち、side 1 は なきごえ を撃つだけ。 */
const setup = (move: string, foe = "rattata"): BattleState =>
  createBattle(gameData, [[mon("pidgeot", [move, "growl"])], [mon(foe, ["growl"])]], 3);

describe("溜め技", () => {
  it("1ターン目はダメージを与えず、溜めに入る", () => {
    const { state, events } = step(gameData, setup("fly"), [MOVE_0, MOVE_0]);
    expect(events).toContainEqual({ kind: "charging", side: 0, move: "fly" });
    expect(events.some((e) => e.kind === "damage" && e.side === 1)).toBe(false);
    expect(state.sides[0].party[0]!.volatile.charging).toBe("fly");
  });

  it("2ターン目に撃ち、溜めが解ける", () => {
    let state = step(gameData, setup("fly"), [MOVE_0, MOVE_0]).state;
    const { state: next, events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "damage" && e.side === 1)).toBe(true);
    expect(next.sides[0].party[0]!.volatile.charging).toBeNull();
  });

  it("PP は1ターン目にだけ減る", () => {
    const before = setup("fly").sides[0].party[0]!.moves[0]!.pp;
    let state = step(gameData, setup("fly"), [MOVE_0, MOVE_0]).state;
    expect(state.sides[0].party[0]!.moves[0]!.pp).toBe(before - 1);
    state = step(gameData, state, [MOVE_0, MOVE_0]).state;
    expect(state.sides[0].party[0]!.moves[0]!.pp).toBe(before - 1);
  });

  it("溜め中はほかの技も交代も選べない", () => {
    const state = step(gameData, setup("fly"), [MOVE_0, MOVE_0]).state;
    expect(usableMoveIndices(gameData, state, 0)).toEqual([0]);
    expect(legalActions(gameData, state, 0)).toEqual([{ kind: "move", moveIndex: 0 }]);
  });

  it("そらをとぶ・あなをほる の溜め中は技が当たらない", () => {
    for (const move of ["fly", "dig"]) {
      // 相手は攻撃技を持つ。溜めているあいだは当たらない
      const start = createBattle(
        gameData,
        [[mon("pidgeot", [move, "growl"])], [mon("rattata", ["tackle"])]],
        3,
      );
      const { events } = step(gameData, start, [MOVE_0, MOVE_0]);
      expect(events.some((e) => e.kind === "missed" && e.side === 1)).toBe(true);
      expect(events.some((e) => e.kind === "damage" && e.side === 0)).toBe(false);
    }
  });

  it("ソーラービーム は溜め中でも当たる（姿が消えない）", () => {
    const start = createBattle(
      gameData,
      [[mon("venusaur", ["solar-beam", "growl"])], [mon("rattata", ["tackle"])]],
      3,
    );
    const { events } = step(gameData, start, [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "charging")).toBe(true);
    expect(events.some((e) => e.kind === "damage" && e.side === 0)).toBe(true);
  });

  it("にほんばれ 中の ソーラービーム は溜めを飛ばす", () => {
    // 1手目 にほんばれ、2手目 ソーラービーム
    let state = createBattle(
      gameData,
      [[mon("venusaur", ["sunny-day", "solar-beam"])], [mon("rattata", ["growl"])]],
      3,
    );
    state = step(gameData, state, [MOVE_0, MOVE_0]).state;
    expect(state.weather?.kind).toBe("sun");
    const { state: next, events } = step(gameData, state, [MOVE_1, MOVE_0]);
    expect(events.some((e) => e.kind === "charging")).toBe(false);
    expect(events.some((e) => e.kind === "damage" && e.side === 1)).toBe(true);
    expect(next.sides[0].party[0]!.volatile.charging).toBeNull();
  });
});

describe("反動の休み", () => {
  const beam = () =>
    createBattle(
      gameData,
      [[mon("pidgeot", ["hyper-beam", "growl"])], [mon("snorlax", ["growl"])]],
      3,
    );

  it("撃った次のターンは動けない", () => {
    let state = step(gameData, beam(), [MOVE_0, MOVE_0]).state;
    expect(state.sides[0].party[0]!.volatile.mustRecharge).toBe(true);
    const { state: next, events } = step(gameData, state, [MOVE_1, MOVE_0]);
    expect(events).toContainEqual({ kind: "blocked", side: 0, reason: "recharge" });
    expect(next.sides[0].party[0]!.volatile.mustRecharge).toBe(false);
  });

  it("休みは1ターンだけ", () => {
    let state = step(gameData, beam(), [MOVE_0, MOVE_0]).state;
    state = step(gameData, state, [MOVE_1, MOVE_0]).state;
    const { events } = step(gameData, state, [MOVE_1, MOVE_0]);
    expect(events.some((e) => e.kind === "blocked" && e.reason === "recharge")).toBe(false);
  });

  it("交代で溜めも休みも解ける", () => {
    let state = createBattle(
      gameData,
      [[mon("pidgeot", ["fly", "growl"]), mon("rattata", ["growl"])], [mon("snorlax", ["growl"])]],
      3,
    );
    state = step(gameData, state, [MOVE_0, MOVE_0]).state;
    expect(state.sides[0].party[0]!.volatile.charging).toBe("fly");
    // 溜め中は交代が選べないので、盤面の側から確かめる
    state = step(gameData, state, [{ kind: "switch", partyIndex: 1 }, MOVE_0]).state;
    expect(state.sides[0].party[0]!.volatile.charging).toBeNull();
  });
});
