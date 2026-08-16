import { describe, expect, it } from "vitest";
import { calcDamage, createRng, createRngState, toBattlePokemon } from "@pkmn/core";
import { gameData } from "@pkmn/data";

const rng = () => createRng(createRngState(12345));

const mon = (species: string, level = 50) =>
  toBattlePokemon(gameData, { species, level, moves: ["tackle"] });

describe("ダメージ計算", () => {
  it("乱数と急所を固定すれば決定的", () => {
    const a = mon("charmander");
    const d = mon("bulbasaur");
    const move = gameData.move("ember");
    const opts = { forceCritical: false, forceRandom: 100 } as const;

    const r1 = calcDamage(gameData, a, d, move, rng(), opts);
    const r2 = calcDamage(gameData, a, d, move, rng(), opts);
    expect(r1).toEqual(r2);
    expect(r1.damage).toBeGreaterThan(0);
  });

  it("タイプ一致1.5倍と相性2倍が効く", () => {
    const charmander = mon("charmander"); // ほのお
    const pikachu = mon("pikachu"); // でんき（ほのお技は等倍）
    const bulbasaur = mon("bulbasaur"); // くさ/どく（ほのお技は2倍）
    const ember = gameData.move("ember");
    const opts = { forceCritical: false, forceRandom: 100 } as const;

    const neutral = calcDamage(gameData, charmander, pikachu, ember, rng(), opts);
    const superEffective = calcDamage(gameData, charmander, bulbasaur, ember, rng(), opts);

    expect(neutral.effectiveness).toBe(1);
    expect(superEffective.effectiveness).toBe(2);
    // 防御側の耐久が違うため厳密な倍数にはならないが、必ず大きくなる
    expect(superEffective.damage).toBeGreaterThan(neutral.damage);
  });

  it("相性0倍はダメージ0で返る", () => {
    const pikachu = mon("pikachu");
    const geodude = mon("geodude"); // いわ/じめん
    const r = calcDamage(gameData, pikachu, geodude, gameData.move("thunder-shock"), rng(), {
      forceCritical: false,
      forceRandom: 100,
    });
    expect(r.effectiveness).toBe(0);
    expect(r.damage).toBe(0);
  });

  it("急所は1.5倍", () => {
    const a = mon("charmander");
    const d = mon("pikachu");
    const move = gameData.move("ember");
    const normal = calcDamage(gameData, a, d, move, rng(), {
      forceCritical: false, forceRandom: 100,
    });
    const crit = calcDamage(gameData, a, d, move, rng(), {
      forceCritical: true, forceRandom: 100,
    });
    expect(crit.damage).toBeGreaterThan(normal.damage);
    expect(crit.critical).toBe(true);
  });

  it("乱数の下限85%は上限100%より低い", () => {
    const a = mon("charmander");
    const d = mon("pikachu");
    const move = gameData.move("ember");
    const min = calcDamage(gameData, a, d, move, rng(), { forceCritical: false, forceRandom: 85 });
    const max = calcDamage(gameData, a, d, move, rng(), { forceCritical: false, forceRandom: 100 });
    expect(min.damage).toBeLessThan(max.damage);
  });

  it("ダメージは最低1", () => {
    const weak = mon("pikachu", 1);
    const tanky = mon("geodude", 100);
    const r = calcDamage(gameData, weak, tanky, gameData.move("tackle"), rng(), {
      forceCritical: false, forceRandom: 85,
    });
    expect(r.damage).toBeGreaterThanOrEqual(1);
  });
});
