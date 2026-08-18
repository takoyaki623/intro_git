/**
 * 実個体と戦闘後シーケンス（v0.8）。
 *
 * v0.7 の手持ちは設計図で、戦うたびに満タンに戻っていた。
 * ここで確かめたいのは **バトルの外に何が残り、何が残らないか**。
 */

import { describe, expect, it } from "vitest";
import {
  applyBattleResult,
  chooseBasicAction,
  createBattle,
  createKnowledge,
  createInstance,
  createRng,
  evolutionFor,
  evolve,
  expForLevel,
  expGain,
  expProgress,
  healInstance,
  healParty,
  instanceToBattle,
  instanceToSpec,
  legalActions,
  levelForExp,
  levelOf,
  maxHpOf,
  movesAtLevel,
  observe,
  replaceMove,
  requiredSides,
  statsOf,
  step,
  toAiView,
  toBattlePokemon,
  writeBack,
  type Action,
  type PokemonInstance,
} from "../src/index.js";
import { allSpecies, createGameData, gameData, trainerById } from "@pkmn/data";

const NATURES = ["hardy", "adamant", "modest", "timid", "jolly"];
const rng = (seed = 12345) => createRng({ s: seed, calls: 0 });

const make = (species: string, level: number, seed = 7): PokemonInstance =>
  createInstance(gameData, { species, level, region: "kanto" }, rng(seed), NATURES);

describe("経験値テーブル", () => {
  it("Lv1 は 0、Lv100 は成長曲線ごとの到達値", () => {
    const at100: Record<string, number> = {
      erratic: 600_000, fast: 800_000, "medium-fast": 1_000_000,
      "medium-slow": 1_059_860, slow: 1_250_000, fluctuating: 1_640_000,
    };
    for (const [type, total] of Object.entries(at100)) {
      expect(expForLevel(gameData, type as "fast", 1), type).toBe(0);
      expect(expForLevel(gameData, type as "fast", 100), type).toBe(total);
    }
  });

  it("累計経験値からレベルが引ける（境界を含む）", () => {
    const type = "medium-slow" as const;
    for (const level of [1, 2, 5, 16, 50, 99, 100]) {
      const exp = expForLevel(gameData, type, level);
      expect(levelForExp(gameData, type, exp), `Lv${level}`).toBe(level);
      if (level > 1) {
        expect(levelForExp(gameData, type, exp - 1), `Lv${level} の1つ手前`).toBe(level - 1);
      }
    }
  });

  it("次のレベルまでの進み具合が 0〜1 に収まる", () => {
    const p = expProgress(gameData, "medium-slow", expForLevel(gameData, "medium-slow", 10) + 5);
    expect(p.level).toBe(10);
    expect(p.ratio).toBeGreaterThan(0);
    expect(p.ratio).toBeLessThan(1);
  });

  it("相手が高レベルなほど多く貰える", () => {
    const foe = (level: number) =>
      toBattlePokemon(gameData, { species: "pidgey", level, moves: ["tackle"] });
    const low = expGain(gameData, { fainted: foe(5), winnerLevel: 10, isWild: true });
    const high = expGain(gameData, { fainted: foe(20), winnerLevel: 10, isWild: true });
    expect(high).toBeGreaterThan(low);
  });

  it("トレーナー戦は野生より多い", () => {
    const foe = toBattlePokemon(gameData, { species: "pidgey", level: 10, moves: ["tackle"] });
    const wild = expGain(gameData, { fainted: foe, winnerLevel: 10, isWild: true });
    const trainer = expGain(gameData, { fainted: foe, winnerLevel: 10, isWild: false });
    expect(trainer).toBeGreaterThan(wild);
  });
});

describe("個体の生成", () => {
  it("指定したレベルちょうどの経験値で始まる", () => {
    const p = make("charmander", 5);
    expect(levelOf(gameData, p)).toBe(5);
    expect(p.exp).toBe(expForLevel(gameData, "medium-slow", 5));
  });

  it("満タンで生まれ、技は learnset から決まる", () => {
    const p = make("charmander", 12);
    expect(p.currentHp).toBe(maxHpOf(gameData, p));
    expect(p.moves.map((m) => m.id)).toEqual(movesAtLevel(gameData, "charmander", 12));
    expect(p.moves.every((m) => m.pp === gameData.move(m.id).pp)).toBe(true);
  });

  it("個体値は 0〜31 の範囲でばらける", () => {
    const values = new Set<number>();
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const v of Object.values(make("pidgey", 5, seed).ivs)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(31);
        values.add(v);
      }
    }
    expect(values.size).toBeGreaterThan(10);
  });

  it("同じ種でも個体ごとに実数値が違う", () => {
    const spreads = new Set(
      Array.from({ length: 20 }, (_, i) => JSON.stringify(statsOf(gameData, make("pidgey", 30, i + 1)))),
    );
    expect(spreads.size).toBeGreaterThan(1);
  });

  it("uid は個体ごとに違う", () => {
    const uids = new Set(Array.from({ length: 50 }, (_, i) => make("rattata", 5, i + 1).uid));
    expect(uids.size).toBe(50);
  });
});

describe("HP がバトルをまたいで残る（v0.8 の眼目）", () => {
  it("バトルで減った HP が個体に書き戻る", () => {
    const mine = make("charmander", 30);
    const full = maxHpOf(gameData, mine);

    let state = createBattle(
      gameData,
      [[instanceToSpec(gameData, mine)], [{ species: "onix", level: 30, moves: ["rock-throw"] }]],
      5,
    );
    // 相手だけ殴らせる
    for (let i = 0; i < 3 && state.result === null; i += 1) {
      state = step(gameData, state, [
        { kind: "move", moveIndex: 0 },
        { kind: "move", moveIndex: 0 },
      ]).state;
    }

    const after = writeBack(gameData, mine, state.sides[0].party[0]!);
    expect(after.currentHp).toBeLessThan(full);
    expect(after.currentHp).toBe(state.sides[0].party[0]!.currentHp);
    // PP も減っている
    expect(after.moves[0]!.pp).toBeLessThan(gameData.move(after.moves[0]!.id).pp);
  });

  it("次のバトルは減ったままの HP で始まる", () => {
    const mine = { ...make("charmander", 30) };
    const full = maxHpOf(gameData, mine);
    const hurt = { ...mine, currentHp: Math.floor(full / 3) };
    const brought = instanceToBattle(gameData, hurt);
    expect(brought.currentHp).toBe(hurt.currentHp);
    expect(brought.maxHp).toBe(full);
  });

  it("ランク補正と混乱は持ち出さない（その場限りのもの）", () => {
    const mine = make("charmander", 30);
    const battle = instanceToBattle(gameData, mine);
    battle.statStages.atk = 4;
    battle.volatile.confusionTurns = 3;
    battle.status = "burn";

    const after = writeBack(gameData, mine, battle);
    // 状態異常は残る、ランクと混乱は残らない
    expect(after.status).toBe("burn");
    expect(Object.keys(after)).not.toContain("statStages");
    expect(Object.keys(after)).not.toContain("volatile");
  });

  it("レベル同期（施設）で最大HPが変わっても、割合で持ち込み・持ち帰りする", () => {
    const mine = { ...make("charmander", 20) };
    const full = maxHpOf(gameData, mine);
    const half = { ...mine, currentHp: Math.round(full / 2) };

    const brought = instanceToBattle(gameData, half, 50);
    expect(brought.level).toBe(50);
    expect(brought.currentHp / brought.maxHp).toBeCloseTo(0.5, 1);

    const back = writeBack(gameData, half, brought);
    expect(back.currentHp / full).toBeCloseTo(0.5, 1);
  });

  it("ひんしは 0 のまま戻る（1 に丸めない）", () => {
    const mine = make("charmander", 20);
    const battle = instanceToBattle(gameData, mine);
    battle.currentHp = 0;
    expect(writeBack(gameData, mine, battle).currentHp).toBe(0);
  });
});

describe("ポケモンセンター", () => {
  it("HP・PP・状態異常が全て戻る", () => {
    const mine = make("charmander", 20);
    const hurt: PokemonInstance = {
      ...mine,
      currentHp: 1,
      status: "poison",
      statusCounter: 3,
      moves: mine.moves.map((m) => ({ ...m, pp: 0 })),
    };
    const healed = healInstance(gameData, hurt);
    expect(healed.currentHp).toBe(maxHpOf(gameData, healed));
    expect(healed.status).toBeNull();
    expect(healed.statusCounter).toBe(0);
    expect(healed.moves.every((m) => m.pp === gameData.move(m.id).pp)).toBe(true);
  });

  it("手持ち全員に効く", () => {
    const party = [make("charmander", 10, 1), make("pidgey", 8, 2)].map((p) => ({ ...p, currentHp: 1 }));
    expect(healParty(gameData, party).every((p) => p.currentHp === maxHpOf(gameData, p))).toBe(true);
  });
});

describe("戦闘後シーケンス", () => {
  const foe = (species: string, level: number) =>
    toBattlePokemon(gameData, { species, level, moves: ["tackle"] });

  it("経験値が入り、レベルが上がり、実数値が増える", () => {
    const mine = make("charmander", 5);
    const before = statsOf(gameData, mine);
    const result = applyBattleResult(gameData, {
      party: [mine],
      participants: [mine.uid],
      defeated: [foe("pidgey", 20), foe("rattata", 20)],
      encountered: ["pidgey", "rattata"],
      isWild: true,
      dex: {},
    });
    const after = result.party[0]!;
    expect(levelOf(gameData, after)).toBeGreaterThan(5);
    expect(statsOf(gameData, after).atk).toBeGreaterThan(before.atk);
    expect(result.events.some((e) => e.kind === "expGained")).toBe(true);
    expect(result.events.some((e) => e.kind === "levelUp")).toBe(true);
  });

  it("倒れている個体は経験値を貰わない", () => {
    const mine = { ...make("charmander", 5), currentHp: 0 };
    const result = applyBattleResult(gameData, {
      party: [mine], participants: [mine.uid], defeated: [foe("pidgey", 20)],
      encountered: ["pidgey"], isWild: true, dex: {},
    });
    expect(result.party[0]!.exp).toBe(mine.exp);
  });

  it("レベルアップで覚える技は、枠が空いていれば自動で入る", () => {
    // ヒトカゲは Lv4 で ひのこ を覚える
    const mine = make("charmander", 1);
    expect(mine.moves.some((m) => m.id === "ember")).toBe(false);
    const result = applyBattleResult(gameData, {
      party: [mine], participants: [mine.uid],
      defeated: [foe("pidgey", 15)], encountered: ["pidgey"], isWild: true, dex: {},
    });
    const after = result.party[0]!;
    if (levelOf(gameData, after) >= 4) {
      expect(after.moves.some((m) => m.id === "ember")).toBe(true);
      expect(result.events.some((e) => e.kind === "learned")).toBe(true);
    }
  });

  it("技が4つ埋まっていれば、覚えさせずに UI へ問い合わせる", () => {
    const base = make("charmander", 20);
    const mine: PokemonInstance = {
      ...base,
      exp: expForLevel(gameData, "medium-slow", 23),
      moves: [
        { id: "scratch", pp: 35 }, { id: "growl", pp: 40 },
        { id: "ember", pp: 25 }, { id: "dragon-breath", pp: 20 },
      ],
    };
    const result = applyBattleResult(gameData, {
      party: [mine], participants: [mine.uid],
      defeated: [foe("pidgey", 40), foe("pidgey", 40)], encountered: ["pidgey"], isWild: true, dex: {},
    });
    const after = result.party[0]!;
    expect(after.moves).toHaveLength(4);
    const ask = result.events.filter((e) => e.kind === "canLearn");
    if (levelOf(gameData, after) >= 24) {
      expect(ask.length).toBeGreaterThan(0);
      expect(ask.every((e) => e.kind === "canLearn" && !e.hasRoom)).toBe(true);
    }
  });

  it("努力値が上限（合計510・各252）を超えない", () => {
    let mine = make("charmander", 50);
    for (let i = 0; i < 400; i += 1) {
      mine = applyBattleResult(gameData, {
        party: [mine], participants: [mine.uid],
        defeated: [foe("pidgey", 5)], encountered: ["pidgey"], isWild: true, dex: {},
      }).party[0]!;
    }
    const total = Object.values(mine.evs).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(510);
    for (const [stat, v] of Object.entries(mine.evs)) expect(v, stat).toBeLessThanOrEqual(252);
    expect(total).toBeGreaterThan(0);
  });

  it("図鑑は対面で seen になる", () => {
    const mine = make("charmander", 5);
    const result = applyBattleResult(gameData, {
      party: [mine], participants: [mine.uid], defeated: [],
      encountered: ["pidgey", "rattata"], isWild: true, dex: { pidgey: "caught" },
    });
    expect(result.dex["rattata"]).toBe("seen");
    // 既に caught なものを seen に戻さない
    expect(result.dex["pidgey"]).toBe("caught");
    expect(result.events.filter((e) => e.kind === "dexUpdated")).toHaveLength(1);
  });

  it("経験値は参加者で山分けする", () => {
    const a = make("charmander", 10, 1);
    const b = make("squirtle", 10, 2);
    const alone = applyBattleResult(gameData, {
      party: [a], participants: [a.uid], defeated: [foe("pidgey", 15)],
      encountered: [], isWild: true, dex: {},
    }).party[0]!.exp - a.exp;
    const shared = applyBattleResult(gameData, {
      party: [a, b], participants: [a.uid, b.uid], defeated: [foe("pidgey", 15)],
      encountered: [], isWild: true, dex: {},
    }).party[0]!.exp - a.exp;
    expect(shared).toBeLessThan(alone);
  });

  it("周回加速の倍率が効く", () => {
    const mine = make("charmander", 10);
    const gain = (multiplier?: number) =>
      applyBattleResult(gameData, {
        party: [mine], participants: [mine.uid], defeated: [foe("pidgey", 15)],
        encountered: [], isWild: true, dex: {},
        ...(multiplier === undefined ? {} : { expMultiplier: multiplier }),
      }).party[0]!.exp - mine.exp;
    expect(gain(2)).toBeGreaterThan(gain());
  });
});

describe("進化", () => {
  it("レベル条件を満たすと提案される", () => {
    const low = make("bulbasaur", 15);
    const high = make("bulbasaur", 16);
    expect(evolutionFor(gameData, low, 15)).toBeNull();
    expect(evolutionFor(gameData, high, 16)?.to).toBe("ivysaur");
  });

  it("なつき度で進化する種は、なつき度が足りるまで進化しない", () => {
    // カントー151種の範囲になつき度進化は無い（ゴルバット→クロバットはジョウト）。
    // 機構だけを、作った種族データで確かめる
    const base = gameData.species("golbat");
    const data = createGameData({
      species: [{ ...base, evolutions: [{ to: "zubat", kind: "levelFriendship" }] }, gameData.species("zubat")],
      moves: base.learnset.map((l) => gameData.move(l.move)),
    });
    const low = make("golbat", 30);
    expect(evolutionFor(data, low, 30)).toBeNull();
    expect(evolutionFor(data, { ...low, friendship: 220 }, 30)?.to).toBe("zubat");
  });

  it("道具・通信交換の進化はまだ起きない（データには残っている）", () => {
    const haunter = make("haunter", 50);
    expect(gameData.species("haunter").evolutions[0]?.kind).toBe("trade");
    expect(evolutionFor(gameData, haunter, 50)).toBeNull();
  });

  it("進化しても技・経験値・個体値は引き継ぎ、HP は割合を保つ", () => {
    const before = make("bulbasaur", 16);
    const hurt = { ...before, currentHp: Math.round(maxHpOf(gameData, before) / 2) };
    const after = evolve(gameData, hurt, "ivysaur");

    expect(after.species).toBe("ivysaur");
    expect(after.uid).toBe(before.uid);
    expect(after.exp).toBe(before.exp);
    expect(after.ivs).toEqual(before.ivs);
    expect(after.moves.map((m) => m.id)).toEqual(before.moves.map((m) => m.id));
    expect(maxHpOf(gameData, after)).toBeGreaterThan(maxHpOf(gameData, before));
    expect(after.currentHp / maxHpOf(gameData, after)).toBeCloseTo(0.5, 1);
  });

  it("進化の連鎖が全て実在する種を指す", () => {
    const ids = new Set(allSpecies.map((s) => s.id));
    for (const s of allSpecies) {
      for (const evo of s.evolutions) {
        expect(ids.has(evo.to), `${s.id} → ${evo.to}`).toBe(true);
        if (evo.kind === "level") expect(evo.level, `${s.id} → ${evo.to}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("技の入れ替え", () => {
  it("指定した枠が置き換わり、PP は満タンになる", () => {
    const mine = make("charmander", 20);
    const after = replaceMove(gameData, mine, 0, "flamethrower");
    expect(after.moves[0]!.id).toBe("flamethrower");
    expect(after.moves[0]!.pp).toBe(gameData.move("flamethrower").pp);
    expect(after.moves.slice(1)).toEqual(mine.moves.slice(1));
  });
});

describe("施設への持ち込み", () => {
  it("個体をそのまま PartySpec に落とせる", () => {
    const mine = make("charmander", 33);
    const spec = instanceToSpec(gameData, mine);
    expect(spec.species).toBe("charmander");
    expect(spec.level).toBe(33);
    expect(spec.ivs).toEqual(mine.ivs);
    // レベル同期で 50 に引き上げられる
    const battle = toBattlePokemon(gameData, spec, 50);
    expect(battle.level).toBe(50);
  });
});

describe("最初のライバル戦が成立しているか（v0.8 の実測）", () => {
  /** プレイヤーもライバルも `basic` で最善を打つ。データだけを見る。 */
  function winRate(mine: string, trainerId: string, samples = 200): number {
    const trainer = trainerById(trainerId);
    let wins = 0;
    for (let seed = 1; seed <= samples; seed += 1) {
      const seedRng = createRng({ s: seed, calls: 0 });
      const me = createInstance(gameData, { species: mine, level: 5, region: "kanto" }, seedRng, NATURES);
      let state = createBattle(gameData, [[instanceToSpec(gameData, me)], trainer.party], seed);
      const config = { policy: "basic", mistakeRate: 0, knowledge: "fair" } as const;
      const knowledge = [createKnowledge(), createKnowledge()];
      let guard = 0;
      while (state.result === null && guard++ < 300) {
        const r = createRng(state.rng);
        const actions: [Action | null, Action | null] = [null, null];
        for (const side of requiredSides(state)) {
          actions[side] = state.pendingSwitch.includes(side)
            ? legalActions(gameData, state, side)[0]!
            : chooseBasicAction(gameData, toAiView(gameData, state, side, config, knowledge[side]!), config, r);
        }
        state = { ...state, rng: r.state() };
        const out = step(gameData, state, actions);
        observe(knowledge[0]!, out.state, out.events, 0);
        observe(knowledge[1]!, out.state, out.events, 1);
        state = out.state;
      }
      if (state.result?.winner === 0) wins += 1;
    }
    return wins / samples;
  }

  /**
   * ライバルは**こちらに有利な1匹**を出してくる（原作準拠）。
   * それでも3択のどれを選んでも勝負になっていること。
   *
   * v0.8 で公式 learnset を入れたとき、ここが 1.5% まで落ちた。
   * 原因はレベルでも種族値でもなく、**ライバルが持っていた「しっぽをふる」1つ**。
   * Lv5 はダメージが小さいので、ぼうぎょ −1 が KO までの手数を丸ごと1回増やす。
   */
  it("どの1匹を選んでも 25%〜70% の範囲に収まる", () => {
    const rates: [string, string, number][] = [
      ["bulbasaur", "kanto-rival-charmander", winRate("bulbasaur", "kanto-rival-charmander")],
      ["charmander", "kanto-rival-squirtle", winRate("charmander", "kanto-rival-squirtle")],
      ["squirtle", "kanto-rival-bulbasaur", winRate("squirtle", "kanto-rival-bulbasaur")],
    ];
    for (const [mine, foe, rate] of rates) {
      expect(rate, `${mine} vs ${foe} = ${(rate * 100).toFixed(1)}%`).toBeGreaterThan(0.25);
      expect(rate, `${mine} vs ${foe} = ${(rate * 100).toFixed(1)}%`).toBeLessThan(0.7);
    }
  });
});
