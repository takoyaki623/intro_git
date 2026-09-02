import { describe, expect, it } from "vitest";
import { TYPES, assertCompleteTypeChart, effectivenessAgainst } from "@pkmn/core";
import { gameData } from "@pkmn/data";

describe("タイプ相性", () => {
  it("18×18 が欠けなく埋まっている", () => {
    expect(TYPES).toHaveLength(18);
    expect(() => assertCompleteTypeChart(gameData.typeChart)).not.toThrow();
  });

  it("単タイプの相性", () => {
    const e = (a: (typeof TYPES)[number], d: (typeof TYPES)[number]) =>
      effectivenessAgainst(gameData.typeChart, a, [d]);
    expect(e("fire", "grass")).toBe(2);
    expect(e("water", "fire")).toBe(2);
    expect(e("electric", "ground")).toBe(0);
    expect(e("normal", "ghost")).toBe(0);
    expect(e("dragon", "fairy")).toBe(0);
  });

  it("第6世代の変更が反映されている（はがねのゴースト/あく耐性は無い）", () => {
    expect(effectivenessAgainst(gameData.typeChart, "ghost", ["steel"])).toBe(1);
    expect(effectivenessAgainst(gameData.typeChart, "dark", ["steel"])).toBe(1);
  });

  it("複合タイプは掛け合わせる", () => {
    // イシツブテ: いわ/じめん
    expect(effectivenessAgainst(gameData.typeChart, "water", ["rock", "ground"])).toBe(4);
    expect(effectivenessAgainst(gameData.typeChart, "electric", ["rock", "ground"])).toBe(0);
    // フシギダネ: くさ/どく
    expect(effectivenessAgainst(gameData.typeChart, "fire", ["grass", "poison"])).toBe(2);
    expect(effectivenessAgainst(gameData.typeChart, "grass", ["grass", "poison"])).toBe(0.25);
  });
});
