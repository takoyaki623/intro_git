/**
 * 天気（v1.2-c）。場に1つだけ・威力の倍率・ターン終了時の削り・残りターン。
 *
 * **威力の倍率と削りは、同じ天気の別の面**（にほんばれ は削らない・
 * すなあらし は威力を動かさない）。片方だけ見るテストにしない。
 */

import { describe, expect, it } from "vitest";
import {
  calcDamage,
  createBattle,
  createRng,
  createRngState,
  step,
  toBattlePokemon,
  weatherMultiplier,
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

/** 天気の技を1回撃つ。撃つのは side 0。 */
function makeWeather(move: string, foe = "rattata"): BattleState {
  // **2手目は なきごえ**（damage を与えない技）。
  // たいあたり で回すと、天気の残りターンを数え切る前に相手が倒れる
  const state = createBattle(gameData, [[mon("pikachu", [move, "growl"])], [mon(foe, ["growl"])]], 1);
  return step(gameData, state, [MOVE_0, MOVE_0]).state;
}

describe("天気の倍率", () => {
  it("にほんばれ は ほのお を1.5倍・みず を半分", () => {
    expect(weatherMultiplier("sun", "fire")).toBe(1.5);
    expect(weatherMultiplier("sun", "water")).toBe(0.5);
  });

  it("あまごい はその逆", () => {
    expect(weatherMultiplier("rain", "water")).toBe(1.5);
    expect(weatherMultiplier("rain", "fire")).toBe(0.5);
  });

  it("すなあらし と あられ は威力を変えない", () => {
    for (const type of ["fire", "water", "rock", "ice"] as const) {
      expect(weatherMultiplier("sandstorm", type)).toBe(1);
      expect(weatherMultiplier("hail", type)).toBe(1);
    }
  });

  it("関係の無いタイプは1倍", () => {
    expect(weatherMultiplier("sun", "normal")).toBe(1);
    expect(weatherMultiplier(null, "fire")).toBe(1);
  });

  it("calcDamage が天気を掛ける", () => {
    const attacker = battler("charmander", ["ember"]);
    const defender = battler("rattata");
    const move = gameData.move("ember");
    const fixed = { forceCritical: false, forceRandom: 100 } as const;
    const plain = calcDamage(gameData, attacker, defender, move, rng(), fixed).damage;
    const sunny = calcDamage(gameData, attacker, defender, move, rng(), { ...fixed, weather: "sun" }).damage;
    const rainy = calcDamage(gameData, attacker, defender, move, rng(), { ...fixed, weather: "rain" }).damage;
    expect(sunny).toBeGreaterThan(plain);
    expect(rainy).toBeLessThan(plain);
  });
});

describe("天気の技", () => {
  it("にほんばれ で場に天気が付く", () => {
    const state = makeWeather("sunny-day");
    expect(state.weather).toMatchObject({ kind: "sun", turns: 4 });
  });

  it("4つとも場に付く", () => {
    const pairs = [
      ["sunny-day", "sun"], ["rain-dance", "rain"],
      ["sandstorm", "sandstorm"], ["hail", "hail"],
    ] as const;
    for (const [move, weather] of pairs) {
      expect(makeWeather(move).weather?.kind).toBe(weather);
    }
  });

  it("同じ天気を重ねて撃つと失敗する", () => {
    const state = makeWeather("sunny-day");
    const before = state.weather!.turns;
    const { state: next, events } = step(gameData, state, [MOVE_0, MOVE_0]);
    // 残りターンは伸びず、ターン終了時にさらに1減る
    expect(next.weather!.turns).toBe(before - 1);
    expect(events.some((e) => e.kind === "weatherStart")).toBe(false);
    expect(events.some((e) => e.kind === "failed")).toBe(true);
  });
});

describe("ターン終了時の削り", () => {
  it("すなあらし は最大HPの1/16を削る", () => {
    const state = makeWeather("sandstorm");
    for (const side of [0, 1] as const) {
      const p = state.sides[side].party[0]!;
      expect(p.maxHp - p.currentHp).toBe(Math.max(1, Math.floor(p.maxHp / 16)));
    }
  });

  it("いわ・じめん・はがね は すなあらし で削れない", () => {
    // ゴローン（いわ／じめん）を相手に置く。素早さが低いので tackle は届く
    const state = makeWeather("sandstorm", "geodude");
    const foe = state.sides[1].party[0]!;
    expect(foe.currentHp).toBe(foe.maxHp);
    const { events } = step(gameData, state, [MOVE_1, MOVE_0]);
    const chips = events.filter((e) => e.kind === "weatherDamage");
    expect(chips.every((e) => e.side === 0)).toBe(true);
    expect(foe.types).toContain("rock");
  });

  it("こおり は あられ で削れない", () => {
    const state = makeWeather("hail", "lapras"); // みず／こおり
    const { events } = step(gameData, state, [MOVE_1, MOVE_0]);
    const chips = events.filter((e) => e.kind === "weatherDamage");
    expect(chips.every((e) => e.side === 0)).toBe(true);
  });

  it("にほんばれ・あまごい は削らない", () => {
    for (const move of ["sunny-day", "rain-dance"]) {
      const state = makeWeather(move);
      const { events } = step(gameData, state, [MOVE_1, MOVE_0]);
      expect(events.some((e) => e.kind === "weatherDamage")).toBe(false);
    }
  });
});

describe("残りターン", () => {
  it("5ターンで終わり、終わったターンにも削る", () => {
    let state = makeWeather("sandstorm");
    let chipTurns = 1; // 撃ったターンの終了時にすでに1回削れている
    let ended = false;
    for (let i = 0; i < 6 && !ended; i++) {
      const result = step(gameData, state, [MOVE_1, MOVE_0]);
      state = result.state;
      if (result.events.some((e) => e.kind === "weatherDamage")) chipTurns += 1;
      if (result.events.some((e) => e.kind === "weatherEnd")) ended = true;
    }
    expect(ended).toBe(true);
    expect(state.weather).toBeNull();
    expect(chipTurns).toBe(5);
  });
});
