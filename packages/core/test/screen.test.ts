/**
 * 壁（v1.2-c）。リフレクター・ひかりのかべ・しんぴのまもり。
 *
 * 3つは効き方が違う（半減・半減・状態異常を防ぐ）が器は1つ。
 * **器が同じでも効きは別々に確かめる** ―― 1つ通ったから3つ通る、ではない。
 */

import { describe, expect, it } from "vitest";
import {
  calcDamage,
  createBattle,
  createRng,
  createRngState,
  step,
  toBattlePokemon,
  type Action,
  type BattleState,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";

const rng = () => createRng(createRngState(4242));
const mon = (species: string, moves: string[], level = 50) => ({ species, level, moves });
const battler = (species: string, moves: string[] = ["tackle"], level = 50) =>
  toBattlePokemon(gameData, { species, level, moves });

const MOVE_0: Action = { kind: "move", moveIndex: 0 };
const MOVE_1: Action = { kind: "move", moveIndex: 1 };

/** side 0 が壁を張った直後の盤面。 */
function withScreen(move: string): BattleState {
  const state = createBattle(
    gameData,
    [[mon("pikachu", [move, "growl"])], [mon("rattata", ["growl"])]],
    1,
  );
  return step(gameData, state, [MOVE_0, MOVE_0]).state;
}

describe("壁を張る", () => {
  it("3つとも自分の側に張られる", () => {
    const pairs = [
      ["reflect", "reflect"], ["light-screen", "lightScreen"], ["safeguard", "safeguard"],
    ] as const;
    for (const [move, screen] of pairs) {
      const state = withScreen(move);
      // 張ったターンの終了時にもう1つ減っている（天気と同じ）
      expect(state.sides[0].screens[screen]).toBe(4);
      // **相手の側には張られない**
      expect(state.sides[1].screens[screen]).toBeUndefined();
    }
  });

  it("同じ壁を重ねて張ると失敗する", () => {
    const state = withScreen("reflect");
    const { state: next, events } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(next.sides[0].screens.reflect).toBe(3);
    expect(events.some((e) => e.kind === "screenStart")).toBe(false);
    expect(events.some((e) => e.kind === "failed")).toBe(true);
  });

  it("5ターンで切れる", () => {
    let state = withScreen("reflect");
    let ended = false;
    for (let i = 0; i < 6 && !ended; i++) {
      const result = step(gameData, state, [MOVE_1, MOVE_0]);
      state = result.state;
      ended = result.events.some((e) => e.kind === "screenEnd");
    }
    expect(ended).toBe(true);
    expect(state.sides[0].screens.reflect).toBeUndefined();
  });
});

describe("ダメージの軽減", () => {
  const attacker = () => battler("rattata", ["tackle", "swift"]);
  const defender = () => battler("rattata");
  const fixed = { forceCritical: false, forceRandom: 100 } as const;
  const damageOf = (move: string, screens: readonly ("reflect" | "lightScreen" | "safeguard")[]) =>
    calcDamage(gameData, attacker(), defender(), gameData.move(move), rng(), { ...fixed, screens })
      .damage;

  it("リフレクターは物理を半分にし、特殊には効かない", () => {
    expect(damageOf("tackle", ["reflect"])).toBeLessThan(damageOf("tackle", []));
    expect(damageOf("swift", ["reflect"])).toBe(damageOf("swift", []));
  });

  it("ひかりのかべは特殊を半分にし、物理には効かない", () => {
    expect(damageOf("swift", ["lightScreen"])).toBeLessThan(damageOf("swift", []));
    expect(damageOf("tackle", ["lightScreen"])).toBe(damageOf("tackle", []));
  });

  it("しんぴのまもりはダメージを変えない", () => {
    expect(damageOf("tackle", ["safeguard"])).toBe(damageOf("tackle", []));
    expect(damageOf("swift", ["safeguard"])).toBe(damageOf("swift", []));
  });

  it("急所は壁を貫く", () => {
    const crit = { forceCritical: true, forceRandom: 100 } as const;
    const walled = calcDamage(gameData, attacker(), defender(), gameData.move("tackle"), rng(), {
      ...crit, screens: ["reflect"],
    }).damage;
    const bare = calcDamage(gameData, attacker(), defender(), gameData.move("tackle"), rng(), crit)
      .damage;
    expect(walled).toBe(bare);
  });

  it("壁は受ける側のものを見る（張った側だけが軽減される）", () => {
    // 同じ種・同じレベル・同じ技で殴り合い、side 0 だけがリフレクターを張る
    let state = createBattle(
      gameData,
      [[mon("rattata", ["reflect", "tackle"])], [mon("rattata", ["tackle"])]],
      // 種 2 を選んである ―― 種 1 はこの盤面で急所が出て、壁を貫いてしまう
      2,
    );
    state = step(gameData, state, [MOVE_0, MOVE_0]).state;
    const { events } = step(gameData, state, [MOVE_1, MOVE_0]);
    const hits = events.filter((e) => e.kind === "damage");
    // **急所は壁を貫く**ので、急所が出た回は比べられない。
    // 出たらこのテストは黙って通らず、ここで落ちる
    expect(hits.every((e) => e.kind === "damage" && !e.critical)).toBe(true);
    const taken = (side: 0 | 1) =>
      hits.filter((e) => e.side === side)
        .reduce((sum, e) => sum + (e.kind === "damage" ? e.amount : 0), 0);
    expect(taken(0) * 2).toBeLessThanOrEqual(taken(1) + 2);
  });
});

describe("しんぴのまもり", () => {
  // でんじは は必中・確率100%。**抽選に頼らないので、防げなければ必ず落ちる**
  // 相手は素早さの低い ヤドン ―― 速いと、壁を張る前のターンに麻痺させてしまう
  const zap = () => mon("slowpoke", ["thunder-wave"]);

  it("状態異常を防ぎ、防いだことを言う", () => {
    let state = createBattle(gameData, [[mon("rattata", ["safeguard", "growl"])], [zap()]], 1);
    state = step(gameData, state, [MOVE_0, MOVE_0]).state;
    const { state: next, events } = step(gameData, state, [MOVE_1, MOVE_0]);
    expect(next.sides[0].party[0]!.status).toBeNull();
    expect(events).toContainEqual({ kind: "screenBlocked", side: 0, screen: "safeguard" });
  });

  it("張っていない側は状態異常になる", () => {
    const state = createBattle(gameData, [[mon("rattata", ["growl"])], [zap()]], 1);
    const { state: next } = step(gameData, state, [MOVE_0, MOVE_0]);
    expect(next.sides[0].party[0]!.status).toBe("paralysis");
  });

  it("切れたあとは防がない", () => {
    let state = createBattle(gameData, [[mon("rattata", ["safeguard", "growl"])], [zap()]], 1);
    state = step(gameData, state, [MOVE_0, MOVE_0]).state;
    for (let i = 0; i < 5; i++) state = step(gameData, state, [MOVE_1, MOVE_0]).state;
    expect(state.sides[0].screens.safeguard).toBeUndefined();
    expect(state.sides[0].party[0]!.status).toBe("paralysis");
  });
});
