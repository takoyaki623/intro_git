/**
 * PWT型トーナメントとネームドキャラ（v0.6）。
 *
 * ここで確かめたいのは個々のキャラではなく、
 * **キャラを1人足すと3ティアぶんのコンテンツが増える**構造が成立していること。
 * 設計: docs/design/named-characters.md / docs/design/endgame.md §7
 */

import { describe, expect, it } from "vitest";
import {
  aiFor,
  applyCupOutcome,
  assertCupUsable,
  assertNamedUsable,
  availableTiers,
  battleSetToSource,
  buildOpponentParty,
  chooseBasicAction,
  createBattle,
  createRng,
  createRngState,
  cupPlayerParty,
  currentOpponent,
  drawBracket,
  emptySave,
  nextTier,
  opponentParty,
  recordCupWin,
  rentalGradeFor,
  requiredSides,
  selectParty,
  startCupRun,
  step,
  toAiView,
  toBattlePokemon,
  type Action,
  type AiConfig,
  type PartySpec,
  type TierId,
  type Tournament,
} from "@pkmn/core";
import {
  allBattleSets,
  allNamed,
  allTournaments,
  gameData,
  namedById,
  tournamentById,
} from "@pkmn/data";

const cup = tournamentById("kanto-gym-leader-cup");

describe("ネームドキャラ", () => {
  it("全員のパーティがそのままバトルに投入できる", () => {
    for (const character of allNamed) {
      assertNamedUsable(gameData, character);
      for (const tier of Object.keys(character.tiers) as TierId[]) {
        for (const member of character.tiers[tier]!) {
          const mon = toBattlePokemon(gameData, member);
          expect(mon.moves.length).toBe(member.moves.length);
        }
      }
    }
  });

  it("エースは全ティアで不動（同じキャラだと認識できる最低条件）", () => {
    for (const character of allNamed) {
      for (const tier of Object.keys(character.tiers) as TierId[]) {
        expect(
          character.tiers[tier]!.some((m) => m.species === character.signature),
          `${character.id}/${tier}`,
        ).toBe(true);
      }
    }
  });

  it("theme が全員に書かれている（パーティより先に決めるもの）", () => {
    for (const character of allNamed) {
      expect(character.concept.theme.length, character.id).toBeGreaterThan(0);
    }
  });

  it("専門タイプを持たないのはチャンピオンだけ", () => {
    for (const character of allNamed) {
      if (character.concept.type === undefined) {
        expect(character.role, character.id).toBe("champion");
      }
    }
  });

  it("同じ戦術が3人以上に重複していない", () => {
    const count = new Map<string, number>();
    for (const c of allNamed) {
      if (c.concept.tactic === undefined) continue;
      count.set(c.concept.tactic, (count.get(c.concept.tactic) ?? 0) + 1);
    }
    for (const [tactic, n] of count) {
      expect(n, `戦術 ${tactic}`).toBeLessThan(3);
    }
  });

  it("3対3に絞ってもエースが落ちない", () => {
    // 原作のパーティは弱い順で、単純に先頭3体を取るとエースが落ちる
    const lance = namedById("lance");
    const picked = selectParty(lance, lance.tiers.original!, 3);
    expect(picked).toHaveLength(3);
    expect(picked.some((m) => m.species === "dragonite")).toBe(true);
    // 並びは原作どおり（弱い順・エースが最後）を保つ
    expect(picked[picked.length - 1]!.species).toBe("dragonite");
  });

  it("AI は設計の難易度表に沿う（smart は v1.1 なので policy は basic 固定）", () => {
    const brock = namedById("brock");
    const lance = namedById("lance");
    expect(aiFor(brock, "original").mistakeRate).toBeGreaterThan(
      aiFor(lance, "original").mistakeRate,
    );
    expect(aiFor(brock, "serious").mistakeRate).toBeLessThan(
      aiFor(brock, "original").mistakeRate,
    );
    expect(aiFor(lance, "serious").policy).toBe("basic");
  });
});

describe("カップ", () => {
  it("全カップが実際に山を組める", () => {
    for (const t of allTournaments) {
      assertCupUsable(t, allNamed);
      for (const tier of t.tierProgression) {
        const { bracket } = drawBracket(t, allNamed, tier, 1);
        expect(bracket).toHaveLength(t.rounds);
        expect(new Set(bracket).size).toBe(t.rounds);
      }
    }
  });

  it("出場者は毎回抽選される（決め打ちにしない）", () => {
    const a = drawBracket(cup, allNamed, "original", 1).bracket;
    const b = drawBracket(cup, allNamed, "original", 2).bracket;
    expect(a).not.toEqual(b);
  });

  it("同じシードなら同じ山（途中で再開しても変わらない）", () => {
    const a = drawBracket(cup, allNamed, "original", 42).bracket;
    const b = drawBracket(cup, allNamed, "original", 42).bracket;
    expect(a).toEqual(b);
  });

  it("出場者が足りないカップは黙って通さない", () => {
    const broken: Tournament = { ...cup, entrantPool: ["brock"], rounds: 3 };
    expect(() => drawBracket(broken, allNamed, "original", 1)).toThrow(/出場者/);
  });

  it("カップは出場者プールが違うだけ（ルールセットは共通）", () => {
    const gym = tournamentById("kanto-gym-leader-cup");
    const elite = tournamentById("kanto-elite-cup");
    expect(gym.ruleset).toEqual(elite.ruleset);
    expect(gym.entrantPool).not.toEqual(elite.entrantPool);
  });
});

describe("ティア解放", () => {
  it("原作を優勝するまで本気は開かない", () => {
    const none = availableTiers(cup, []);
    expect(none[0]).toEqual({ tier: "original", unlocked: true });
    expect(none[1]).toEqual({ tier: "serious", unlocked: false });

    const after = availableTiers(cup, ["original"]);
    expect(after[1]).toEqual({ tier: "serious", unlocked: true });
  });

  it("次に挑むべきティアを返す", () => {
    expect(nextTier(cup, [])).toBe("original");
    expect(nextTier(cup, ["original"])).toBe("serious");
    expect(nextTier(cup, ["original", "serious"])).toBeNull();
  });

  it("優勝の記録がセーブに残り、同じティアで重複しない", () => {
    let save = recordCupWin(emptySave(), cup.id, "original", 8);
    save = recordCupWin(save, cup.id, "original", 8);
    expect(save.global.endgame.tournamentRecords[cup.id]?.clearedTiers).toEqual(["original"]);
    expect(save.global.bp).toBe(16);
  });
});

describe("勝ち抜き", () => {
  const team: PartySpec[] = allBattleSets
    .filter((s) => s.grade === 4)
    .slice(0, 3)
    .map((s) => battleSetToSource(s, 50));

  it("全員倒すと優勝し、そこで初めて BP が入る", () => {
    let run = startCupRun(cup, allNamed, "original", team, 3);
    for (let i = 0; i < cup.rounds - 1; i++) {
      const outcome = applyCupOutcome(cup, run, true);
      expect(outcome.gainedBp).toBe(0);
      expect(outcome.champion).toBe(false);
      run = outcome.run;
    }
    const last = applyCupOutcome(cup, run, true);
    expect(last.champion).toBe(true);
    expect(last.gainedBp).toBe(cup.bpByTier.original);
    expect(last.run.state).toBe("won");
  });

  it("1敗で終わる（施設と違い連勝は刻まない）", () => {
    const run = startCupRun(cup, allNamed, "original", team, 3);
    const outcome = applyCupOutcome(cup, run, false);
    expect(outcome.run.state).toBe("lost");
    expect(outcome.gainedBp).toBe(0);
  });

  it("相手は3体・Lv50 に揃う（原作のレベルは同期される）", () => {
    const run = startCupRun(cup, allNamed, "original", team, 3);
    const character = currentOpponent(run, allNamed);
    const party = opponentParty(cup, run, character);
    expect(party.length).toBeLessThanOrEqual(3);
    expect(party.every((m) => m.level === 50)).toBe(true);
    expect(cupPlayerParty(cup, run).every((m) => m.level === 50)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// 実際に戦わせる
// ─────────────────────────────────────────────

function playCup(t: Tournament, tier: TierId, seed: number) {
  const team = buildOpponentParty(
    allBattleSets,
    rentalGradeFor(t, tier),
    t.ruleset.teamSize,
    createRng(createRngState(seed)),
  ).map((s) => battleSetToSource(s, 50));

  let run = startCupRun(t, allNamed, tier, team, seed);
  const player: AiConfig = { policy: "basic", mistakeRate: 0, knowledge: "fair" };

  let battles = 0;
  while (run.state === "inProgress") {
    if (++battles > t.rounds + 2) throw new Error("勝ち抜きが終わらない");
    const character = currentOpponent(run, allNamed);
    const foe: AiConfig = aiFor(character, tier);

    let state = createBattle(
      gameData,
      [cupPlayerParty(t, run), opponentParty(t, run, character)],
      seed + battles,
    );
    let guard = 0;
    while (state.result === null) {
      if (++guard > 500) throw new Error("バトルが決着しない");
      const r = createRng(state.rng);
      const actions: [Action | null, Action | null] = [null, null];
      for (const side of requiredSides(state)) {
        const config = side === 0 ? player : foe;
        actions[side] = chooseBasicAction(
          gameData,
          toAiView(gameData, state, side, config),
          config,
          r,
        );
      }
      state = { ...state, rng: r.state() };
      state = step(gameData, state, actions).state;
    }
    run = applyCupOutcome(t, run, state.result.winner === 0).run;
  }
  return run;
}

describe("実際に勝ち抜きを走らせる", () => {
  it("全カップ・全ティアが最後まで走る", () => {
    for (const t of allTournaments) {
      for (const tier of t.tierProgression) {
        const run = playCup(t, tier, 11);
        expect(["won", "lost"], `${t.id}/${tier}`).toContain(run.state);
      }
    }
  });

  it("本気ティアは原作ティアより明確に難しい", () => {
    const rate = (tier: TierId) => {
      let won = 0;
      for (let seed = 1; seed <= 12; seed++) {
        if (playCup(cup, tier, seed).state === "won") won++;
      }
      return won / 12;
    };
    // ティアが上がると勝率が下がる ―― 3ティアが3周ぶんのコンテンツになる根拠
    expect(rate("serious")).toBeLessThan(rate("original"));
  });

  it("原作ティアは現実的に優勝できる", () => {
    let won = 0;
    for (let seed = 1; seed <= 12; seed++) {
      if (playCup(cup, "original", seed).state === "won") won++;
    }
    expect(won / 12).toBeGreaterThan(0.4);
  });
});
