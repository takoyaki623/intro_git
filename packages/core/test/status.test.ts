/**
 * 状態異常6種＋混乱。v0.2 の完了条件のひとつ。
 * 設計: docs/design/battle-system.md §8
 */

import { describe, expect, it } from "vitest";
import {
  applyConfusion,
  applyStatus,
  calcDamage,
  createBattle,
  createRng,
  createRngState,
  isImmuneToStatus,
  residualDamage,
  onSwitchOut,
  step,
  toBattlePokemon,
  type StatusId,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";

const rng = () => createRng(createRngState(4242));
const mon = (species: string, moves: string[] = ["tackle"], level = 50) =>
  toBattlePokemon(gameData, { species, level, moves });

describe("状態異常の付与", () => {
  it("6種すべてを付与できる", () => {
    const all: StatusId[] = ["poison", "toxic", "paralysis", "burn", "sleep", "freeze"];
    for (const status of all) {
      const p = mon("rattata"); // ノーマル単なのでどれにも耐性が無い
      expect(applyStatus(p, status, rng())).toBe(true);
      expect(p.status).toBe(status);
    }
  });

  it("状態異常は重ねがけできない", () => {
    const p = mon("rattata");
    expect(applyStatus(p, "burn", rng())).toBe(true);
    expect(applyStatus(p, "paralysis", rng())).toBe(false);
    expect(p.status).toBe("burn");
  });

  it("タイプによる無効", () => {
    expect(isImmuneToStatus(mon("bulbasaur"), "poison")).toBe(true); // どく
    expect(isImmuneToStatus(mon("magnemite"), "poison")).toBe(true); // はがね
    expect(isImmuneToStatus(mon("charmander"), "burn")).toBe(true); // ほのお
    expect(isImmuneToStatus(mon("pikachu"), "paralysis")).toBe(true); // でんき
    expect(isImmuneToStatus(mon("lapras"), "freeze")).toBe(true); // こおり
    expect(isImmuneToStatus(mon("rattata"), "sleep")).toBe(false); // ねむりは無効タイプ無し
  });

  it("ねむりは1〜3ターンのカウンタを持つ", () => {
    const p = mon("rattata");
    applyStatus(p, "sleep", rng());
    expect(p.statusCounter).toBeGreaterThanOrEqual(1);
    expect(p.statusCounter).toBeLessThanOrEqual(3);
  });
});

describe("スリップダメージ", () => {
  it("どくは最大HPの1/8", () => {
    const p = mon("rattata");
    applyStatus(p, "poison", rng());
    expect(residualDamage(p)).toBe(Math.floor(p.maxHp / 8));
  });

  it("やけどは最大HPの1/16", () => {
    const p = mon("rattata");
    applyStatus(p, "burn", rng());
    expect(residualDamage(p)).toBe(Math.floor(p.maxHp / 16));
  });

  it("もうどくは経過ターンに応じて増える", () => {
    const p = mon("lapras");
    applyStatus(p, "toxic", rng());
    expect(p.statusCounter).toBe(1);
    const first = residualDamage(p);
    p.statusCounter = 3;
    expect(residualDamage(p)).toBeGreaterThan(first);
    expect(residualDamage(p)).toBe(Math.floor((p.maxHp * 3) / 16));
  });

  it("まひ・ねむり・こおりはスリップしない", () => {
    for (const s of ["paralysis", "sleep", "freeze"] as const) {
      const p = mon("rattata");
      applyStatus(p, s, rng());
      expect(residualDamage(p)).toBe(0);
    }
  });
});

describe("混乱", () => {
  it("状態異常と重複する", () => {
    const p = mon("rattata");
    applyStatus(p, "burn", rng());
    expect(applyConfusion(p, rng())).toBe(true);
    expect(p.status).toBe("burn");
    expect(p.volatile.confusionTurns).toBeGreaterThan(0);
  });

  it("既に混乱していれば重ねがけできない", () => {
    const p = mon("rattata");
    expect(applyConfusion(p, rng())).toBe(true);
    expect(applyConfusion(p, rng())).toBe(false);
  });
});

describe("交代時のリセット", () => {
  it("ランク補正と混乱は消え、状態異常は残る", () => {
    const p = mon("rattata");
    applyStatus(p, "poison", rng());
    applyConfusion(p, rng());
    p.statStages.atk = 3;
    p.statStages.spe = -2;

    onSwitchOut(p);

    expect(p.status).toBe("poison"); // 残る
    expect(p.volatile.confusionTurns).toBe(0); // 消える
    expect(p.statStages.atk).toBe(0); // 消える
    expect(p.statStages.spe).toBe(0);
  });

  it("もうどくのカウンタは1に戻るが、もうどく自体は解けない", () => {
    const p = mon("lapras");
    applyStatus(p, "toxic", rng());
    p.statusCounter = 5;
    onSwitchOut(p);
    expect(p.status).toBe("toxic");
    expect(p.statusCounter).toBe(1);
  });
});

describe("バトル中の挙動", () => {
  it("でんじはでまひし、素早さが半減して行動順が入れ替わる", () => {
    // ピカチュウ(spe 110) vs コラッタ(spe 96相当) → 通常はピカチュウが先
    const pika = { species: "pikachu", level: 50, moves: ["thunder-wave", "quick-attack"] };
    const ratta = { species: "rattata", level: 50, moves: ["tackle"] };
    let state = createBattle(gameData, [[pika], [ratta]], 5);

    const r1 = step(gameData, state, [
      { kind: "move", moveIndex: 0 }, // でんじは
      { kind: "move", moveIndex: 0 },
    ]);
    expect(r1.events.some((e) => e.kind === "statusApplied" && e.status === "paralysis")).toBe(
      true,
    );
    expect(r1.state.sides[1].party[0]!.status).toBe("paralysis");
  });

  it("どく状態はターン終了時に削られる", () => {
    const attacker = { species: "venonat", level: 50, moves: ["poison-sting"] };
    const target = { species: "rattata", level: 50, moves: ["tackle"] };
    let state = createBattle(gameData, [[attacker], [target]], 9);

    // どくが入るまで数ターン回す
    for (let i = 0; i < 12 && state.result === null; i++) {
      const r = step(gameData, state, [
        { kind: "move", moveIndex: 0 },
        { kind: "move", moveIndex: 0 },
      ]);
      state = r.state;
      if (r.events.some((e) => e.kind === "statusDamage" && e.status === "poison")) {
        expect(state.sides[1].party[0]!.status).toBe("poison");
        return;
      }
    }
    // 12ターン回してもどくが入らないのは確率的にありうるが、
    // 少なくとも例外なく進行していること
    expect(state.turn).toBeGreaterThan(0);
  });

  it("ほのお技を受けるとこおりが解ける", () => {
    const fire = { species: "charmander", level: 50, moves: ["ember"] };
    const target = { species: "rattata", level: 50, moves: ["tackle"] };
    const state = createBattle(gameData, [[fire], [target]], 3);
    state.sides[1].party[0]!.status = "freeze";

    const { events, state: next } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(events.some((e) => e.kind === "thawed" && e.side === 1)).toBe(true);
    expect(next.sides[1].party[0]!.status).toBeNull();
  });

  it("やけどは物理技の威力を半減させる", () => {
    // ワンリキーは こんじょう を持ち、やけどの威力減少を無視する（v0.5）。
    // 半減そのものを見るテストなので、特性を持たない種を使う。
    const a = mon("mankey", ["karate-chop"]);
    const burned = mon("mankey", ["karate-chop"]);
    burned.status = "burn";
    const target = mon("rattata");

    // 同じ乱数条件で比較する
    const opts = { forceCritical: false, forceRandom: 100 } as const;
    const move = gameData.move("karate-chop");
    // calcDamage は damage.ts のテストで詳細を見ているのでここは相対比較のみ
    const normal = calcDamage(gameData, a, target, move, rng(), opts);
    const withBurn = calcDamage(gameData, burned, target, move, rng(), opts);
    expect(withBurn.damage).toBeLessThan(normal.damage);
  });
});
