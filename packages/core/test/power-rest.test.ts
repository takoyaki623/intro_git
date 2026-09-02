/**
 * 状況で決まる威力と ねむる（v1.2-c）。
 *
 * おんがえし・やつあたり・からげんき・ねむる。
 * **威力が表に書けない技**は、書けないなりに「何で決まるか」を押さえる。
 */

import { describe, expect, it } from "vitest";
import {
  createBattle,
  DEFAULT_FRIENDSHIP,
  MAX_FRIENDSHIP,
  resolveVariablePower,
  step,
  toBattlePokemon,
  type Action,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";

const mon = (species: string, moves: string[], extra: object = {}) =>
  ({ species, level: 50, moves, ...extra });
const battler = (moves: string[], extra: object = {}) =>
  toBattlePokemon(gameData, mon("rattata", moves, extra));
const MOVE_0: Action = { kind: "move", moveIndex: 0 };

describe("なつき度で決まる威力", () => {
  it("おんがえし はなついているほど強い", () => {
    const low = resolveVariablePower(gameData.move("return").effect, battler(["return"], { friendship: 0 }));
    const high = resolveVariablePower(gameData.move("return").effect, battler(["return"], { friendship: MAX_FRIENDSHIP }));
    expect(low).toBe(1); // 0 でも威力1（当たれば1は入る）
    expect(high).toBe(102);
  });

  it("やつあたり はその逆", () => {
    const effect = gameData.move("frustration").effect;
    expect(resolveVariablePower(effect, battler(["frustration"], { friendship: 0 }))).toBe(102);
    expect(resolveVariablePower(effect, battler(["frustration"], { friendship: MAX_FRIENDSHIP }))).toBe(1);
  });

  it("同じなつき度なら、2つの威力を足すと同じになる", () => {
    for (const friendship of [0, 70, 120, 255]) {
      const a = resolveVariablePower(gameData.move("return").effect, battler(["return"], { friendship }))!;
      const b = resolveVariablePower(gameData.move("frustration").effect, battler(["frustration"], { friendship }))!;
      expect(a + b).toBeGreaterThanOrEqual(102);
      expect(a + b).toBeLessThanOrEqual(103);
    }
  });

  it("設計図から作られた相手は既定のなつき度を持つ", () => {
    expect(battler(["return"]).friendship).toBe(DEFAULT_FRIENDSHIP);
  });

  it("実際にダメージが変わる", () => {
    const fight = (friendship: number) => {
      const state = createBattle(
        gameData,
        [[mon("rattata", ["return"], { friendship })], [mon("snorlax", ["growl"])]],
        5,
      );
      const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
      const hit = events.find((e) => e.kind === "damage");
      return hit?.kind === "damage" ? hit.amount : 0;
    };
    expect(fight(MAX_FRIENDSHIP)).toBeGreaterThan(fight(0));
  });
});

describe("からげんき", () => {
  const effect = gameData.move("facade").effect;

  it("状態異常のとき威力が2倍になる", () => {
    expect(resolveVariablePower(effect, battler(["facade"]))).toBe(70);
    expect(resolveVariablePower(effect, battler(["facade"], { status: "poison" }))).toBe(140);
  });
});

describe("ねむる", () => {
  const rest = (hpRatio: number, extra: object = {}) =>
    createBattle(
      gameData,
      [[mon("snorlax", ["rest"], { hpRatio, ...extra })], [mon("rattata", ["growl"])]],
      5,
    );

  it("全回復して2ターン眠る", () => {
    const { state } = step(gameData, rest(0.3), [MOVE_0, MOVE_0]);
    const self = state.sides[0].party[0]!;
    expect(self.currentHp).toBe(self.maxHp);
    expect(self.status).toBe("sleep");
    expect(self.statusCounter).toBe(2);
  });

  it("状態異常も治る（眠りに置き換わる）", () => {
    const { state } = step(gameData, rest(0.3, { status: "poison" }), [MOVE_0, MOVE_0]);
    expect(state.sides[0].party[0]!.status).toBe("sleep");
  });

  it("満タンなら失敗する", () => {
    const { state, events } = step(gameData, rest(1), [MOVE_0, MOVE_0]);
    expect(events).toContainEqual({ kind: "failed", side: 0 });
    expect(state.sides[0].party[0]!.status).toBeNull();
  });

  it("眠ったあとは2ターン動けない", () => {
    let state = step(gameData, rest(0.3), [MOVE_0, MOVE_0]).state;
    for (const _ of [0, 1]) {
      const result = step(gameData, state, [MOVE_0, MOVE_0]);
      state = result.state;
      expect(result.events.some((e) => e.kind === "blocked" && e.reason === "sleep")).toBe(true);
    }
    const { events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(events.some((e) => e.kind === "wokeUp")).toBe(true);
  });
});
