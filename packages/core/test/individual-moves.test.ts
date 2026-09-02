/**
 * 個別の機構を持つ技（v1.2-c）。
 *
 * ビルドアップ・どろぼう・スキルスワップ・ほえる・よこどり・きあいパンチ。
 * **6つとも器が違う**ので、まとめて確かめられるものは1つも無い。
 */

import { describe, expect, it } from "vitest";
import { createBattle, step, type Action } from "@pkmn/core";
import { gameData } from "@pkmn/data";

const mon = (species: string, moves: string[], extra: object = {}) =>
  ({ species, level: 50, moves, ...extra });
const MOVE_0: Action = { kind: "move", moveIndex: 0 };
const MOVE_1: Action = { kind: "move", moveIndex: 1 };

describe("ビルドアップ（能力が2つ動く）", () => {
  it("こうげき と ぼうぎょ が同時に上がる", () => {
    const state = createBattle(
      gameData,
      [[mon("machop", ["bulk-up"])], [mon("rattata", ["harden"])]],
      5,
    );
    const { state: next, events } = step(gameData, state, [MOVE_0, MOVE_0]);
    const self = next.sides[0].party[0]!;
    expect(self.statStages.atk).toBe(1);
    expect(self.statStages.def).toBe(1);
    expect(events.filter((e) => e.kind === "statChange" && e.side === 0)).toHaveLength(2);
  });

  it("1つだけ動く技はこれまでどおり", () => {
    const state = createBattle(
      gameData,
      // 相手は かたくなる ―― なきごえ だと こうげきが下がって、上がり幅に混ざる
      [[mon("rattata", ["swords-dance"])], [mon("rattata", ["harden"])]],
      5,
    );
    const { state: next } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(next.sides[0].party[0]!.statStages.atk).toBe(2);
    expect(next.sides[0].party[0]!.statStages.def).toBe(0);
  });
});

describe("どろぼう", () => {
  const steal = (selfItem?: string, foeItem?: string) =>
    createBattle(
      gameData,
      [
        [mon("rattata", ["thief"], selfItem === undefined ? {} : { item: selfItem })],
        [mon("snorlax", ["growl"], foeItem === undefined ? {} : { item: foeItem })],
      ],
      5,
    );

  it("何も持っていなければ奪える", () => {
    const { state, events } = step(gameData, steal(undefined, "leftovers"), [MOVE_0, MOVE_0]);
    expect(state.sides[0].party[0]!.item).toBe("leftovers");
    expect(state.sides[1].party[0]!.item).toBeNull();
    expect(events.some((e) => e.kind === "itemStolen" && e.side === 0)).toBe(true);
  });

  it("自分が持っていれば奪えない", () => {
    const { state } = step(gameData, steal("leftovers", "sitrus-berry"), [MOVE_0, MOVE_0]);
    expect(state.sides[1].party[0]!.item).toBe("sitrus-berry");
  });

  it("相手が持っていなければ何も起きない", () => {
    const { events } = step(gameData, steal(undefined, undefined), [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "itemStolen")).toBe(false);
  });
});

describe("スキルスワップ", () => {
  it("特性が入れ替わる", () => {
    const state = createBattle(
      gameData,
      [
        [mon("abra", ["skill-swap"], { ability: "synchronize" })],
        [mon("geodude", ["growl"], { ability: "sturdy" })],
      ],
      5,
    );
    const { state: next } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(next.sides[0].party[0]!.ability).toBe("sturdy");
    expect(next.sides[1].party[0]!.ability).toBe("synchronize");
    // **生まれつきの特性は動かない** ―― 交代で戻る
    expect(next.sides[0].party[0]!.innateAbility).toBe("synchronize");
  });
});

describe("ほえる", () => {
  it("トレーナー戦では相手が入れ替わる", () => {
    const state = createBattle(
      gameData,
      [[mon("rattata", ["roar"])], [mon("snorlax", ["growl"]), mon("pikachu", ["growl"])]],
      5,
    );
    expect(state.isWild).toBe(false);
    const { state: next, events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(next.sides[1].activeIndex).toBe(1);
    expect(events.some((e) => e.kind === "switchIn" && e.side === 1)).toBe(true);
  });

  it("控えが居なければ失敗する", () => {
    const state = createBattle(
      gameData,
      [[mon("rattata", ["roar"])], [mon("snorlax", ["growl"])]],
      5,
    );
    const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events).toContainEqual({ kind: "failed", side: 0 });
  });

  it("野生戦では逃げられてバトルが終わる", () => {
    const state = createBattle(
      gameData,
      [[mon("rattata", ["roar"])], [mon("snorlax", ["growl"])]],
      5,
      { isWild: true },
    );
    const { state: next, events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(next.result).toEqual({ winner: null, reason: "escaped" });
    expect(events.some((e) => e.kind === "fled")).toBe(true);
  });
});

describe("よこどり", () => {
  it("自分に掛ける変化技を横取りする", () => {
    // side 0 が よこどり（優先度+4）、side 1 が つるぎのまい
    const state = createBattle(
      gameData,
      [[mon("rattata", ["snatch", "growl"])], [mon("rattata", ["swords-dance"])]],
      5,
    );
    const { state: next, events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "snatched" && e.side === 0)).toBe(true);
    // 上がるのは横取りした側
    expect(next.sides[0].party[0]!.statStages.atk).toBe(2);
    expect(next.sides[1].party[0]!.statStages.atk).toBe(0);
  });

  it("相手に掛ける技は横取りしない", () => {
    const state = createBattle(
      gameData,
      [[mon("rattata", ["snatch", "growl"])], [mon("rattata", ["growl"])]],
      5,
    );
    const { state: next, events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "snatched")).toBe(false);
    expect(next.sides[0].party[0]!.statStages.atk).toBe(-1);
  });

  it("構えは次のターンに残らない", () => {
    const state = createBattle(
      gameData,
      // 2手目は かたくなる ―― なきごえ だと相手のこうげきが下がって、
      // 「横取りしなかった」ことが上がり幅に混ざる
      [[mon("rattata", ["snatch", "harden"])], [mon("rattata", ["swords-dance"])]],
      5,
    );
    let next = step(gameData, state, [MOVE_0, MOVE_0]).state;
    expect(next.sides[0].party[0]!.volatile.snatching).toBe(false);
    const { state: after } = step(gameData, next, [MOVE_1, MOVE_0]);
    expect(after.sides[1].party[0]!.statStages.atk).toBe(2);
  });
});

describe("きあいパンチ", () => {
  it("先に殴られると気合いが抜ける", () => {
    // ピカチュウ（速い）が たいあたり、カラカラ が きあいパンチ（優先度 −3）
    const state = createBattle(
      gameData,
      [[mon("cubone", ["focus-punch"])], [mon("pikachu", ["tackle"])]],
      5,
    );
    const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events).toContainEqual({ kind: "focusBroken", side: 0 });
    expect(events.some((e) => e.kind === "damage" && e.side === 1)).toBe(false);
  });

  it("殴られなければ撃てる", () => {
    const state = createBattle(
      gameData,
      [[mon("cubone", ["focus-punch"])], [mon("pikachu", ["growl"])]],
      5,
    );
    const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "focusBroken")).toBe(false);
    expect(events.some((e) => e.kind === "damage" && e.side === 1)).toBe(true);
  });
});
