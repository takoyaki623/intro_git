/**
 * 相手に掛ける状態（v1.2-c）。ちょうはつ・いちゃもん・メロメロ・まもる。
 *
 * 4つとも「相手の選択肢を減らす」技で、器は volatile 1つ。
 * **減り方が4つとも違う**（変化技だけ／同じ技だけ／半分の確率／そのターン全部）ので、
 * 減っていることを別々に確かめる。
 */

import { describe, expect, it } from "vitest";
import {
  createBattle,
  step,
  usableMoveIndices,
  type Action,
  type BattleState,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";

const mon = (species: string, moves: string[], extra: object = {}) =>
  ({ species, level: 50, moves, ...extra });
const MOVE_0: Action = { kind: "move", moveIndex: 0 };
const MOVE_1: Action = { kind: "move", moveIndex: 1 };

/** side 1 が side 0 に技を掛ける盤面。side 0 は たいあたり と なきごえ を持つ。 */
function hit(move: string, seed = 3): BattleState {
  const state = createBattle(
    gameData,
    // 掛ける側は カビゴン ―― 貧弱だと、状態を見届ける前に倒れてしまう
    [[mon("rattata", ["tackle", "growl"])], [mon("snorlax", [move])]],
    seed,
  );
  return step(gameData, state, [MOVE_0, MOVE_0]).state;
}

describe("ちょうはつ", () => {
  it("変化技だけが選べなくなる", () => {
    const state = hit("taunt");
    expect(state.sides[0].party[0]!.volatile.tauntTurns).toBe(2); // 3 からターン終了で1減る
    expect(usableMoveIndices(gameData, state, 0)).toEqual([0]); // たいあたり だけ
  });

  it("ターンが尽きると解ける", () => {
    let state = hit("taunt");
    let ended = false;
    for (let i = 0; i < 4 && !ended; i++) {
      const result = step(gameData, state, [MOVE_0, MOVE_0]);
      state = result.state;
      ended = result.events.some((e) => e.kind === "tauntEnded" && e.side === 0);
    }
    expect(ended).toBe(true);
    expect(usableMoveIndices(gameData, state, 0)).toEqual([0, 1]);
  });
});

describe("いちゃもん", () => {
  it("直前に出した技だけが選べなくなる", () => {
    // 1ターン目: side 0 は たいあたり、side 1 が いちゃもん
    const state = hit("torment");
    expect(state.sides[0].party[0]!.volatile.tormented).toBe(true);
    expect(state.sides[0].party[0]!.volatile.lastMove).toBe("tackle");
    expect(usableMoveIndices(gameData, state, 0)).toEqual([1]); // なきごえ だけ
  });

  it("別の技を出せば、前の技はまた選べる", () => {
    let state = hit("torment");
    state = step(gameData, state, [MOVE_1, MOVE_0]).state; // なきごえ
    expect(usableMoveIndices(gameData, state, 0)).toEqual([0]); // 今度は たいあたり だけ
  });

  it("ターンでは切れない", () => {
    let state = hit("torment");
    for (let i = 0; i < 5; i++) {
      state = step(gameData, state, [{ kind: "move", moveIndex: i % 2 }, MOVE_0]).state;
    }
    expect(state.sides[0].party[0]!.volatile.tormented).toBe(true);
  });
});

describe("メロメロ", () => {
  const pair = (a: string | null, b: string | null) =>
    createBattle(
      gameData,
      [
        [mon("rattata", ["tackle", "growl"], { gender: a })],
        [mon("snorlax", ["attract"], { gender: b })],
      ],
      3,
    );

  it("性別が違えば効く", () => {
    const { state, events } = step(gameData, pair("male", "female"), [MOVE_0, MOVE_0]);
    expect(events).toContainEqual({ kind: "infatuatedWith", side: 0 });
    expect(state.sides[0].party[0]!.volatile.infatuated).toBe(1);
  });

  it("同じ性別には効かない", () => {
    const { state, events } = step(gameData, pair("male", "male"), [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "infatuatedWith")).toBe(false);
    expect(state.sides[0].party[0]!.volatile.infatuated).toBeNull();
  });

  it("性別が無い相手には効かない", () => {
    const { state } = step(gameData, pair(null, "female"), [MOVE_0, MOVE_0]);
    expect(state.sides[0].party[0]!.volatile.infatuated).toBeNull();
  });

  it("かかると、ときどき動けない", () => {
    let state = step(gameData, pair("male", "female"), [MOVE_0, MOVE_0]).state;
    let blocked = 0;
    for (let i = 0; i < 12; i++) {
      const result = step(gameData, state, [MOVE_1, MOVE_0]);
      state = result.state;
      if (result.events.some((e) => e.kind === "blocked" && e.reason === "infatuation")) blocked++;
    }
    // 半分の確率。**0回でも12回でもないこと**だけを見る（乱数の分布は見ない）
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(12);
  });
});

describe("まもる", () => {
  const guard = () =>
    createBattle(
      gameData,
      [[mon("rattata", ["protect", "growl"])], [mon("rattata", ["tackle"])]],
      3,
    );

  it("そのターンの攻撃を防ぐ", () => {
    const { state, events } = step(gameData, guard(), [MOVE_0, MOVE_0]);
    expect(events).toContainEqual({ kind: "protecting", side: 0 });
    expect(events).toContainEqual({ kind: "protected", side: 0 });
    expect(state.sides[0].party[0]!.currentHp).toBe(state.sides[0].party[0]!.maxHp);
  });

  it("守りは次のターンには残らない", () => {
    let state = step(gameData, guard(), [MOVE_0, MOVE_0]).state;
    expect(state.sides[0].party[0]!.volatile.protecting).toBe(false);
    const { state: next } = step(gameData, state, [MOVE_1, MOVE_0]);
    expect(next.sides[0].party[0]!.currentHp).toBeLessThan(next.sides[0].party[0]!.maxHp);
  });

  it("続けるほど成功しにくくなる", () => {
    let state = guard();
    let success = 0;
    for (let i = 0; i < 8; i++) {
      const result = step(gameData, state, [MOVE_0, MOVE_0]);
      state = result.state;
      if (result.events.some((e) => e.kind === "protecting")) success++;
      if (state.result !== null) break;
    }
    // 8回続けて全部成功することは（確率 1/2^28 なので）無い
    expect(success).toBeLessThan(8);
  });

  it("ほかの技を出すと連続回数が戻る", () => {
    let state = step(gameData, guard(), [MOVE_0, MOVE_0]).state;
    expect(state.sides[0].party[0]!.volatile.protectStreak).toBe(1);
    state = step(gameData, state, [MOVE_1, MOVE_0]).state;
    expect(state.sides[0].party[0]!.volatile.protectStreak).toBe(0);
  });
});
