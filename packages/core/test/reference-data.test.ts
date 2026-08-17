/**
 * 実データの正しさを固定する基準テスト。
 *
 * v0.4 で tools/ による一括投入に切り替えるとき、
 * 変換結果がここで固定した値と一致することを確かめる基準になる。
 * 手書きデータ → 自動投入 の移行で数値が壊れていないことを保証する。
 */

import { describe, expect, it } from "vitest";
import { calcDamage, createRng, createRngState, toBattlePokemon } from "@pkmn/core";
import { allMoves, allSpecies, gameData } from "@pkmn/data";

describe("種族値が原作と一致する", () => {
  const EXPECTED: Record<string, [number, number, number, number, number, number]> = {
    // HP, こうげき, ぼうぎょ, とくこう, とくぼう, すばやさ
    bulbasaur: [45, 49, 49, 65, 65, 45],
    charmander: [39, 52, 43, 60, 50, 65],
    squirtle: [44, 48, 65, 50, 64, 43],
    pikachu: [35, 55, 40, 50, 50, 90],
    geodude: [40, 80, 100, 30, 30, 20],
    onix: [35, 45, 160, 30, 45, 70],
    gastly: [30, 35, 30, 100, 35, 80],
    lapras: [130, 85, 80, 85, 95, 60],
    abra: [25, 20, 15, 105, 55, 90],
    machop: [70, 80, 50, 35, 35, 35],
    magnemite: [25, 35, 70, 95, 55, 45],
    clefairy: [70, 45, 48, 60, 65, 35],
  };

  for (const [id, [hp, atk, def, spa, spd, spe]] of Object.entries(EXPECTED)) {
    it(id, () => {
      expect(gameData.species(id).baseStats).toEqual({ hp, atk, def, spa, spd, spe });
    });
  }
});

describe("技の威力・命中・PP が原作と一致する", () => {
  const EXPECTED: Record<string, { power: number | null; accuracy: number | null; pp: number }> = {
    tackle: { power: 40, accuracy: 100, pp: 35 },
    "quick-attack": { power: 40, accuracy: 100, pp: 30 },
    "take-down": { power: 90, accuracy: 85, pp: 20 },
    "body-slam": { power: 85, accuracy: 100, pp: 15 },
    flamethrower: { power: 90, accuracy: 100, pp: 15 },
    thunderbolt: { power: 90, accuracy: 100, pp: 15 },
    "ice-beam": { power: 90, accuracy: 100, pp: 10 },
    surf: { power: 90, accuracy: 100, pp: 15 },
    "razor-leaf": { power: 55, accuracy: 95, pp: 25 },
    "rock-throw": { power: 50, accuracy: 90, pp: 15 },
    absorb: { power: 20, accuracy: 100, pp: 25 },
    "sleep-powder": { power: null, accuracy: 75, pp: 15 },
    "thunder-wave": { power: null, accuracy: 90, pp: 20 },
    toxic: { power: null, accuracy: 90, pp: 10 },
    "will-o-wisp": { power: null, accuracy: 85, pp: 15 },
    // 第9世代で 10 → 5 に変更された（実装時に見落としていた）
    recover: { power: null, accuracy: null, pp: 5 },
  };

  for (const [id, expected] of Object.entries(EXPECTED)) {
    it(id, () => {
      const move = gameData.move(id);
      expect({ power: move.power, accuracy: move.accuracy, pp: move.pp }).toEqual(expected);
    });
  }
});

describe("ダメージ計算が手計算と一致する", () => {
  /**
   * Lv50・個体値31・努力値0・性格無補正で手計算した値。
   * 式: floor(floor(floor(2*Lv/5+2) * 威力 * A / D) / 50) + 2 → 乱数 → タイプ一致 → 相性
   */
  it("ピカチュウの10まんボルト → ラプラス", () => {
    const a = toBattlePokemon(gameData, { species: "pikachu", level: 50, moves: ["thunderbolt"] });
    const d = toBattlePokemon(gameData, { species: "lapras", level: 50, moves: ["surf"] });

    // とくこう70 / とくぼう115 を前提に手計算した値
    expect(a.stats.spa).toBe(70);
    expect(d.stats.spd).toBe(115);
    expect(d.maxHp).toBe(205);

    const opts = { forceCritical: false } as const;
    const move = gameData.move("thunderbolt");
    const max = calcDamage(gameData, a, d, move, createRng(createRngState(1)), {
      ...opts, forceRandom: 100,
    });
    const min = calcDamage(gameData, a, d, move, createRng(createRngState(1)), {
      ...opts, forceRandom: 85,
    });

    // 基礎26 → 乱数 → タイプ一致1.5 → でんき対みず2倍
    expect(max.damage).toBe(78); // floor(26*1.5)=39 → 39*2
    expect(min.damage).toBe(66); // floor(26*0.85)=22 → floor(33) → 33*2
    expect(max.effectiveness).toBe(2);
  });

  it("急所は1.5倍になる", () => {
    const a = toBattlePokemon(gameData, { species: "pikachu", level: 50, moves: ["thunderbolt"] });
    const d = toBattlePokemon(gameData, { species: "lapras", level: 50, moves: ["surf"] });
    const move = gameData.move("thunderbolt");
    const crit = calcDamage(gameData, a, d, move, createRng(createRngState(1)), {
      forceCritical: true, forceRandom: 100,
    });
    // 基礎26 → 急所 floor(39) → 乱数100 → 一致 floor(58.5)=58 → x2 = 116
    expect(crit.damage).toBe(116);
  });
});

describe("データの網羅性", () => {
  it("全種族に必須フィールドが揃っている", () => {
    for (const s of allSpecies) {
      expect(s.types.length, s.id).toBeGreaterThanOrEqual(1);
      expect(s.learnset.length, s.id).toBeGreaterThan(0);
      expect(s.catchRate, s.id).toBeGreaterThan(0);
      expect(s.abilities.length, s.id).toBeGreaterThan(0);
      expect(Object.keys(s.evYield).length, s.id).toBeGreaterThan(0);
    }
  });

  it("learnset が参照する技が全て存在する", () => {
    for (const s of allSpecies) {
      for (const l of s.learnset) {
        expect(() => gameData.move(l.move), `${s.id} → ${l.move}`).not.toThrow();
      }
    }
  });

  it("変化技は威力を持たず、攻撃技は必ず威力を持つ", () => {
    for (const m of allMoves) {
      if (m.category === "status") expect(m.power, m.id).toBeNull();
      else expect(m.power, m.id).toBeGreaterThan(0);
    }
  });
});
