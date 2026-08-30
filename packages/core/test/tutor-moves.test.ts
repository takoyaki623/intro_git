/**
 * 技教え人の技のうち、新しい機構が要ったもの（v1.2-d）。
 *
 * ちきゅうなげ・じばく・ゆめくい・ものまね・カウンター・みがわり・ゆびをふる。
 * **7つとも器が違う**ので、まとめて見られるものは無い。
 */

import { describe, expect, it } from "vitest";
import { createBattle, step, type Action, type BattleState } from "@pkmn/core";
import { gameData } from "@pkmn/data";

const mon = (species: string, moves: string[], extra: object = {}) =>
  ({ species, level: 50, moves, ...extra });
const MOVE_0: Action = { kind: "move", moveIndex: 0 };
const MOVE_1: Action = { kind: "move", moveIndex: 1 };

const fight = (mine: string[], theirs: string[], seed = 5, extra: object = {}): BattleState =>
  createBattle(gameData, [[mon("machop", mine)], [mon("snorlax", theirs, extra)]], seed);

describe("ちきゅうなげ", () => {
  it("ダメージは使う側のレベルと同じ", () => {
    const { events } = step(gameData, fight(["seismic-toss"], ["growl"]), [MOVE_0, MOVE_0]);
    const hit = events.find((e) => e.kind === "damage");
    expect(hit?.kind === "damage" ? hit.amount : 0).toBe(50);
  });

  it("相性で無効なら当たらない（ゴーストに かくとう）", () => {
    const state = createBattle(
      gameData,
      [[mon("machop", ["seismic-toss"])], [mon("gastly", ["growl"])]],
      5,
    );
    const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "noEffect")).toBe(true);
  });
});

describe("だいばくはつ", () => {
  it("当てたあと、使った側が倒れる", () => {
    const { state, events } = step(gameData, fight(["explosion"], ["growl"]), [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "damage" && e.side === 1)).toBe(true);
    expect(state.sides[0].party[0]!.currentHp).toBe(0);
  });
});

describe("ゆめくい", () => {
  it("眠っていない相手には失敗する", () => {
    const { events } = step(gameData, fight(["dream-eater"], ["growl"]), [MOVE_0, MOVE_0]);
    expect(events).toContainEqual({ kind: "failed", side: 0 });
    expect(events.some((e) => e.kind === "damage" && e.side === 1)).toBe(false);
  });

  it("眠っている相手からは吸える", () => {
    const state = fight(["dream-eater"], ["growl"], 5, { status: "sleep" });
    // 先に少し削っておかないと、吸っても回復が見えない
    state.sides[0].party[0]!.currentHp = 10;
    const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "damage" && e.side === 1)).toBe(true);
    expect(events.some((e) => e.kind === "drain" && e.side === 0)).toBe(true);
  });
});

describe("ものまね", () => {
  it("相手が直前に使った技を、その枠に上書きする", () => {
    // 1ターン目: 相手が たいあたり、こちらは ものまね（先に動くのは相手）
    const state = createBattle(
      gameData,
      [[mon("machop", ["mimic", "growl"])], [mon("pikachu", ["tackle"])]],
      5,
    );
    const { state: next, events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "mimicked" && e.move === "tackle")).toBe(true);
    expect(next.sides[0].party[0]!.moves.map((m) => m.id)).toContain("tackle");
    expect(next.sides[0].party[0]!.moves.map((m) => m.id)).not.toContain("mimic");
  });

  it("相手がまだ何も撃っていなければ失敗する", () => {
    // 相手より先に動く側が ものまね を撃つ
    const state = createBattle(
      gameData,
      [[mon("pikachu", ["mimic"])], [mon("snorlax", ["growl"])]],
      5,
    );
    const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events).toContainEqual({ kind: "failed", side: 0 });
  });
});

describe("カウンター", () => {
  it("受けた物理ダメージの2倍を返す", () => {
    // ピカチュウ（速い）が たいあたり、カラカラ が カウンター（優先度 −5）
    const state = createBattle(
      gameData,
      [[mon("cubone", ["counter"])], [mon("pikachu", ["tackle"])]],
      5,
    );
    const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
    const taken = events.find((e) => e.kind === "damage" && e.side === 0);
    const returned = events.find((e) => e.kind === "damage" && e.side === 1);
    expect(taken?.kind === "damage" ? taken.amount : 0).toBeGreaterThan(0);
    expect(returned?.kind === "damage" ? returned.amount : 0).toBe(
      (taken?.kind === "damage" ? taken.amount : 0) * 2,
    );
  });

  it("殴られていなければ失敗する", () => {
    const state = createBattle(
      gameData,
      [[mon("cubone", ["counter"])], [mon("pikachu", ["growl"])]],
      5,
    );
    const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events).toContainEqual({ kind: "failed", side: 0 });
  });
});

describe("みがわり", () => {
  const guard = (foeMoves: string[]) =>
    createBattle(
      gameData,
      [[mon("snorlax", ["substitute", "growl"])], [mon("pikachu", foeMoves)]],
      5,
    );

  it("最大HPの1/4を払って立つ", () => {
    const { state, events } = step(gameData, guard(["growl"]), [MOVE_0, MOVE_0]);
    const self = state.sides[0].party[0]!;
    expect(events.some((e) => e.kind === "substituteUp")).toBe(true);
    expect(self.volatile.substitute).toBe(Math.floor(self.maxHp / 4));
    expect(self.maxHp - self.currentHp).toBe(Math.floor(self.maxHp / 4));
  });

  it("立っている間はダメージを身代わりが受ける", () => {
    let state = step(gameData, guard(["thunder-shock"]), [MOVE_0, MOVE_0]).state;
    const before = state.sides[0].party[0]!.currentHp;
    const { state: next, events } = step(gameData, state, [MOVE_1, MOVE_0]);
    expect(events.some((e) => e.kind === "substituteHit")).toBe(true);
    expect(next.sides[0].party[0]!.currentHp).toBe(before);
  });

  it("立っている間は状態異常も通らない", () => {
    // **相手は素早さの低い ヤドン。** 速いと、身代わりが立つ前のターンに
    // 麻痺させてしまい、2ターン目に見えるのはその残り
    const slow = createBattle(
      gameData,
      [[mon("snorlax", ["substitute", "growl"])], [mon("slowpoke", ["thunder-wave"])]],
      5,
    );
    let state = step(gameData, slow, [MOVE_0, MOVE_0]).state;
    expect(state.sides[0].party[0]!.status).toBeNull();
    const { state: next } = step(gameData, state, [MOVE_1, MOVE_0]);
    expect(next.sides[0].party[0]!.status).toBeNull();
  });

  it("削り切られると壊れる", () => {
    let state = step(gameData, guard(["thunder-shock"]), [MOVE_0, MOVE_0]).state;
    let broke = false;
    for (let i = 0; i < 12 && !broke; i += 1) {
      const result = step(gameData, state, [MOVE_1, MOVE_0]);
      state = result.state;
      broke = result.events.some((e) => e.kind === "substituteBroke");
    }
    expect(broke).toBe(true);
    expect(state.sides[0].party[0]!.volatile.substitute).toBe(0);
  });
});

describe("ゆびをふる", () => {
  it("別の技を呼んで撃つ", () => {
    const state = createBattle(
      gameData,
      [[mon("machop", ["metronome"])], [mon("snorlax", ["growl"])]],
      5,
    );
    const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
    const called = events.find((e) => e.kind === "calledMove");
    expect(called).toBeDefined();
    if (called?.kind !== "calledMove") return;
    // **自分自身は呼べない**（呼べると終わらない）
    expect(called.move).not.toBe("metronome");
  });

  it("呼んだ技が実際に使われる", () => {
    const state = createBattle(
      gameData,
      [[mon("machop", ["metronome"])], [mon("snorlax", ["growl"])]],
      5,
    );
    const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
    const called = events.find((e) => e.kind === "calledMove");
    const used = events.filter((e) => e.kind === "moveUsed" && e.side === 0);
    if (called?.kind !== "calledMove") return;
    expect(used.some((e) => e.kind === "moveUsed" && e.move === called.move)).toBe(true);
  });
});
