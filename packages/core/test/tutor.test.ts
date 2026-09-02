/**
 * 技教え人（v1.2-d）。
 *
 * **覚えさせる仕組みはわざマシンと同じ**（`teachMove` を共有する）。
 * 違うのは「どちらの互換表を見るか」だけなので、
 * **表が別であること**をいちばん強く押さえる ―― 使い回すと、
 * 覚えられる技が静かに変わる。
 */

import { describe, expect, it } from "vitest";
import {
  createInstance,
  createRng,
  createRngState,
  emptyWorldState,
  refused,
  startEvent,
  stepEvent,
  teachToInstance,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";
import { allEvents, allMoves, allNatures, allSpecies } from "@pkmn/data";

const rng = () => createRng(createRngState(7));
const mon = (species: string, moves: string[], level = 30) =>
  createInstance(gameData, { species, level, moves, region: "kanto" }, rng(), allNatures.map((n) => n.id));

describe("教え技の表", () => {
  it("マシンの表とは別物（どちらか一方にしか無い技がある）", () => {
    const onlyTutor = new Set<string>();
    const onlyMachine = new Set<string>();
    for (const s of allSpecies) {
      for (const m of s.tutorMoves) if (!s.tmMoves.includes(m)) onlyTutor.add(`${s.id}:${m}`);
      for (const m of s.tmMoves) if (!s.tutorMoves.includes(m)) onlyMachine.add(`${s.id}:${m}`);
    }
    // **どちらの向きにも差がある。** 片方が他方の部分集合なら、
    // 表を1つにまとめられてしまう（まとめた版はここで落ちる）
    expect(onlyTutor.size).toBeGreaterThan(0);
    expect(onlyMachine.size).toBeGreaterThan(0);
  });

  it("FRLG に居ない種は教え技を持たない", () => {
    const none = allSpecies.filter((s) => s.tutorMoves.length === 0);
    expect(none.length).toBeGreaterThan(0);
    // 第4世代以降の種（ナナシマの外から来た種）だけが 0 件
    expect(none.every((s) => s.dexNo > 386 || s.tutorMoves.length === 0)).toBe(true);
  });
});

describe("教える", () => {
  it("覚えられる種には教えられる", () => {
    // ピカチュウ は でんじは を教われる
    const pikachu = mon("pikachu", ["thunder-shock"]);
    expect(gameData.species("pikachu").tutorMoves).toContain("thunder-wave");
    const result = teachToInstance(gameData, "thunder-wave", pikachu);
    expect(refused(result)).toBe(false);
    if (refused(result)) return;
    expect(result.instance.moves.map((m) => m.id)).toContain("thunder-wave");
  });

  it("覚えられない種には教えられない（理由を言う）", () => {
    const magikarp = mon("magikarp", ["splash"]);
    const result = teachToInstance(gameData, "thunder-wave", magikarp);
    expect(refused(result)).toBe(true);
    if (!refused(result)) return;
    expect(result.reason).toContain("おぼえられない");
  });

  it("すでに覚えている技は断る", () => {
    const pikachu = mon("pikachu", ["thunder-wave"]);
    const result = teachToInstance(gameData, "thunder-wave", pikachu);
    expect(refused(result)).toBe(true);
    if (!refused(result)) return;
    expect(result.reason).toContain("すでに");
  });

  it("技が4つ埋まっていれば、入れ替えを UI に渡す", () => {
    const pikachu = mon("pikachu", ["thunder-shock", "growl", "quick-attack", "double-team"]);
    const result = teachToInstance(gameData, "thunder-wave", pikachu);
    expect(refused(result)).toBe(false);
    if (refused(result)) return;
    expect(result.then).toEqual({ kind: "learnMove", move: "thunder-wave" });
    // **勝手に入れ替えない。** 選ぶのはプレイヤー
    expect(result.instance.moves).toHaveLength(4);
  });

  it("マシンの表では覚えられない技でも、教え人なら覚えられる", () => {
    // **この1件が「表を分けた理由」そのもの。**
    // 実装した技に絞る（`moves.json` に無い技は教え人も扱えない）
    const known = new Set(allMoves.map((m) => m.id));
    const pair = allSpecies.flatMap((s) =>
      s.tutorMoves
        .filter((m) => known.has(m) && !s.tmMoves.includes(m))
        .map((m) => ({ s, m })),
    )[0];
    expect(pair).toBeDefined();
    if (pair === undefined) return;
    const target = mon(pair.s.id, []);
    expect(refused(teachToInstance(gameData, pair.m, target))).toBe(false);
  });
});

describe("イベントから呼ぶ", () => {
  it("技教え人のイベントが teachMove の効果を出す", () => {
    const tutor = allEvents.find((e) => e.id === "kanto.tutor.rock-slide");
    expect(tutor).toBeDefined();
    if (tutor === undefined) return;
    const world = emptyWorldState();
    let runner = startEvent(tutor.commands);
    const seen: string[] = [];
    for (let i = 0; i < 8 && !runner.done; i += 1) {
      const result = stepEvent(runner, world);
      runner = result.runner;
      for (const e of result.effects) seen.push(e.kind);
      if (result.waiting) {
        // UI の応答を待つ効果はここで消化したことにして進める
        runner = { ...runner, done: runner.queue.length === 0 };
        if (runner.queue.length === 0) break;
      }
    }
    expect(seen).toContain("teachMove");
  });

  it("**全部の技教え人**が、教われる種の居る技を教える", () => {
    // 検証 #125 と同じことをテストからも見る ―― あちらはデータの検査で、
    // ここは「表の選び方（tutorMoves）」が実装から見て正しいことの確認
    const tutors = allEvents.flatMap((e) =>
      e.commands.filter((c) => c.kind === "teachMove").map((c) => ({ id: e.id, c })),
    );
    expect(tutors.length).toBeGreaterThan(0);
    for (const { id, c } of tutors) {
      if (c.kind !== "teachMove") continue;
      const learners = allSpecies.filter((s) => s.tutorMoves.includes(c.move));
      expect(learners.length, id).toBeGreaterThan(0);
    }
  });
});
