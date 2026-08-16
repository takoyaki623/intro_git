import { describe, expect, it } from "vitest";
import { calcHp, calcStat, toBattlePokemon } from "@pkmn/core";
import { gameData } from "@pkmn/data";

describe("実数値の計算", () => {
  it("HP の式（個体値31・努力値0・Lv50 のピカチュウ）", () => {
    // floor((2*35 + 31 + 0) * 50/100) + 50 + 10 = floor(50.5) + 60 = 110
    expect(calcHp(35, 31, 0, 50)).toBe(110);
  });

  it("その他の式（性格補正なし）", () => {
    // floor((2*90 + 31 + 0) * 50/100) + 5 = 105 + 5 = 110
    expect(calcStat(90, 31, 0, 50, 1)).toBe(110);
  });

  it("性格補正は切り捨てで効く", () => {
    expect(calcStat(90, 31, 0, 50, 1.1)).toBe(121);
    expect(calcStat(90, 31, 0, 50, 0.9)).toBe(99);
  });

  it("努力値は4につき1", () => {
    expect(calcStat(90, 31, 0, 100, 1)).toBe(216);
    expect(calcStat(90, 31, 4, 100, 1)).toBe(217);
  });

  it("toBattlePokemon が実数値を確定させる", () => {
    const p = toBattlePokemon(gameData, {
      species: "pikachu",
      level: 50,
      moves: ["thunder-shock", "quick-attack"],
    });
    expect(p.maxHp).toBe(110);
    expect(p.currentHp).toBe(110);
    expect(p.stats.spe).toBe(110);
    expect(p.moves).toHaveLength(2);
    expect(p.moves[0]).toMatchObject({ id: "thunder-shock", pp: 30, maxPp: 30 });
  });

  it("レベル同期（levelOverride）が効く", () => {
    const low = toBattlePokemon(gameData, {
      species: "pikachu", level: 5, moves: ["thunder-shock"],
    });
    const synced = toBattlePokemon(
      gameData,
      { species: "pikachu", level: 5, moves: ["thunder-shock"] },
      50,
    );
    expect(low.level).toBe(5);
    expect(synced.level).toBe(50);
    expect(synced.maxHp).toBeGreaterThan(low.maxHp);
  });
});
