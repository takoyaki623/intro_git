/**
 * ルールセット駆動の施設と連戦（v0.5）。
 *
 * ここで確かめたいのは個々の施設ではなく、
 * **施設がデータだけで定義できていること**（コードを触らず1件増やせること）。
 * 設計: docs/design/endgame.md §4・§6・§8
 */

import { describe, expect, it } from "vitest";
import {
  applyBattleOutcome,
  chooseBasicAction,
  emptySave,
  recordRun,
  requiredSides,
  step,
  toAiView,
  type Action,
  type AiConfig,
  assertPoolUsable,
  bandFor,
  battleSetToSource,
  bpFor,
  buildOpponentParty,
  createBattle,
  judge,
  createRng,
  createRngState,
  DEFAULT_IVS_BY_GRADE,
  nextOpponent,
  playerParty,
  startRun,
  swapAfterWin,
  swapCandidates,
  syncedLevel,
  toBattlePokemon,
  validateTeam,
  type Facility,
  type PartySpec,
} from "@pkmn/core";
import { allBattleSets, allFacilities, facilityById, gameData } from "@pkmn/data";

const tower = facilityById("battle-tower");
const rng = () => createRng(createRngState(31));

describe("BattleSet プール", () => {
  it("全ての BattleSet がそのままバトルに投入できる", () => {
    assertPoolUsable(gameData, allBattleSets);
    for (const set of allBattleSets) {
      const mon = toBattlePokemon(gameData, battleSetToSource(set, 50));
      expect(mon.level).toBe(50);
      expect(mon.moves.length).toBe(set.moves.length);
      expect(mon.ability).toBe(set.ability);
      expect(mon.item).toBe(set.item);
    }
  });

  it("個体値は grade から導かれる", () => {
    for (const set of allBattleSets) {
      if (set.ivs !== undefined) continue;
      const source = battleSetToSource(set, 50);
      expect(source.ivs?.atk).toBe(DEFAULT_IVS_BY_GRADE[set.grade]);
    }
  });

  it("grade が上がるほど強くなる", () => {
    // 同じ個体で grade だけを変え、個体値と努力値の差が実数値に出ることを見る
    const base = allBattleSets.find((s) => (s.evs.spa ?? 0) > 0)!;
    const monAt = (grade: 1 | 2 | 3 | 4) =>
      toBattlePokemon(gameData, battleSetToSource({ ...base, grade }, 50));
    expect(monAt(1).stats.hp).toBeLessThan(monAt(2).stats.hp);
    expect(monAt(2).stats.hp).toBeLessThan(monAt(3).stats.hp);
    expect(monAt(3).stats.hp).toBeLessThan(monAt(4).stats.hp);
    // 強さの段階を実際に作っているのは努力値の方（個体値だけでは差が小さい）
    expect(monAt(4).stats.spa - monAt(1).stats.spa).toBeGreaterThan(20);
  });

  it("抽選したパーティは種族と持ち物が重複しない", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const party = buildOpponentParty(
        allBattleSets,
        1,
        3,
        createRng(createRngState(seed)),
      );
      expect(new Set(party.map((s) => s.species)).size).toBe(3);
      expect(new Set(party.map((s) => s.item)).size).toBe(3);
      expect(party.every((s) => s.grade === 1)).toBe(true);
    }
  });

  it("件数が足りない grade は黙って通さない", () => {
    expect(() => buildOpponentParty(allBattleSets.slice(0, 2), 1, 3, rng())).toThrow(/件しかない/);
  });
});

describe("ルールセット", () => {
  it("レベル同期は双方向（低い個体は引き上げられる）", () => {
    expect(syncedLevel(tower.ruleset, 5)).toBe(50);
    expect(syncedLevel(tower.ruleset, 100)).toBe(50);
    expect(syncedLevel({ ...tower.ruleset, levelMode: { kind: "asIs" } }, 5)).toBe(5);
  });

  it("編成の違反を理由つきで返す", () => {
    const team: PartySpec[] = [
      { species: "pikachu", level: 50, moves: ["thunderbolt"], item: "magnet" },
      { species: "pikachu", level: 50, moves: ["thunderbolt"], item: "magnet" },
    ];
    const problems = validateTeam(gameData, tower.ruleset, team);
    expect(problems.some((p) => p.includes("3体"))).toBe(true);
    expect(problems.some((p) => p.includes("だぶって"))).toBe(true);
  });

  it("正しい編成なら違反が無い", () => {
    const team: PartySpec[] = [
      { species: "pikachu", level: 50, moves: ["thunderbolt"], item: "magnet" },
      { species: "charmander", level: 50, moves: ["ember"], item: "charcoal" },
      { species: "squirtle", level: 50, moves: ["water-gun"], item: "mystic-water" },
    ];
    expect(validateTeam(gameData, tower.ruleset, team)).toEqual([]);
  });
});

describe("連戦", () => {
  const team: PartySpec[] = allBattleSets
    .filter((s) => s.grade === 1)
    .slice(0, 3)
    .map((s) => battleSetToSource(s, 50));

  it("連勝が伸びるほど相手の grade と1戦あたりの BP が上がる", () => {
    expect(bandFor(tower, 1).grade).toBe(1);
    expect(bandFor(tower, 20).grade).toBe(2);
    expect(bpFor(tower, 1)).toBeLessThan(bpFor(tower, 20));

    // 「低段位の周回が最も効率が良い」にならないこと（economy.md §9）
    let previous = 0;
    for (const row of tower.bpByStreak) {
      expect(row.bp).toBeGreaterThanOrEqual(previous);
      previous = row.bp;
    }
  });

  it("勝つと連勝と BP が増え、負けると連勝だけがリセットされる", () => {
    let run = startRun(tower, team, 1);
    for (let i = 0; i < 3; i++) {
      run = applyBattleOutcome(tower, run, true).run;
    }
    expect(run.streak).toBe(3);
    expect(run.earnedBp).toBeGreaterThan(0);

    const before = run.earnedBp;
    const lost = applyBattleOutcome(tower, run, false).run;
    expect(lost.state).toBe("lost");
    // 「30連勝して負けたら全部消える」にしない
    expect(lost.earnedBp).toBe(before);
  });

  it("連勝上限に達すると終了する（v0.5 は basic のみのため上限を置く）", () => {
    let run = startRun(tower, team, 1);
    for (let i = 0; i < tower.streakCap; i++) {
      run = applyBattleOutcome(tower, run, true).run;
    }
    expect(run.state).toBe("won");
    expect(run.streak).toBe(tower.streakCap);
  });

  it("同じセーブから再開すると同じ相手が出る", () => {
    const a = nextOpponent(tower, allBattleSets, startRun(tower, team, 99));
    const b = nextOpponent(tower, allBattleSets, startRun(tower, team, 99));
    expect(a.party.map((p) => p.species)).toEqual(b.party.map((p) => p.species));
    // 乱数は進むので、次の相手は変わる
    const c = nextOpponent(tower, allBattleSets, a.run);
    expect(c.party.map((p) => p.species)).not.toEqual(a.party.map((p) => p.species));
  });

  it("生成した相手とそのまま戦える", () => {
    const run = startRun(tower, team, 7);
    const { party } = nextOpponent(tower, allBattleSets, run);
    const state = createBattle(gameData, [playerParty(tower, run), party], 7);
    expect(state.sides[0].party).toHaveLength(3);
    expect(state.sides[1].party).toHaveLength(3);
    expect(state.sides[1].party.every((p) => p.level === 50)).toBe(true);
  });
});

describe("連戦を実際に最後まで走らせる", () => {
  /** 施設を1回ぶん通しで遊ぶ。プレイヤーも basic AI が操作する。 */
  function playRun(facility: Facility, seed: number) {
    // レンタルは相手より強い grade から借りる（UI と同じ手順）
    const team = buildOpponentParty(
      allBattleSets,
      facility.rentalGrade,
      facility.ruleset.teamSize,
      createRng(createRngState(seed)),
    ).map((s) => battleSetToSource(s, 50));

    let run = startRun(facility, team, seed);
    const player: AiConfig = { policy: "basic", mistakeRate: 0, knowledge: "fair" };

    let battles = 0;
    while (run.state === "inProgress") {
      if (++battles > facility.streakCap + 5) throw new Error("連戦が終わらない");
      const next = nextOpponent(facility, allBattleSets, run);
      run = next.run;
      const foe: AiConfig = {
        policy: "basic",
        mistakeRate: next.band.mistakeRate,
        knowledge: "fair",
      };

      let state = createBattle(gameData, [playerParty(facility, run), next.party], seed + battles);
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
      run = applyBattleOutcome(facility, run, state.result.winner === 0).run;
    }
    return { run, battles };
  }

  it("勝ち続ければ上限で終わり、負ければそこで終わる", () => {
    for (const seed of [11, 23, 47]) {
      const { run } = playRun(tower, seed);
      expect(["won", "lost"]).toContain(run.state);
      if (run.state === "won") {
        expect(run.streak).toBe(tower.streakCap);
        expect(run.earnedBp).toBeGreaterThan(0);
      }
      // 1戦も勝てなくても BP は非負で、記録が壊れない
      expect(run.earnedBp).toBeGreaterThanOrEqual(0);
    }
  });

  it("最初の施設は現実的に制覇できる", () => {
    // 相手と同じ強さの個体を貸すと1戦の勝率が五分になり、
    // 20連勝の確率が 0.5^20 になって施設として成立しなくなる。
    // レンタルを相手より強い grade にしてある根拠を、ここで測って固定する。
    let cleared = 0;
    const total = 20;
    for (let seed = 1; seed <= total; seed++) {
      if (playRun(tower, seed).run.state === "won") cleared++;
    }
    expect(cleared / total).toBeGreaterThan(0.4);
  });

  it("2つ目の施設は明確に難しい", () => {
    let cleared = 0;
    const total = 20;
    for (let seed = 1; seed <= total; seed++) {
      if (playRun(facilityById("battle-tower-super"), seed).run.state === "won") cleared++;
    }
    expect(cleared / total).toBeLessThan(0.4);
  });

  it("走り切った結果がそのままセーブの記録になる", () => {
    const { run } = playRun(tower, 101);
    const save = recordRun(emptySave(), tower.id, {
      streak: run.streak,
      wins: run.streak,
      bp: run.earnedBp,
    });
    expect(save.global.bp).toBe(run.earnedBp);
    expect(save.global.endgame.facilityRecords[tower.id]?.bestStreak).toBe(run.streak);
  });

  it("2つ目の施設も同じ手順で走る（コードの分岐が無い）", () => {
    const { run } = playRun(facilityById("battle-tower-super"), 5);
    expect(["won", "lost"]).toContain(run.state);
  });
});

describe("ターン制限と採点（v0.11・バトルアリーナ）", () => {
  const team = (species: string[]): PartySpec[] =>
    species.map((id) => ({ species: id, level: 50, moves: ["tackle"] }));

  it("倒しきらなくても、制限ターンで決着する", () => {
    // わざと決着しない組み合わせ ―― ぼうぎょ200のハガネール同士をタックルで殴っても
    // 8ターンでは倒れない（カビゴンでやったら普通に決着した）
    let state = createBattle(gameData, [team(["steelix"]), team(["steelix"])], 1, {
      limit: { turns: 8, judge: { criteria: ["hpRatio", "damageDealt", "movesHit"] } },
    });
    let guard = 0;
    while (state.result === null) {
      state = step(gameData, state, [{ kind: "move", moveIndex: 0 }, { kind: "move", moveIndex: 0 }]).state;
      if ((guard += 1) > 50) throw new Error("終わらなかった");
    }
    expect(state.result.reason).toBe("judged");
    expect(state.turn).toBe(8);
  });

  it("制限が無ければ、これまでどおり倒れるまで続く", () => {
    let state = createBattle(gameData, [team(["steelix"]), team(["steelix"])], 1);
    for (let i = 0; i < 8; i += 1) {
      state = step(gameData, state, [{ kind: "move", moveIndex: 0 }, { kind: "move", moveIndex: 0 }]).state;
    }
    expect(state.result).toBeNull();
    expect(state.limit).toBeNull();
  });

  it("観点は並べた順に見る。差がついた時点で決まる", () => {
    let state = createBattle(gameData, [team(["steelix"]), team(["steelix"])], 1, {
      limit: { turns: 4, judge: { criteria: ["movesHit"] } },
    });
    // 片側だけ当て続ける状況を作る（相手は交代しかしない番兵）
    state.tally = [
      { damageDealt: 0, movesHit: 3 },
      { damageDealt: 999, movesHit: 1 },
    ];
    const decision = judge(state, { criteria: ["movesHit", "damageDealt"] });
    expect(decision.winner).toBe(0);
    expect(decision.by).toBe("movesHit");

    // 1つ目が同点なら次の観点へ落ちる
    const second = judge(
      { ...state, tally: [{ damageDealt: 10, movesHit: 2 }, { damageDealt: 30, movesHit: 2 }] },
      { criteria: ["movesHit", "damageDealt"] },
    );
    expect(second.winner).toBe(1);
    expect(second.by).toBe("damageDealt");
  });

  it("すべて互角なら引き分け", () => {
    const state = createBattle(gameData, [team(["steelix"]), team(["steelix"])], 1);
    expect(judge(state, { criteria: ["hpRatio", "damageDealt", "movesHit"] })).toEqual({
      winner: null,
      by: null,
    });
  });
});

describe("勝った相手からもらう（v0.11・バトルファクトリー）", () => {
  const factory = facilityById("battle-factory");

  it("交換すると編成が入れ替わり、持ち越しの HP は捨てる", () => {
    const team = buildOpponentParty(allBattleSets, factory.rentalGrade, 3, rng()).map((s) =>
      battleSetToSource(s, 50),
    );
    const run = { ...startRun(factory, team, 1), carried: { hp: [1, 2, 3], pp: [] } };
    const gift: PartySpec = { species: "snorlax", level: 50, moves: ["tackle"] };

    const after = swapAfterWin(factory, run, 1, gift);
    expect(after.team[1]!.species).toBe("snorlax");
    expect(after.team[0]).toEqual(run.team[0]);
    // 中身が変わった編成に、前の編成の HP を当てはめる意味が無い
    expect(after.carried).toBeNull();
  });

  it("交換したあとも「同じ種を重ねない」が守られる", () => {
    const team: PartySpec[] = [
      { species: "snorlax", level: 50, moves: ["tackle"], item: "leftovers" },
      { species: "pikachu", level: 50, moves: ["tackle"], item: "life-orb" },
      { species: "onix", level: 50, moves: ["tackle"], item: "hard-stone" },
    ];
    const run = startRun(factory, team, 1);
    const offered: PartySpec[] = [
      { species: "snorlax", level: 50, moves: ["tackle"], item: "sitrus-berry" }, // 種が重なる
      { species: "gengar", level: 50, moves: ["tackle"], item: "life-orb" }, // 持ち物が重なる
      { species: "gengar", level: 50, moves: ["tackle"], item: "spell-tag" }, // これだけ通る
    ];
    // 0番（カビゴン）を出すなら、カビゴンをもらうのは通ってよい
    const forFirst = swapCandidates(factory, run, offered, 0);
    expect(forFirst.map((m) => m.item)).toEqual(["sitrus-berry", "spell-tag"]);

    // 2番（イワーク）を出すなら、カビゴンは重なるので出せない
    const forThird = swapCandidates(factory, run, offered, 2);
    expect(forThird.map((m) => m.item)).toEqual(["spell-tag"]);
  });

  it("交換できない施設で呼んだら例外（黙って何もしない、にしない）", () => {
    const run = startRun(tower, [{ species: "snorlax", level: 50, moves: ["tackle"] }], 1);
    expect(() =>
      swapAfterWin(tower, run, 0, { species: "pikachu", level: 50, moves: ["tackle"] }),
    ).toThrow();
  });
});

describe("施設はデータで増える", () => {
  it("2つ目の施設はルールセットを流用しているだけ", () => {
    const tiers = allFacilities.map((f: Facility) => f.bands.map((b) => b.grade));
    expect(allFacilities.length).toBeGreaterThanOrEqual(2);
    // 施設ごとに別のコードが要らないこと ―― 違いは bands と報酬だけ
    expect(tiers[0]).not.toEqual(tiers[1]);
    expect(allFacilities[0]!.ruleset.teamSize).toBe(allFacilities[1]!.ruleset.teamSize);
  });

  it("全施設が実際に相手を組める", () => {
    for (const facility of allFacilities) {
      for (const band of facility.bands) {
        const party = buildOpponentParty(
          allBattleSets,
          band.grade,
          facility.ruleset.teamSize,
          rng(),
        );
        expect(party).toHaveLength(facility.ruleset.teamSize);
      }
    }
  });
});
