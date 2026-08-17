/**
 * 交代。ひんし後の交代要求（pendingSwitch）を含む。
 * 設計: docs/design/battle-system.md §9
 */

import { describe, expect, it } from "vitest";
import {
  activeOf,
  chooseRandomAction,
  createBattle,
  createRng,
  legalActions,
  requiredSides,
  step,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";

const pika = { species: "pikachu", level: 50, moves: ["thunder-shock"] };
const bulba = { species: "bulbasaur", level: 50, moves: ["tackle"] };
const geo = { species: "geodude", level: 50, moves: ["rock-throw"] };

describe("交代", () => {
  it("交代は技より先に処理される", () => {
    const state = createBattle(gameData, [[pika, geo], [bulba]], 1);
    const { events } = step(gameData, state, [
      { kind: "switch", partyIndex: 1 },
      { kind: "move", moveIndex: 0 },
    ]);
    const switchIdx = events.findIndex((e) => e.kind === "switchIn");
    const moveIdx = events.findIndex((e) => e.kind === "moveUsed");
    expect(switchIdx).toBeGreaterThanOrEqual(0);
    expect(switchIdx).toBeLessThan(moveIdx);
  });

  it("交代でランク補正が消える", () => {
    const machop = { species: "machop", level: 50, moves: ["swords-dance"] };
    const state = createBattle(gameData, [[machop, geo], [bulba]], 2);

    const boosted = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(boosted.state.sides[0].party[0]!.statStages.atk).toBe(2);

    const swapped = step(gameData, boosted.state, [
      { kind: "switch", partyIndex: 1 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(swapped.state.sides[0].party[0]!.statStages.atk).toBe(0);
    expect(swapped.state.sides[0].activeIndex).toBe(1);
  });

  it("ひんしで手持ちが残っていれば交代を要求される", () => {
    const state = createBattle(gameData, [[pika, geo], [bulba]], 1);
    state.sides[0].party[0]!.currentHp = 1;

    let next = state;
    // 相手に殴らせて倒れさせる
    for (let i = 0; i < 5 && next.pendingSwitch.length === 0 && next.result === null; i++) {
      next = step(gameData, next, [
        { kind: "move", moveIndex: 0 },
        { kind: "move", moveIndex: 0 },
      ]).state;
    }

    expect(next.result).toBeNull(); // まだ負けていない
    expect(next.pendingSwitch).toContain(0);
    expect(requiredSides(next)).toEqual([0]);

    // 交代要求中は交代しか選べない
    const actions = legalActions(next, 0);
    expect(actions.every((a) => a.kind === "switch")).toBe(true);
    expect(legalActions(next, 1)).toEqual([]);

    // 交代してもターンは進まない
    const turnBefore = next.turn;
    const after = step(gameData, next, [{ kind: "switch", partyIndex: 1 }, null]);
    expect(after.state.turn).toBe(turnBefore);
    expect(after.state.pendingSwitch).toEqual([]);
    expect(activeOf(after.state, 0).species).toBe("geodude");
  });

  it("手持ちが全滅したら負ける", () => {
    const state = createBattle(gameData, [[pika], [bulba]], 1);
    state.sides[0].party[0]!.currentHp = 1;

    let next = state;
    for (let i = 0; i < 5 && next.result === null; i++) {
      next = step(gameData, next, [
        { kind: "move", moveIndex: 0 },
        { kind: "move", moveIndex: 0 },
      ]).state;
    }
    expect(next.result).toEqual({ winner: 1 });
  });

  it("ひんししたポケモンには交代できない", () => {
    const state = createBattle(gameData, [[pika, geo], [bulba]], 1);
    state.sides[0].party[1]!.currentHp = 0;
    expect(() =>
      step(gameData, state, [
        { kind: "switch", partyIndex: 1 },
        { kind: "move", moveIndex: 0 },
      ]),
    ).toThrow(/fainted/);
  });

  it("場に出ているポケモンには交代できない", () => {
    const state = createBattle(gameData, [[pika, geo], [bulba]], 1);
    expect(() =>
      step(gameData, state, [
        { kind: "switch", partyIndex: 0 },
        { kind: "move", moveIndex: 0 },
      ]),
    ).toThrow(/active/);
  });
});

describe("複数手持ちでの完走", () => {
  it("3体 vs 3体がランダムAIで決着する", () => {
    const teamA = [pika, geo, { species: "machop", level: 50, moves: ["karate-chop"] }];
    const teamB = [
      bulba,
      { species: "lapras", level: 50, moves: ["surf"] },
      { species: "gastly", level: 50, moves: ["sludge"] },
    ];

    for (let seed = 1; seed <= 30; seed++) {
      let state = createBattle(gameData, [teamA, teamB], seed);
      let guard = 0;
      while (state.result === null) {
        if (++guard > 500) throw new Error("did not finish");
        const rng = createRng(state.rng);
        const sides = requiredSides(state);
        const actions: [ReturnType<typeof chooseRandomAction> | null, ReturnType<typeof chooseRandomAction> | null] = [null, null];
        for (const side of sides) actions[side] = chooseRandomAction(state, side, rng);
        state = { ...state, rng: rng.state() };
        state = step(gameData, state, actions).state;
      }
      expect(state.result).not.toBeNull();
    }
  });
});
