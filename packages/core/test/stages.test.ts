/**
 * 能力ランク補正。v0.2 の完了条件のひとつ。
 * 設計: docs/design/battle-system.md §6
 */

import { describe, expect, it } from "vitest";
import {
  accuracyStageMultiplier,
  applyStageChange,
  battleStageMultiplier,
  createBattle,
  effectiveStat,
  step,
  toBattlePokemon,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";

const mon = (species: string, moves: string[] = ["tackle"]) =>
  toBattlePokemon(gameData, { species, level: 50, moves });

describe("ランク補正の倍率表", () => {
  it("攻撃系: 設計 §6 の表と一致する", () => {
    expect(battleStageMultiplier(0)).toBe(1);
    expect(battleStageMultiplier(1)).toBeCloseTo(1.5);
    expect(battleStageMultiplier(2)).toBeCloseTo(2.0);
    expect(battleStageMultiplier(6)).toBeCloseTo(4.0);
    expect(battleStageMultiplier(-1)).toBeCloseTo(0.667, 2);
    expect(battleStageMultiplier(-2)).toBeCloseTo(0.5);
    expect(battleStageMultiplier(-6)).toBeCloseTo(0.25);
  });

  it("命中/回避: 別の表を使う", () => {
    expect(accuracyStageMultiplier(0)).toBe(1);
    expect(accuracyStageMultiplier(1)).toBeCloseTo(1.333, 2);
    expect(accuracyStageMultiplier(2)).toBeCloseTo(1.667, 2);
    expect(accuracyStageMultiplier(6)).toBeCloseTo(3.0);
    expect(accuracyStageMultiplier(-1)).toBeCloseTo(0.75);
    expect(accuracyStageMultiplier(-2)).toBeCloseTo(0.6);
    expect(accuracyStageMultiplier(-6)).toBeCloseTo(0.333, 2);
  });

  it("-6 〜 +6 でクランプされる", () => {
    const p = mon("machop");
    applyStageChange(p, "atk", 10);
    expect(p.statStages.atk).toBe(6);
    applyStageChange(p, "atk", -100);
    expect(p.statStages.atk).toBe(-6);
  });

  it("これ以上動かないときは applied が 0 になる", () => {
    const p = mon("machop");
    applyStageChange(p, "atk", 6);
    const { applied } = applyStageChange(p, "atk", 2);
    expect(applied).toBe(0);
  });
});

describe("実効値への反映", () => {
  it("+2 で攻撃が2倍になる", () => {
    const p = mon("machop");
    const base = effectiveStat(p, "atk");
    applyStageChange(p, "atk", 2);
    expect(effectiveStat(p, "atk")).toBe(Math.floor(base * 2));
  });

  it("急所は相手の防御上昇と自分の攻撃下降を無視する", () => {
    const p = mon("machop");
    applyStageChange(p, "def", 2);
    expect(effectiveStat(p, "def", { ignoreBoost: true })).toBe(p.stats.def);

    applyStageChange(p, "atk", -2);
    expect(effectiveStat(p, "atk", { ignoreDrop: true })).toBe(p.stats.atk);
  });
});

describe("バトル中の変化技", () => {
  it("つるぎのまいで攻撃が+2される", () => {
    const machop = { species: "machop", level: 50, moves: ["swords-dance", "karate-chop"] };
    const target = { species: "rattata", level: 50, moves: ["tackle"] };
    const state = createBattle(gameData, [[machop], [target]], 2);

    const { events, state: next } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    const change = events.find((e) => e.kind === "statChange" && e.side === 0);
    expect(change).toMatchObject({ stat: "atk", delta: 2, stage: 2 });
    expect(next.sides[0].party[0]!.statStages.atk).toBe(2);
  });

  it("なきごえで相手の攻撃が-1される", () => {
    const clef = { species: "clefairy", level: 50, moves: ["growl", "tackle"] };
    const target = { species: "rattata", level: 50, moves: ["tackle"] };
    const state = createBattle(gameData, [[clef], [target]], 2);

    const { state: next } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(next.sides[1].party[0]!.statStages.atk).toBe(-1);
  });

  it("下限に達した変化技は failed になる", () => {
    const clef = { species: "clefairy", level: 50, moves: ["growl"] };
    const target = { species: "rattata", level: 50, moves: ["tackle"] };
    const state = createBattle(gameData, [[clef], [target]], 2);
    state.sides[1].party[0]!.statStages.atk = -6;

    const { events } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(events.some((e) => e.kind === "statChangeFailed")).toBe(true);
    expect(events.some((e) => e.kind === "failed" && e.side === 0)).toBe(true);
  });

  it("じこさいせいで回復する（満タンなら失敗）", () => {
    const clef = { species: "clefairy", level: 50, moves: ["recover"] };
    // ピッピ(spe 59) より遅く、ダメージを与えない相手にする。
    // そうしないと先に殴られて「満タン」の条件が崩れる。
    const target = { species: "geodude", level: 50, moves: ["sand-attack"] };
    const state = createBattle(gameData, [[clef], [target]], 2);

    // 満タンでは失敗する
    const full = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(full.events.some((e) => e.kind === "failed" && e.side === 0)).toBe(true);

    // 削れていれば回復する
    const hurt = structuredClone(state);
    hurt.sides[0].party[0]!.currentHp = 20;
    const healed = step(gameData, hurt, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(healed.events.some((e) => e.kind === "heal" && e.side === 0)).toBe(true);
  });
});
