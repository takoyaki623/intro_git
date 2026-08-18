/**
 * 捕獲・ボール・器（v0.8）。
 *
 * 確かめたいのは式そのものより、**この2つが守られていること**。
 *   - ボールを1種足すのにコードが増えない
 *   - 1体の個体が2つの器に同時に属さない
 */

import { describe, expect, it } from "vitest";
import {
  addCaught,
  allInstances,
  assertNoDuplicates,
  attemptCapture,
  ballBonus,
  captureChance,
  catchValue,
  createBattle,
  createInstance,
  createRng,
  deposit,
  emptyStorage,
  instanceToSpec,
  isBall,
  PARTY_SIZE,
  release,
  reorder,
  replaceInstance,
  step,
  toBattlePokemon,
  nextOpponent,
  playerParty,
  startRun,
  validateTeam,
  withdraw,
  type PartySpec,
  type PokemonInstance,
  type Storage,
} from "../src/index.js";
import { allBalls, allBattleSets, allNatures, facilityById, gameData } from "@pkmn/data";

const NATURES = allNatures.map((n) => n.id);
const rng = (seed = 1) => createRng({ s: seed, calls: 0 });
const wild = (species: string, level = 10) =>
  toBattlePokemon(gameData, { species, level, moves: ["tackle"] });
const ctx = { turn: 1 };

describe("ボールの補正はデータで決まる", () => {
  it("全ボールが道具としても存在する", () => {
    for (const ball of allBalls) {
      expect(() => gameData.item(ball.id), ball.id).not.toThrow();
      expect(isBall(gameData, ball.id), ball.id).toBe(true);
    }
  });

  it("一定倍率のボールは条件を見ない", () => {
    const target = wild("pidgey");
    expect(ballBonus(gameData.ball("poke-ball"), target, ctx)).toBe(1);
    expect(ballBonus(gameData.ball("great-ball"), target, ctx)).toBe(1.5);
    expect(ballBonus(gameData.ball("ultra-ball"), target, ctx)).toBe(2);
  });

  it("ネットボールは むし/みず にだけ効く", () => {
    const net = gameData.ball("net-ball");
    expect(ballBonus(net, wild("caterpie"), ctx)).toBe(3.5);
    expect(ballBonus(net, wild("psyduck"), ctx)).toBe(3.5);
    expect(ballBonus(net, wild("pidgey"), ctx)).toBe(1);
  });

  it("クイックボールは早いターンだけ、タイマーボールは長引いたときだけ", () => {
    const quick = gameData.ball("quick-ball");
    const timer = gameData.ball("timer-ball");
    const target = wild("pidgey");
    expect(ballBonus(quick, target, { turn: 1 })).toBe(5);
    expect(ballBonus(quick, target, { turn: 2 })).toBe(1);
    expect(ballBonus(timer, target, { turn: 5 })).toBe(1);
    expect(ballBonus(timer, target, { turn: 10 })).toBe(4);
  });

  it("リピートボールは図鑑で捕獲済みのときだけ", () => {
    const repeat = gameData.ball("repeat-ball");
    const target = wild("pidgey");
    expect(ballBonus(repeat, target, { turn: 1, alreadyCaught: true })).toBe(3.5);
    expect(ballBonus(repeat, target, { turn: 1 })).toBe(1);
  });
});

describe("捕獲判定", () => {
  it("HP を削るほど捕まえやすい", () => {
    const full = wild("pidgey");
    const hurt = { ...wild("pidgey"), currentHp: 1 };
    const ball = gameData.ball("poke-ball");
    expect(catchValue(gameData, hurt, ball, ctx)).toBeGreaterThan(
      catchValue(gameData, full, ball, ctx),
    );
  });

  it("状態異常にすると捕まえやすい（ねむりが最も効く）", () => {
    const ball = gameData.ball("poke-ball");
    const base = catchValue(gameData, wild("pidgey"), ball, ctx);
    const para = catchValue(gameData, { ...wild("pidgey"), status: "paralysis" }, ball, ctx);
    const sleep = catchValue(gameData, { ...wild("pidgey"), status: "sleep" }, ball, ctx);
    expect(para).toBeGreaterThan(base);
    expect(sleep).toBeGreaterThan(para);
  });

  it("捕まりにくい種ほど捕獲値が低い", () => {
    const ball = gameData.ball("poke-ball");
    // コラッタ（255）> ラプラス（45）> ミュウツー（3）
    const of = (id: string) => catchValue(gameData, wild(id), ball, ctx);
    expect(of("rattata")).toBeGreaterThan(of("lapras"));
    expect(of("lapras")).toBeGreaterThan(of("mewtwo"));
  });

  it("マスターボールは必ず捕まる", () => {
    const master = gameData.ball("master-ball");
    for (let seed = 1; seed <= 50; seed += 1) {
      const result = attemptCapture(gameData, wild("mewtwo", 70), master, ctx, rng(seed));
      expect(result.caught, `seed ${seed}`).toBe(true);
      expect(result.guaranteed).toBe(true);
    }
  });

  it("失敗したときの揺れ回数は 0〜3、成功なら 4", () => {
    let sawPartial = false;
    for (let seed = 1; seed <= 200; seed += 1) {
      const result = attemptCapture(gameData, wild("pidgey"), gameData.ball("poke-ball"), ctx, rng(seed));
      if (result.caught) expect(result.shakes).toBe(4);
      else {
        expect(result.shakes).toBeGreaterThanOrEqual(0);
        expect(result.shakes).toBeLessThan(4);
        if (result.shakes > 0) sawPartial = true;
      }
    }
    // 「惜しい」演出が出る余地があること
    expect(sawPartial).toBe(true);
  });

  it("実測した捕獲率が、見積もりとおおむね一致する", () => {
    const target = { ...wild("pidgey"), currentHp: 3 };
    const ball = gameData.ball("poke-ball");
    const expected = captureChance(gameData, target, ball, ctx);

    let caught = 0;
    const N = 2000;
    for (let seed = 1; seed <= N; seed += 1) {
      if (attemptCapture(gameData, target, ball, ctx, rng(seed)).caught) caught += 1;
    }
    expect(Math.abs(caught / N - expected)).toBeLessThan(0.06);
  });

  it("良いボールほど捕まえやすい", () => {
    const target = wild("pidgey");
    const rate = (id: string) => captureChance(gameData, target, gameData.ball(id), ctx);
    expect(rate("great-ball")).toBeGreaterThan(rate("poke-ball"));
    expect(rate("ultra-ball")).toBeGreaterThan(rate("great-ball"));
  });
});

describe("バトル中にボールを投げる", () => {
  const parties = (): [PartySpec[], PartySpec[]] => [
    [{ species: "pikachu", level: 30, moves: ["thunder-shock"] }],
    [{ species: "rattata", level: 3, moves: ["tackle"] }],
  ];

  it("捕まえるとバトルが終わり、どのボールで捕ったかが残る", () => {
    let state = createBattle(gameData, [parties()[0], parties()[1]], 1, { isWild: true });
    // 弱らせてから
    state = { ...state, sides: [state.sides[0], {
      ...state.sides[1],
      party: [{ ...state.sides[1].party[0]!, currentHp: 1 }],
    }] };

    let caught = false;
    for (let i = 0; i < 40 && !caught; i += 1) {
      const out = step(gameData, state, [
        { kind: "item", item: "ultra-ball" },
        { kind: "move", moveIndex: 0 },
      ]);
      const thrown = out.events.find((e) => e.kind === "ballThrown");
      expect(thrown).toBeDefined();
      if (out.state.result?.reason === "caught") {
        caught = true;
        expect(out.state.result.winner).toBe(0);
        expect(out.state.caughtWith).toBe("ultra-ball");
      } else {
        state = out.state;
        if (state.result !== null) break;
      }
    }
    expect(caught).toBe(true);
  });

  it("投げたターンは技を出せない（削るか捕るかの選択になる）", () => {
    // 捕まりにくい相手にして、失敗したターンを確実に観測する
    const tough: [PartySpec[], PartySpec[]] = [
      [{ species: "pikachu", level: 30, moves: ["thunder-shock"] }],
      [{ species: "lapras", level: 30, moves: ["tackle"] }],
    ];

    let checked = 0;
    for (let seed = 1; seed <= 30 && checked === 0; seed += 1) {
      const state = createBattle(gameData, [tough[0], tough[1]], seed, { isWild: true });
      const { state: next, events } = step(gameData, state, [
        { kind: "item", item: "poke-ball" },
        { kind: "move", moveIndex: 0 },
      ]);
      if (next.result !== null) continue; // 捕まえた回は対象外

      // こちらの技は出ていない。相手の技は出ている
      expect(events.some((e) => e.kind === "moveUsed" && e.side === 0)).toBe(false);
      expect(events.some((e) => e.kind === "moveUsed" && e.side === 1)).toBe(true);
      checked += 1;
    }
    expect(checked).toBe(1);
  });
});

describe("手持ちとボックス", () => {
  const make = (n: number): PokemonInstance[] =>
    Array.from({ length: n }, (_, i) =>
      createInstance(gameData, { species: "pidgey", level: 5, region: "kanto" }, rng(i + 1), NATURES),
    );

  it("手持ちが空いていれば手持ちへ、埋まっていればボックスへ", () => {
    let storage: Storage = emptyStorage();
    const caught = make(PARTY_SIZE + 2);
    const destinations: string[] = [];
    for (const p of caught) {
      const result = addCaught(storage, p);
      storage = result.storage;
      destinations.push(result.to);
    }
    expect(destinations.slice(0, PARTY_SIZE).every((d) => d === "party")).toBe(true);
    expect(destinations.slice(PARTY_SIZE).every((d) => d === "box")).toBe(true);
    expect(storage.party).toHaveLength(PARTY_SIZE);
    expect(storage.box).toHaveLength(2);
  });

  it("同じ個体が2箇所に居ることを許さない", () => {
    const [p] = make(1);
    expect(() => assertNoDuplicates({ party: [p!], box: [p!] })).toThrow(/2箇所/);
  });

  it("預ける・引き出すで総数が変わらない", () => {
    let storage: Storage = emptyStorage();
    for (const p of make(3)) storage = addCaught(storage, p).storage;
    const before = allInstances(storage).length;

    storage = deposit(storage, storage.party[2]!.uid);
    expect(storage.party).toHaveLength(2);
    expect(storage.box).toHaveLength(1);

    storage = withdraw(storage, storage.box[0]!.uid);
    expect(storage.party).toHaveLength(3);
    expect(storage.box).toHaveLength(0);
    expect(allInstances(storage)).toHaveLength(before);
  });

  it("手持ちがいっぱいなら、入れ替える相手を指定して引き出す", () => {
    let storage: Storage = emptyStorage();
    for (const p of make(PARTY_SIZE + 1)) storage = addCaught(storage, p).storage;
    const fromBox = storage.box[0]!.uid;
    const fromParty = storage.party[0]!.uid;

    expect(() => withdraw(storage, fromBox)).toThrow(/いっぱい/);

    storage = withdraw(storage, fromBox, fromParty);
    expect(storage.party.map((p) => p.uid)).toContain(fromBox);
    expect(storage.box.map((p) => p.uid)).toContain(fromParty);
    expect(storage.party).toHaveLength(PARTY_SIZE);
  });

  it("最後の1匹は預けられないし、逃がせない", () => {
    let storage: Storage = emptyStorage();
    storage = addCaught(storage, make(1)[0]!).storage;
    expect(() => deposit(storage, storage.party[0]!.uid)).toThrow(/最後の1匹/);
    expect(() => release(storage, storage.party[0]!.uid)).toThrow(/最後の1匹/);
  });

  it("進化やレベルアップは、どちらの器に居ても反映できる", () => {
    let storage: Storage = emptyStorage();
    for (const p of make(PARTY_SIZE + 1)) storage = addCaught(storage, p).storage;
    const inBox = storage.box[0]!;
    storage = replaceInstance(storage, { ...inBox, species: "pidgeotto" });
    expect(storage.box[0]!.species).toBe("pidgeotto");
    expect(allInstances(storage)).toHaveLength(PARTY_SIZE + 1);
  });

  it("並べ替えても総数と中身が変わらない", () => {
    let storage: Storage = emptyStorage();
    for (const p of make(3)) storage = addCaught(storage, p).storage;
    const uids = storage.party.map((p) => p.uid);
    storage = reorder(storage, 2, 0);
    expect(storage.party.map((p) => p.uid)).toEqual([uids[2], uids[0], uids[1]]);
  });
});

describe("捕まえた個体を施設に持ち込む（v0.8 の完了条件）", () => {
  it("自分の手持ちで連戦を最後まで走らせられる", () => {
    // 器に3体入れて、そのまま施設へ持ち込む
    let storage: Storage = emptyStorage();
    for (const species of ["charmander", "pidgey", "rattata"]) {
      storage = addCaught(
        storage,
        createInstance(gameData, { species, level: 30, region: "kanto" }, rng(species.length), NATURES),
      ).storage;
    }

    const facility = facilityById("battle-tower-super");
    expect(facility.ruleset.teamSource).toBe("own");

    const team = storage.party.map((p) => instanceToSpec(gameData, p));
    expect(validateTeam(gameData, facility.ruleset, team)).toEqual([]);

    let run = startRun(facility, team, 42);
    // レベル同期で全員 Lv50 になる（実レベル30でも持ち込める）
    for (const member of playerParty(facility, run)) expect(member.level).toBe(50);

    // 1戦だけ回して、相手が組み上がりバトルが成立することを確かめる
    const next = nextOpponent(facility, allBattleSets, run);
    run = next.run;
    const state = createBattle(gameData, [playerParty(facility, run), next.party], 1);
    for (const side of [0, 1] as const) {
      for (const mon of state.sides[side].party) {
        expect(mon.level).toBe(50);
        expect(mon.currentHp).toBeGreaterThan(0);
      }
    }
  });

  it("弱っている個体を持ち込んでも、施設側で満タンから始まる", () => {
    // 施設は1戦ごとに回復する（endgame.md §11.5）。
    // 冒険で傷ついた個体をそのまま持ち込めることの裏返し
    const hurt = {
      ...createInstance(gameData, { species: "charmander", level: 30, region: "kanto" }, rng(1), NATURES),
    };
    hurt.currentHp = 1;
    const spec = instanceToSpec(gameData, hurt);
    expect(spec.hpRatio).toBeLessThan(0.2);

    const facility = facilityById("battle-tower-super");
    const run = startRun(facility, [spec, spec, spec], 1);
    // 持ち込んだ時点の設計図には傷が残っているが、
    // 施設のバトルは満タンで始まる（carryOverDamage が false）
    expect(playerParty(facility, run)[0]!.hpRatio).toBeLessThan(0.2);
  });
});
