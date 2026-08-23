/**
 * マップ探索・イベント・野生エンカウント（v0.7）。
 *
 * 確かめたいのは個々のマップではなく、
 * **マップを1枚足してもコードが増えない**構造が成立していること。
 * v0.7 の完了条件（world.md §9）そのものを最後に1本の道行きとして通す。
 */

import { describe, expect, it } from "vitest";
import {
  chooseOption,
  createBattle,
  createRng,
  emptyEncounterState,
  emptyWorldState,
  evaluate,
  neighborsOf,
  FIELD_ABILITIES,
  fieldAbilitiesFor,
  syncAbilities,
  walkableTerrains,
  objectKey,
  tableFor,
  tableForTerrain,
  interact,
  isWalkable,
  legalActions,
  objectAt,
  pickEncounter,
  startEvent,
  step,
  stepEvent,
  spotterAt,
  stepPlayer,
  terrainAt,
  visibleObjects,
  walkCommands,
  type Condition,
  type Direction,
  type EncounterState,
  type EncounterTable,
  type EventEffect,
  type MapData,
  type PlayerPosition,
  type WorldState,
} from "../src/index.js";
import {
  allEncounterTables,
  allEvents,
  allFieldAbilities,
  allFlags,
  allMaps,
  allTrainers,
  eventById,
  gameData,
  mapById,
} from "@pkmn/data";

const rng = () => createRng({ s: 12345, calls: 0 });
const HOUSE = "kanto-players-house-1f";
const TOWN = "kanto-pallet-town";
const LAB = "kanto-oak-lab";
const ROUTE = "kanto-route-1";

/** イベントを最後まで回して、UI に返された演出を集める。 */
function runEvent(
  world: WorldState,
  id: string,
  choose: (options: string[]) => number = () => 0,
): EventEffect[] {
  let runner = startEvent(eventById(id).commands);
  const all: EventEffect[] = [];
  for (let guard = 0; guard < 200; guard += 1) {
    const result = stepEvent(runner, world);
    runner = result.runner;
    all.push(...result.effects);
    const choice = result.effects.find((e) => e.kind === "choice");
    if (choice !== undefined && choice.kind === "choice") {
      runner = chooseOption(runner, choose(choice.options));
      continue;
    }
    if (runner.done || !result.waiting) break;
  }
  return all;
}

const texts = (effects: readonly EventEffect[]): string[] =>
  effects.flatMap((e) => (e.kind === "message" ? [e.text] : []));

describe("マップデータ", () => {
  it("全マップの collision / terrain の長さがサイズと一致する", () => {
    for (const map of allMaps) {
      const cells = map.size.width * map.size.height;
      expect(map.collision.length, map.id).toBe(cells);
      expect(map.terrain.length, map.id).toBe(cells);
      expect(map.layers.ground.length, map.id).toBe(cells);
    }
  });

  it("全 warp の接続先が存在し、通行可能なマスを指す", () => {
    for (const map of allMaps) {
      for (const warp of map.warps) {
        const dest = mapById(warp.to.map);
        const i = warp.to.y * dest.size.width + warp.to.x;
        expect(dest.collision[i], `${map.id} → ${warp.to.map}`).not.toBe(true);
      }
    }
  });
});

describe("移動", () => {
  const world = emptyWorldState();
  const map = mapById(HOUSE);
  const start = (x: number, y: number, facing: Direction): PlayerPosition => ({
    map: HOUSE, x, y, facing,
  });
  const walk = (pos: PlayerPosition, dir: Direction, enc = emptyEncounterState()) =>
    stepPlayer(map, world, pos, enc, dir, rng(), allEncounterTables);

  it("違う方向を向いた最初の入力は向き直りだけで、移動しない", () => {
    const result = walk(start(3, 5, "down"), "left");
    expect(result.outcome.kind).toBe("turned");
    expect(result.position).toEqual(start(3, 5, "left"));
  });

  it("同じ方向へ2度目の入力で進む", () => {
    const turned = walk(start(3, 5, "down"), "left").position;
    const result = walk(turned, "left");
    expect(result.outcome.kind).toBe("moved");
    expect(result.position.x).toBe(2);
  });

  it("壁には入れない", () => {
    const result = walk(start(1, 5, "left"), "left");
    expect(result.outcome.kind).toBe("blocked");
    expect(result.position.x).toBe(1);
  });

  it("NPC は通れない（話しかけるために必要）", () => {
    // ママは (5,3) に立っている
    expect(isWalkable(map, world, 5, 3)).toBe(false);
    expect(objectAt(map, world, 5, 3)?.id).toBe("house-mom");
  });
});

describe("段差", () => {
  const world = emptyWorldState();
  const map = mapById(ROUTE);
  const walk = (pos: PlayerPosition, dir: Direction) =>
    stepPlayer(map, world, pos, emptyEncounterState(), dir, rng(), allEncounterTables);

  it("段差は下向きにだけ飛び降りられ、2マス先に着地する", () => {
    // (5,6) が段差。(5,5) から下を向いて入る
    expect(terrainAt(map, 5, 6)).toBe("ledge");
    const result = walk({ map: ROUTE, x: 5, y: 5, facing: "down" }, "down");
    expect(result.outcome.kind).toBe("jumped");
    expect(result.position).toMatchObject({ x: 5, y: 7 });
  });

  it("下から段差は登れない（一方通行）", () => {
    const result = walk({ map: ROUTE, x: 5, y: 7, facing: "up" }, "up");
    expect(result.outcome.kind).toBe("blocked");
    expect(result.position).toMatchObject({ x: 5, y: 7 });
  });

  it("横からも段差には入れない", () => {
    const result = walk({ map: ROUTE, x: 4, y: 6, facing: "right" }, "right");
    expect(result.outcome.kind).toBe("blocked");
  });
});

describe("warp", () => {
  it("踏む warp でマップをまたぎ、戻ってこられる", () => {
    const world = emptyWorldState();
    const house = mapById(HOUSE);
    // 家の出口 (3,7) を踏む
    const out = stepPlayer(
      house, world, { map: HOUSE, x: 3, y: 6, facing: "down" },
      emptyEncounterState(), "down", rng(), allEncounterTables,
    );
    expect(out.outcome.kind).toBe("warp");
    if (out.outcome.kind !== "warp") throw new Error("warp のはず");
    expect(out.outcome.warp.to.map).toBe(TOWN);

    // 町側からドアを踏むと家に戻る。
    // **ドアは「調べる」ではなく「踏む」**（v0.8 で直した）――
    // ドアのマスは歩けるので、調べる前に上に乗ってしまい、家に入れなかった
    const town = mapById(TOWN);
    const back = stepPlayer(
      town, world, { map: TOWN, x: 3, y: 5, facing: "up" },
      emptyEncounterState(), "up", rng(), allEncounterTables,
    );
    expect(back.outcome.kind).toBe("warp");
    if (back.outcome.kind !== "warp") throw new Error("warp のはず");
    expect(back.outcome.warp.to.map).toBe(HOUSE);
  });
});

describe("エンカウント", () => {
  const map = mapById(ROUTE);
  const world = emptyWorldState();

  const walkGrass = (steps: number, seed: number) => {
    const r = createRng({ s: seed, calls: 0 });
    let position: PlayerPosition = { map: ROUTE, x: 5, y: 8, facing: "right" };
    let encounter: EncounterState = emptyEncounterState();
    let met = 0;
    for (let i = 0; i < steps; i += 1) {
      // 草むら (5..8, 8..9) の中を往復する。
      // 向きを変える入力は移動にならないので、1方向につき4入力ぶん続ける
      const dir: Direction = Math.floor(i / 4) % 2 === 0 ? "right" : "left";
      const result = stepPlayer(map, world, position, encounter, dir, r, allEncounterTables);
      position = result.position;
      encounter = result.encounter;
      if (result.outcome.kind === "encounter") met += 1;
    }
    return met;
  };

  it("直後の数歩では絶対に出ない（連続エンカウントの救済）", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const r = createRng({ s: seed, calls: 0 });
      let position: PlayerPosition = { map: ROUTE, x: 5, y: 8, facing: "right" };
      let encounter = emptyEncounterState();
      for (let i = 0; i < 5; i += 1) {
        const dir: Direction = "right";
        const result = stepPlayer(map, world, position, encounter, dir, r, allEncounterTables);
        position = result.position;
        encounter = result.encounter;
        expect(result.outcome.kind, `seed ${seed}`).not.toBe("encounter");
      }
    }
  });

  it("草むらを歩き続ければ必ず出会う", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(walkGrass(80, seed), `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it("実効遭遇率は設定値より低い（猶予歩数のぶん）", () => {
    // 設定は 12% だが、猶予5歩があるので実際は 7〜8% に落ちる。
    // 「設定値 = 体感値」ではないことをここで固定しておく
    const r = createRng({ s: 20260818, calls: 0 });
    let position: PlayerPosition = { map: ROUTE, x: 5, y: 8, facing: "up" };
    let encounter = emptyEncounterState();
    let moves = 0;
    let met = 0;
    let worst = 0;
    let since = 0;
    for (let i = 0; i < 40_000; i += 1) {
      const dir: Direction = Math.floor(i / 4) % 2 === 0 ? "right" : "left";
      const result = stepPlayer(map, world, position, encounter, dir, r, allEncounterTables);
      const walked = result.position.x !== position.x;
      position = result.position;
      encounter = result.encounter;
      if (walked) {
        moves += 1;
        since += 1;
        expect(position.x).toBeGreaterThanOrEqual(5);
        expect(position.x).toBeLessThanOrEqual(8);
      }
      if (result.outcome.kind === "encounter") {
        met += 1;
        worst = Math.max(worst, since);
        since = 0;
      }
    }
    const rate = met / moves;
    expect(rate).toBeGreaterThan(0.06);
    expect(rate).toBeLessThan(0.09);
    // pity が裾を切っている（救済なしなら 70 歩を超える）
    expect(worst).toBeLessThan(45);
  });

  /**
   * 測る対象は **`pickEncounter` の挙動**であって、特定の道路の中身ではない。
   * 以前ここは 1番道路を「50:50 の2件表」と決め打ちしていて、公式データを
   * 取り込んだ瞬間に落ちた ―― 通っていても意味が無い検査だった。
   * 比を測るなら比を作る。表は手で組む。
   */
  it("出現テーブルの抽選が rate の比に従う", () => {
    const table: EncounterTable = {
      id: "test-ratio",
      method: "grass",
      entries: [
        { species: "pidgey", levelRange: [2, 4], rate: 60 },
        { species: "rattata", levelRange: [3, 3], rate: 30 },
        { species: "caterpie", levelRange: [5, 7], rate: 10 },
      ],
    };
    const r = createRng({ s: 7, calls: 0 });
    const count: Record<string, number> = {};
    for (let i = 0; i < 8000; i += 1) {
      const picked = pickEncounter(table, r);
      count[picked.species] = (count[picked.species] ?? 0) + 1;
    }
    for (const entry of table.entries) {
      const ratio = (count[entry.species] ?? 0) / 8000;
      const want = entry.rate / 100;
      expect(Math.abs(ratio - want), entry.species).toBeLessThan(0.02);
    }
  });

  /**
   * 公式の表は **同じ種を複数のレベル帯で並べる**（1番道路のポッポは 2-2 / 3-3 / 4-4 / 5-5 の4件）。
   * だから「種で entry を1件引いてレベル帯を照らす」書き方は成り立たない。
   * 抽選結果は「**どれか**の entry と辻褄が合う」ことだけが言える。
   */
  it("抽選結果は必ずどれかの entry と辻褄が合う", () => {
    const r = createRng({ s: 11, calls: 0 });
    for (const table of allEncounterTables) {
      for (let i = 0; i < 50; i += 1) {
        const picked = pickEncounter(table, r);
        const ok = table.entries.some(
          (e) =>
            e.species === picked.species &&
            picked.level >= e.levelRange[0] &&
            picked.level <= e.levelRange[1],
        );
        expect(ok, `${table.id} / ${picked.species} Lv${picked.level}`).toBe(true);
      }
    }
  });
});

describe("野生バトルからの逃走", () => {
  it("野生戦でだけ「にげる」が選べる", () => {
    const wild = createBattle(
      gameData,
      [[{ species: "charmander", level: 5, moves: ["ember"] }],
       [{ species: "pidgey", level: 3, moves: ["tackle"] }]],
      1, { isWild: true },
    );
    expect(legalActions(gameData, wild, 0).some((a) => a.kind === "run")).toBe(true);
    // 相手（野生側）は逃げられない
    expect(legalActions(gameData, wild, 1).some((a) => a.kind === "run")).toBe(false);

    const trainer = createBattle(
      gameData,
      [[{ species: "charmander", level: 5, moves: ["ember"] }],
       [{ species: "pidgey", level: 3, moves: ["tackle"] }]],
      1,
    );
    expect(legalActions(gameData, trainer, 0).some((a) => a.kind === "run")).toBe(false);
  });

  it("素早さで上回っていれば必ず逃げきる", () => {
    let state = createBattle(
      gameData,
      [[{ species: "jolteon", level: 50, moves: ["thunderbolt"] }],
       [{ species: "slowpoke", level: 5, moves: ["tackle"] }]],
      1, { isWild: true },
    );
    const result = step(gameData, state, [{ kind: "run" }, { kind: "move", moveIndex: 0 }]);
    expect(result.events.some((e) => e.kind === "escaped")).toBe(true);
    expect(result.state.result).toEqual({ winner: null, reason: "escaped" });
    state = result.state;
  });

  it("失敗を重ねるほど逃げやすくなる", () => {
    const make = () =>
      createBattle(
        gameData,
        [[{ species: "slowpoke", level: 5, moves: ["tackle"] }],
         [{ species: "jolteon", level: 50, moves: ["thunderbolt"] }]],
        1, { isWild: true },
      );
    const successRate = (attempts: number) => {
      let ok = 0;
      for (let seed = 1; seed <= 200; seed += 1) {
        const state = { ...make(), runAttempts: attempts, rng: { s: seed, calls: 0 } };
        const result = step(gameData, state, [{ kind: "run" }, { kind: "move", moveIndex: 0 }]);
        if (result.events.some((e) => e.kind === "escaped")) ok += 1;
      }
      return ok / 200;
    };
    expect(successRate(4)).toBeGreaterThan(successRate(0));
  });
});

describe("イベント", () => {
  it("battle コマンドは必ずスクリプトの末尾にある（途中状態を作らないため）", () => {
    const tail = (list: readonly { kind: string }[], isTail: boolean, id: string): void => {
      list.forEach((command, i) => {
        const last = i === list.length - 1;
        if (command.kind === "battle") expect(isTail && last, id).toBe(true);
        const c = command as { then?: unknown[]; else?: unknown[]; options?: { then: unknown[] }[] };
        if (c.then !== undefined) tail(c.then as { kind: string }[], isTail && last, id);
        if (c.else !== undefined) tail(c.else as { kind: string }[], isTail && last, id);
        for (const option of c.options ?? []) {
          tail(option.then as { kind: string }[], isTail && last, id);
        }
      });
    };
    for (const event of allEvents) tail(event.commands, true, event.id);
  });

  it("setFlag でフラグが立ち、条件の評価が変わる", () => {
    const world = emptyWorldState();
    const cond = { kind: "flag", flag: "kanto.pallet.got-starter", value: true } as const;
    expect(evaluate(cond, world)).toBe(false);
    runEvent(world, "kanto.pallet.oak-lab");
    expect(evaluate(cond, world)).toBe(true);
  });

  it("選択肢の分岐が手持ちを変え、続きのコマンドは共通で流れる", () => {
    for (const [index, species] of [[0, "bulbasaur"], [1, "charmander"], [2, "squirtle"]] as const) {
      const world = emptyWorldState();
      const effects = runEvent(world, "kanto.pallet.oak-lab", () => index);
      expect(world.partySpecies).toEqual([species]);
      expect(world.flags["kanto.pallet.got-starter"]).toBe(true);
      // 選択肢のあとの共通の締めも実行される
      expect(texts(effects).some((t) => t.includes("よい えらびかた"))).toBe(true);
    }
  });

  it("選んだ1匹に応じて相手のトレーナーが変わる（hasSpecies 分岐）", () => {
    const expected = {
      0: "kanto-rival-charmander",
      1: "kanto-rival-squirtle",
      2: "kanto-rival-bulbasaur",
    } as const;
    for (const index of [0, 1, 2] as const) {
      const world = emptyWorldState();
      runEvent(world, "kanto.pallet.oak-lab", () => index);
      const effects = runEvent(world, "kanto.pallet.rival");
      const battle = effects.find((e) => e.kind === "battle");
      expect(battle, `選択 ${index}`).toBeDefined();
      if (battle?.kind !== "battle") throw new Error("battle のはず");
      expect(battle.trainer).toBe(expected[index]);
    }
  });

  it("フラグで別のNPCの反応が変わる（v0.7 の完了条件）", () => {
    const world = emptyWorldState();
    const before = texts(runEvent(world, "kanto.pallet.kid"));
    runEvent(world, "kanto.pallet.oak-lab");
    const after = texts(runEvent(world, "kanto.pallet.kid"));
    expect(before).not.toEqual(after);
    expect(after.join()).toContain("もらったんだって");
  });

  it("フラグでNPCそのものが消える", () => {
    const world = emptyWorldState();
    const town = mapById(TOWN);
    const present = () => visibleObjects(town, world).some((o) => o.id === "pallet-oak-blocker");
    expect(present()).toBe(true);
    runEvent(world, "kanto.pallet.oak-lab");
    expect(present()).toBe(false);
  });

  it("walkCommands は分岐の中まで辿る", () => {
    const kinds = walkCommands(eventById("kanto.pallet.oak-lab").commands).map((c) => c.kind);
    expect(kinds).toContain("if");
    expect(kinds).toContain("choice");
    // choice の枝の中にある givePokemon まで見えていること
    expect(kinds).toContain("givePokemon");
  });
});

describe("v0.7 の完了条件をひと続きで通す", () => {
  /**
   * 目的地まで最短で歩く。
   * **isWalkable と段差の一方通行だけを使って道を探す** ―― マップの中身は知らない。
   * 到達可能性の検証（tools/validate.ts）と同じ規則をここでも通ることになる。
   */
  function route(
    map: MapData,
    world: WorldState,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Direction[] {
    const key = (x: number, y: number) => `${x},${y}`;
    const steps: [Direction, number, number][] = [
      ["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0],
    ];
    const prev = new Map<string, { x: number; y: number; dir: Direction }>();
    const seen = new Set([key(from.x, from.y)]);
    const queue = [from];

    while (queue.length > 0) {
      const at = queue.shift()!;
      if (at.x === to.x && at.y === to.y) break;
      for (const [dir, dx, dy] of steps) {
        let nx = at.x + dx;
        let ny = at.y + dy;
        if (terrainAt(map, nx, ny) === "ledge") {
          if (dir !== "down") continue;
          nx += dx;
          ny += dy;
        }
        if (!isWalkable(map, world, nx, ny) || seen.has(key(nx, ny))) continue;
        seen.add(key(nx, ny));
        prev.set(key(nx, ny), { ...at, dir });
        queue.push({ x: nx, y: ny });
      }
    }

    const path: Direction[] = [];
    let cursor = to;
    while (!(cursor.x === from.x && cursor.y === from.y)) {
      const step = prev.get(key(cursor.x, cursor.y));
      if (step === undefined) throw new Error(`${map.id}: (${to.x},${to.y}) へ行けない`);
      path.unshift(step.dir);
      cursor = { x: step.x, y: step.y };
    }
    return path;
  }

  it("家 → 町 → 研究所 → 町 → 1番道路 で、遭遇まで到達できる", () => {
    const world = emptyWorldState();
    const r = createRng({ s: 999, calls: 0 });
    let position: PlayerPosition = { map: HOUSE, x: 3, y: 5, facing: "down" };
    let encounter: EncounterState = emptyEncounterState();
    const visited = new Set<string>([HOUSE]);
    let encountered: string | null = null;

    /** 経路をたどる。warp / 遭遇 に当たったらそこで止める。 */
    const goTo = (to: { x: number; y: number }): void => {
      const map = mapById(position.map);
      for (const dir of route(map, world, position, to)) {
        // 違う方向を向いているなら、まず向き直りに1入力使う
        for (const input of position.facing === dir ? [dir] : [dir, dir]) {
          const result = stepPlayer(
            map, world, position, encounter, input, r, allEncounterTables,
          );
          position = result.position;
          encounter = result.encounter;
          if (result.outcome.kind === "warp") {
            const { warp } = result.outcome;
            position = { map: warp.to.map, x: warp.to.x, y: warp.to.y, facing: warp.to.facing };
            encounter = emptyEncounterState();
            visited.add(position.map);
            return;
          }
          if (result.outcome.kind === "encounter") {
            encountered = result.outcome.species;
            return;
          }
        }
      }
    };

    const face = (dir: Direction) => {
      position = { ...position, facing: dir };
    };

    // 1. 家を出る（出口を踏むと町へ）
    goTo({ x: 3, y: 7 });
    expect(position.map).toBe(TOWN);

    // 2. 草むらへの道はオーキドに塞がれている
    goTo({ x: 5, y: 2 });
    expect(isWalkable(mapById(TOWN), world, 5, 1)).toBe(false);
    expect(objectAt(mapById(TOWN), world, 5, 1)?.id).toBe("pallet-oak-blocker");

    // 3. 研究所のドアを踏んで入る
    goTo({ x: 4, y: 9 });
    expect(position.map).toBe(LAB);
    visited.add(position.map);

    // 4. 最初の1匹を受け取る
    runEvent(world, "kanto.pallet.oak-lab", () => 1);
    expect(world.partySpecies).toEqual(["charmander"]);

    // 5. 町へ戻ると、道を塞いでいたオーキドは居ない
    goTo({ x: 4, y: 7 });
    expect(position.map).toBe(TOWN);
    expect(objectAt(mapById(TOWN), world, 5, 1)).toBeNull();
    expect(isWalkable(mapById(TOWN), world, 5, 1)).toBe(true);

    // 6. 1番道路へ抜ける
    goTo({ x: 5, y: 0 });
    expect(position.map).toBe(ROUTE);

    // 7. 草むらを歩いて遭遇する
    for (let i = 0; i < 200 && encountered === null; i += 1) {
      goTo(i % 2 === 0 ? { x: 8, y: 9 } : { x: 5, y: 8 });
    }
    expect(encountered).not.toBeNull();
    expect(["pidgey", "rattata"]).toContain(encountered);

    expect([...visited].sort()).toEqual([HOUSE, LAB, ROUTE, TOWN].sort());
  });
});

describe("トレーナーの視線（v0.12）", () => {
  const FOREST = "kanto-viridian-forest";

  const worldWithout = (...flags: string[]) => {
    const world = emptyWorldState();
    for (const flag of flags) world.flags[flag] = false;
    return world;
  };

  it("向いている先に立つと見つかる", () => {
    const map = mapById(FOREST);
    const world = worldWithout("kanto.forest.bug-1-beaten");
    const trainer = map.objects.find((o) => o.id === "forest-bug-1")!;
    expect(trainer.kind.type).toBe("trainer");

    // 真下（向いている方向）は見つかる
    expect(spotterAt(map, world, trainer.at.x, trainer.at.y + 1)?.id).toBe("forest-bug-1");
    // 真上（背中側）は見つからない
    expect(spotterAt(map, world, trainer.at.x, trainer.at.y - 1)).toBeNull();
    // 横も見つからない
    expect(spotterAt(map, world, trainer.at.x + 1, trainer.at.y)).toBeNull();
  });

  it("視線の長さを超えると見つからない", () => {
    const map = mapById(FOREST);
    const world = worldWithout("kanto.forest.bug-1-beaten");
    const trainer = map.objects.find((o) => o.id === "forest-bug-1")!;
    const sight = trainer.kind.type === "trainer" ? trainer.kind.sight : 0;
    expect(sight).toBeGreaterThan(0);
    expect(spotterAt(map, world, trainer.at.x, trainer.at.y + sight)?.id).toBe("forest-bug-1");
    expect(spotterAt(map, world, trainer.at.x, trainer.at.y + sight + 1)).toBeNull();
  });

  it("倒したトレーナーは見つけてこない（condition で消える）", () => {
    const map = mapById(FOREST);
    const trainer = map.objects.find((o) => o.id === "forest-bug-1")!;
    const beaten = emptyWorldState();
    beaten.flags["kanto.forest.bug-1-beaten"] = true;
    expect(spotterAt(map, beaten, trainer.at.x, trainer.at.y + 1)).toBeNull();
  });

  it("歩いて視線に入ると spotted が返る（野生より先）", () => {
    const map = mapById(FOREST);
    const world = worldWithout("kanto.forest.bug-1-beaten");
    const trainer = map.objects.find((o) => o.id === "forest-bug-1")!;

    // 視線の2マス先から1マス先へ踏み込む
    const from = { map: FOREST, x: trainer.at.x, y: trainer.at.y + 2, facing: "up" as Direction };
    const result = stepPlayer(
      map,
      world,
      from,
      emptyEncounterState(),
      "up",
      rng(),
      allEncounterTables,
    );
    expect(result.outcome.kind).toBe("spotted");
    if (result.outcome.kind === "spotted") {
      expect(result.outcome.object.id).toBe("forest-bug-1");
      expect(result.outcome.event).toBe("kanto.forest.bug-1");
    }
  });
});

describe("バッジ（v0.12）", () => {
  it("giveBadge は到達点。2回踏んでも増えない", () => {
    const world = emptyWorldState();
    runEvent(world, "kanto.pewter.brock-win");
    expect(world.badges).toBe(1);

    // **同じイベントを2回踏んでも増えない。** 増分ではなく到達点にしてあるため
    runEvent(world, "kanto.pewter.brock-win");
    expect(world.badges).toBe(1);
  });

  it("バッジの数はイベントの分岐に使える", () => {
    const world = emptyWorldState();
    expect(evaluate({ kind: "badges", op: ">=", count: 1 }, world)).toBe(false);
    runEvent(world, "kanto.pewter.brock-win");
    expect(evaluate({ kind: "badges", op: ">=", count: 1 }, world)).toBe(true);
  });
});

describe("トレーナー", () => {
  it("全トレーナーの手持ちがバトルに投入できる", () => {
    for (const trainer of allTrainers) {
      const state = createBattle(
        gameData,
        [[{ species: "pikachu", level: 5, moves: ["thunder-shock"] }], trainer.party],
        1,
      );
      for (const mon of state.sides[1].party) {
        expect(Number.isFinite(mon.maxHp), `${trainer.id}/${mon.name}`).toBe(true);
        expect(mon.currentHp, `${trainer.id}/${mon.name}`).toBeGreaterThan(0);
      }
    }
  });
});

/** 条件の中に出てくるフラグ。 */
function flagsIn(cond: Condition): string[] {
  if (cond.kind === "flag") return [cond.flag];
  if (cond.kind === "and" || cond.kind === "or") return cond.of.flatMap(flagsIn);
  return [];
}

describe("フィールド技（v0.12-d）", () => {
  const VERMILION = "kanto-vermilion-city";
  const FUCHSIA = "kanto-fuchsia-city";

  /** 条件をぜんぶ満たした世界。フィールド技は派生値なので毎回導き直す。 */
  const worldWith = (badges: number, flags: string[]): WorldState => {
    const world = emptyWorldState();
    world.badges = badges;
    for (const flag of flags) world.flags[flag] = true;
    syncAbilities(allFieldAbilities, world);
    return world;
  };

  it("能力はフラグとバッジの両方が揃って初めて使える", () => {
    expect(worldWith(9, []).abilities).toEqual([]);
    expect(worldWith(0, ["kanto.ability.cut"]).abilities).toEqual([]);
    expect(worldWith(2, ["kanto.ability.cut"]).abilities).toEqual(["cut"]);
  });

  it("いあいぎり を覚えるまで クチバジムの前の き は通れない", () => {
    const map = mapById(VERMILION);
    const before = worldWith(2, []);
    expect(isWalkable(map, before, 5, 10)).toBe(false);

    // 調べると「どければ通れる」ことと、何が要るかが返る
    const found = interact(map, before, { map: VERMILION, x: 5, y: 11, facing: "up" });
    expect(found?.kind).toBe("obstacle");
    if (found?.kind === "obstacle") expect(found.ability).toBe("cut");

    const after = worldWith(2, ["kanto.ability.cut"]);
    // **能力があるだけでは消えない。** どけて初めて通れる
    expect(isWalkable(map, after, 5, 10)).toBe(false);
    after.cleared.push(objectKey(VERMILION, objectAt(map, after, 5, 10)!));
    expect(isWalkable(map, after, 5, 10)).toBe(true);
  });

  it("どけた記録はマップIDまで含む（別の町の同名オブジェクトを巻き込まない）", () => {
    const map = mapById(FUCHSIA);
    const world = worldWith(4, ["kanto.ability.strength"]);
    world.cleared.push("kanto-somewhere-else:fuchsia-boulder");
    expect(isWalkable(map, world, 10, 5)).toBe(false);
    world.cleared.push(objectKey(FUCHSIA, objectAt(map, world, 10, 5)!));
    expect(isWalkable(map, world, 10, 5)).toBe(true);
  });

  it("なみのり を覚えると水の上に出られる", () => {
    const map = mapById(VERMILION);
    expect(terrainAt(map, 6, 11)).toBe("water");
    expect(isWalkable(map, worldWith(5, []), 6, 11)).toBe(false);
    expect(isWalkable(map, worldWith(5, ["kanto.ability.surf"]), 6, 11)).toBe(true);
    // 壁は なみのり でも越えられない
    expect(isWalkable(map, worldWith(5, ["kanto.ability.surf"]), 0, 11)).toBe(false);
  });

  it("水の上で引く表は なみのり用（地形が方式を決める）", () => {
    const map = mapById(VERMILION);
    expect(tableForTerrain(map, "water", allEncounterTables)?.method).toBe("surf");
    // 同じマップの草むら用の表は無いので、陸では何も出ない
    expect(tableForTerrain(map, "grass", allEncounterTables)).toBe(null);
  });

  /**
   * v1.1-c で `tableFor` は**引き方**で引くようになった（地形ではなく）。
   * 釣りは地形が同じ「水」でも、さおによって出る表が違う。
   */
  it("同じ水面でも、さおの種類で別の表を引く", () => {
    const map = mapById(VERMILION);
    const old = tableFor(map, "fishing-old", allEncounterTables);
    const sup = tableFor(map, "fishing-super", allEncounterTables);
    expect(old).not.toBe(null);
    expect(sup).not.toBe(null);
    expect(old!.id).not.toBe(sup!.id);
  });

  it("障害物に使う技は、必ずどこかで手に入る", () => {
    const granted = new Set(
      allEvents.flatMap((e) =>
        walkCommands(e.commands).flatMap((c) =>
          c.kind === "setFlag" && c.value ? [c.flag] : [],
        ),
      ),
    );
    const used = new Set(
      allMaps.flatMap((m) =>
        m.objects.flatMap((o) => (o.kind.type === "obstacle" ? [o.kind.clearedBy] : [])),
      ),
    );
    expect(used.size).toBeGreaterThan(0);
    for (const id of used) {
      const ability = allFieldAbilities.find((a) => a.id === id)!;
      const flags = flagsIn(ability.requires);
      expect(flags.length, id).toBeGreaterThan(0);
      for (const flag of flags) expect(granted.has(flag), `${id}: ${flag}`).toBe(true);
    }
  });
});

describe("そらをとぶ（v0.12-d）", () => {
  it("行き先は立てるマスで、来れば必ず開く", () => {
    const points = allMaps.filter((m) => m.flyPoint !== undefined);
    expect(points.length).toBeGreaterThanOrEqual(9);
    for (const map of points) {
      const point = map.flyPoint!;
      const world = emptyWorldState();
      expect(isWalkable(map, world, point.x, point.y), map.id).toBe(true);

      // **来たら開く**ことまで見る。座標だけ見ていると、
      // 行き先として並ぶのに一生選べないマップが作れてしまう
      expect(map.onEnter, map.id).toBeDefined();
      runEvent(world, map.onEnter!);
      expect(world.flags[point.flag], map.id).toBe(true);
    }
  });
});

describe("カントーの地図（v0.12-e）", () => {
  /** 踏む warp を辿って、その世界で行けるマップを全部あげる。 */
  function walkableMaps(world: WorldState): Set<string> {
    const start = { map: "kanto-pallet-town", x: 5, y: 5 };
    const key = (m: string, x: number, y: number) => `${m}|${x},${y}`;
    const seen = new Set([key(start.map, start.x, start.y)]);
    const maps = new Set([start.map]);
    const queue = [start];
    while (queue.length > 0) {
      const here = queue.shift()!;
      const map = mapById(here.map);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        let nx = here.x + dx;
        let ny = here.y + dy;
        if (terrainAt(map, nx, ny) === "ledge") {
          if (dy !== 1) continue;
          nx += dx;
          ny += dy;
        }
        if (!isWalkable(map, world, nx, ny)) continue;
        const warp = map.warps.find((w) => w.at.x === nx && w.at.y === ny && w.trigger === "step");
        const next =
          warp === undefined
            ? { map: here.map, x: nx, y: ny }
            : { map: warp.to.map, x: warp.to.x, y: warp.to.y };
        const id = key(next.map, next.x, next.y);
        if (seen.has(id)) continue;
        seen.add(id);
        maps.add(next.map);
        queue.push(next);
      }
    }
    return maps;
  }

  /** 進行を全部開けた世界（オブジェクトの条件で塞がれないようにする）。 */
  const opened = (abilities: string[]): WorldState => {
    const world = emptyWorldState();
    world.badges = 8;
    for (const flag of allFlags) world.flags[flag] = true;
    syncAbilities(allFieldAbilities, world);
    const kept = world.abilities.filter((a) => abilities.includes(a));
    // 能力を削ったら、通れる地形も導き直す（派生値は片方だけ持たない）
    return { ...world, abilities: kept, walkable: walkableTerrains(allFieldAbilities, kept) };
  };

  it("**一直線ではない** ―― 21番水道で輪になっている", () => {
    const kanto = allMaps.filter((m) => m.region === "kanto");
    const ids = new Set(kanto.map((m) => m.id));
    const pairs = new Set<string>();
    for (const map of kanto) {
      for (const warp of map.warps) {
        if (!ids.has(warp.to.map) || warp.to.map === map.id) continue;
        pairs.add([map.id, warp.to.map].sort().join("|"));
      }
    }
    // 木なら「辺 = 頂点 - 1」。これを超えたぶんが閉路の数
    expect(pairs.size).toBeGreaterThan(kanto.length - 1);
  });

  it("グレンじまへは なみのり が無いと行けない", () => {
    const withoutSurf = walkableMaps(opened(["cut", "strength", "rockSmash"]));
    expect(withoutSurf.has("kanto-viridian-city")).toBe(true);
    expect(withoutSurf.has("kanto-cinnabar-island")).toBe(false);

    const withSurf = walkableMaps(opened(["cut", "strength", "rockSmash", "surf"]));
    expect(withSurf.has("kanto-cinnabar-island")).toBe(true);
    // 輪が閉じる ―― グレンから 21番水道 でマサラへ戻れる
    expect(withSurf.has("kanto-route-21")).toBe(true);
  });
});

describe("ポケモンリーグ（v0.12-f）", () => {
  const ROOMS = [
    "kanto-league-lorelei",
    "kanto-league-bruno",
    "kanto-league-agatha",
    "kanto-league-lance",
    "kanto-league-champion",
  ];

  it("**入ったら戻れない** ―― 部屋から前へ戻る warp が無い", () => {
    const previous = ["kanto-indigo-plateau", ...ROOMS];
    ROOMS.forEach((id, i) => {
      const room = mapById(id);
      expect(
        room.warps.some((w) => w.to.map === previous[i]),
        id,
      ).toBe(false);
    });
  });

  it("次の扉は、勝つまで開かない", () => {
    for (const id of ROOMS.slice(0, -1)) {
      const room = mapById(id);
      const door = room.warps.find((w) => w.trigger === "step")!;
      const beaten = emptyWorldState();
      const before = emptyWorldState();
      // 勝つ前は扉のオブジェクトが乗っていて踏めない
      expect(isWalkable(room, before, door.at.x, door.at.y), id).toBe(false);
      // 勝つと消える
      const blocker = room.objects.find((o) => o.at.x === door.at.x && o.at.y === door.at.y)!;
      expect(blocker.condition?.kind, id).toBe("flag");
      if (blocker.condition?.kind === "flag") beaten.flags[blocker.condition.flag] = true;
      expect(isWalkable(room, beaten, door.at.x, door.at.y), id).toBe(true);
    }
  });

  it("チャンピオンロードは かいりき が無いと抜けられない", () => {
    const road = mapById("kanto-victory-road");
    const boulder = road.objects.find((o) => o.kind.type === "obstacle" && o.kind.clearedBy === "strength");
    expect(boulder).toBeDefined();
    // 岩をどけるまで、北の出口へ続く道が塞がっている
    const world = emptyWorldState();
    expect(isWalkable(road, world, boulder!.at.x, boulder!.at.y)).toBe(false);
    world.cleared.push(objectKey(road.id, boulder!));
    expect(isWalkable(road, world, boulder!.at.x, boulder!.at.y)).toBe(true);
  });
});

/**
 * フィールド行動（v1.1-c）。
 *
 * v0.12-d の5つは**どれも「障害物をどける」**だったので、
 * 「何をする能力か」という欄が要らなかった。釣りと探知が入って初めて要る。
 * ここで確かめたいのは効果ではなく、**能力を1つ足すのがデータ1件で済む**こと。
 */
describe("フィールド行動（v1.1-c）", () => {
  const VERMILION = "kanto-vermilion-city";
  const mapOf = (id: string) => allMaps.find((m) => m.id === id)!;

  /**
   * 道具を持った世界。
   *
   * **フラグは立てない。** 全部立てると「もう拾った」フラグまで立ってしまい、
   * 隠しアイテムが条件で消える（実際そうしてテストが落ちた）。
   * 能力の鍵が道具だけのもの（さお・ダウジングマシン）はこれで足りる。
   */
  const withItems = (items: string[], flags: string[] = [], badges = 8): WorldState => {
    const world = emptyWorldState();
    world.badges = badges;
    for (const flag of flags) world.flags[flag] = true;
    for (const item of items) world.bag[item] = 1;
    syncAbilities(allFieldAbilities, world);
    return world;
  };

  it("さおを持っていないと、水を調べても何も起きない", () => {
    const map = mapOf(VERMILION);
    const world = withItems([]);
    // (6,11) は水。**能力が無いので調べても null**
    expect(terrainAt(map, 6, 11)).toBe("water");
    const found = interact(map, world, { map: VERMILION, x: 6, y: 10, facing: "down" }, allFieldAbilities);
    expect(found).toBe(null);
  });

  it("さおを持つと、水を調べて釣りになる", () => {
    const map = mapOf(VERMILION);
    const world = withItems(["old-rod"]);
    const found = interact(map, world, { map: VERMILION, x: 6, y: 10, facing: "down" }, allFieldAbilities);
    expect(found?.kind).toBe("field");
    if (found?.kind !== "field") return;
    expect(found.action).toEqual({ kind: "encounter", method: "fishing-old" });
  });

  /**
   * **良いさおが先に当たる。** 選ばせないのは原作にも無い操作だから
   * （選択肢が1つ増えるたびに歩みが遅くなる）。
   */
  it("さおを3本持っていたら、いちばん良いものを使う", () => {
    const map = mapOf(VERMILION);
    const world = withItems(["old-rod", "good-rod", "super-rod"]);
    const found = interact(map, world, { map: VERMILION, x: 6, y: 10, facing: "down" }, allFieldAbilities);
    if (found?.kind !== "field") throw new Error("釣りにならなかった");
    expect(found.action).toEqual({ kind: "encounter", method: "fishing-super" });
  });

  it("陸を調べても釣りにはならない", () => {
    const map = mapOf(VERMILION);
    const world = withItems(["super-rod"]);
    const found = interact(map, world, { map: VERMILION, x: 6, y: 7, facing: "up" }, allFieldAbilities);
    expect(found?.kind).not.toBe("field");
  });

  /**
   * 隠しアイテムは `visibleObjects()` の1箇所で消える。
   * **描画・踏みつけ・視線が勝手に揃う**（v0.12-d の障害物と同じ場所）。
   */
  it("隠しアイテムは見えないし、踏んでも起きない", () => {
    const map = allMaps.find((m) => m.objects.some((o) => o.kind.type === "item" && o.kind.hidden))!;
    const buried = map.objects.find((o) => o.kind.type === "item" && o.kind.hidden)!;
    const world = withItems([]);
    expect(visibleObjects(map, world).some((o) => o.id === buried.id)).toBe(false);
    expect(objectAt(map, world, buried.at.x, buried.at.y)).toBe(null);
  });

  it("探す能力があれば、調べて見つかる", () => {
    const map = allMaps.find((m) => m.objects.some((o) => o.kind.type === "item" && o.kind.hidden))!;
    const buried = map.objects.find((o) => o.kind.type === "item" && o.kind.hidden)!;

    const at = { map: map.id, x: buried.at.x, y: buried.at.y + 1, facing: "up" as const };
    expect(interact(map, withItems([]), at, allFieldAbilities)).toBe(null);

    const found = interact(map, withItems(["itemfinder"]), at, allFieldAbilities);
    expect(found?.kind).toBe("field");
    if (found?.kind !== "field") return;
    expect(found.action).toEqual({ kind: "reveal" });
    expect(found.object?.id).toBe(buried.id);
  });

  /**
   * v0.12-d は `canSwimTo` に `"water"` と `"surf"` を**直接書いていた。**
   * 地形と能力の対応はデータにしかないので、派生値から引くようにした。
   */
  it("なみのり で通れる地形は、データから導かれる", () => {
    expect(withItems([], ["kanto.ability.surf"]).walkable).toEqual(["water"]);
    const surf = allFieldAbilities.find((a) => a.id === "surf")!;
    expect(surf.effect).toEqual({ kind: "walk", terrain: "water" });
  });

  it("能力を持っていなければ、通れる地形も無い", () => {
    const world = emptyWorldState();
    syncAbilities(allFieldAbilities, world);
    expect(world.walkable).toEqual([]);
  });
});

/**
 * 押せる岩とスイッチ（v1.1-f）。
 *
 * この版で初めて**世界が動く**。今までの「消える」（`cleared`・隠しアイテム）は
 * どこへ消えたかを持たなくてよかったが、岩は行き先を持つ。
 * 確かめたいのは押した結果そのものより、
 * **`world.moved` を1箇所差し替えるだけで、当たり判定・描画・視線が揃う**こと。
 */
describe("押せる岩とスイッチ（v1.1-f）", () => {
  const ROAD_2F = "kanto-victory-road-2f";
  const mapOf = (id: string) => allMaps.find((m) => m.id === id)!;

  /** かいりき が使える世界。 */
  const able = (): WorldState => {
    const world = emptyWorldState();
    world.abilities = ["strength"];
    return world;
  };

  const boulderOf = (map: MapData) => map.objects.find((o) => o.kind.type === "boulder")!;
  const switchOf = (map: MapData) => map.objects.find((o) => o.kind.type === "switch")!;

  /** 岩の左隣に立ち、右を向いた状態。 */
  const leftOf = (map: MapData): PlayerPosition => {
    const b = boulderOf(map);
    return { map: map.id, x: b.at.x - 1, y: b.at.y, facing: "right" };
  };

  it("岩を押すと、岩とプレイヤーが1マスずつ動く", () => {
    const map = mapOf(ROAD_2F);
    const world = able();
    const boulder = boulderOf(map);
    const result = stepPlayer(map, world, leftOf(map), emptyEncounterState(), "right", rng(), []);

    expect(result.outcome.kind).toBe("pushed");
    if (result.outcome.kind !== "pushed") return;
    // 岩は1マス先へ、プレイヤーは岩の居たマスへ
    expect(result.outcome.to).toEqual({ x: boulder.at.x + 1, y: boulder.at.y });
    expect({ x: result.position.x, y: result.position.y }).toEqual(boulder.at);
  });

  it("かいりき が無いと押せない ―― ただの壁として振る舞う", () => {
    const map = mapOf(ROAD_2F);
    const world = emptyWorldState();
    const result = stepPlayer(map, world, leftOf(map), emptyEncounterState(), "right", rng(), []);
    expect(result.outcome.kind).toBe("blocked");
    expect(result.position).toEqual(leftOf(map));
  });

  it("押した先が壁なら押せない", () => {
    const map = mapOf(ROAD_2F);
    const world = able();
    const boulder = boulderOf(map);
    // 岩の上（北）は部屋の壁。北へ押そうとすると南に立つことになる
    const below: PlayerPosition = { map: map.id, x: boulder.at.x, y: boulder.at.y + 1, facing: "up" };
    const result = stepPlayer(map, world, below, emptyEncounterState(), "up", rng(), []);
    expect(result.outcome.kind).toBe("blocked");
  });

  it("`world.moved` を書くと、当たり判定・描画・調べる がまとめて追従する", () => {
    const map = mapOf(ROAD_2F);
    const world = able();
    const boulder = boulderOf(map);
    const to = { x: boulder.at.x + 1, y: boulder.at.y };

    // 押す前: 岩の居るマスに入れず、隣は入れる
    expect(isWalkable(map, world, boulder.at.x, boulder.at.y)).toBe(false);
    expect(isWalkable(map, world, to.x, to.y)).toBe(true);

    world.moved[objectKey(map.id, boulder)] = to;

    // 押したあと: **1箇所しか書いていないのに両方が入れ替わる**
    expect(isWalkable(map, world, boulder.at.x, boulder.at.y)).toBe(true);
    expect(isWalkable(map, world, to.x, to.y)).toBe(false);
    expect(objectAt(map, world, to.x, to.y)?.id).toBe(boulder.id);
    expect(visibleObjects(map, world).find((o) => o.id === boulder.id)?.at).toEqual(to);
  });

  it("元データは書き換わらない ―― 同じマップを2回読んでも岩は戻る", () => {
    const map = mapOf(ROAD_2F);
    const world = able();
    const boulder = boulderOf(map);
    const start = { ...boulder.at };
    world.moved[objectKey(map.id, boulder)] = { x: boulder.at.x + 1, y: boulder.at.y };
    visibleObjects(map, world);
    expect(boulderOf(mapOf(ROAD_2F)).at).toEqual(start);
    // 出入りすれば元の位置（`moved` は保存しない派生値）
    expect(visibleObjects(map, emptyWorldState()).find((o) => o.id === boulder.id)?.at).toEqual(start);
  });

  it("スイッチは床 ―― 通行も視線も妨げない", () => {
    const map = mapOf(ROAD_2F);
    const sw = switchOf(map);
    expect(isWalkable(map, able(), sw.at.x, sw.at.y)).toBe(true);
  });

  it("岩をスイッチまで押し切ると、イベントが返る", () => {
    const map = mapOf(ROAD_2F);
    const world = able();
    const sw = switchOf(map);
    let position = leftOf(map);
    let last: ReturnType<typeof stepPlayer> | null = null;

    // 岩がスイッチに乗るまで、同じ入力を繰り返す
    for (let i = 0; i < 8; i += 1) {
      const result = stepPlayer(map, world, position, emptyEncounterState(), "right", rng(), []);
      if (result.outcome.kind !== "pushed") break;
      world.moved[objectKey(map.id, result.outcome.object)] = result.outcome.to;
      position = result.position;
      last = result;
      if (result.outcome.event !== undefined) break;
    }

    expect(last?.outcome.kind).toBe("pushed");
    if (last?.outcome.kind !== "pushed") return;
    expect(last.outcome.to).toEqual(sw.at);
    // **スイッチに乗ったときだけイベントが付く**（途中の1歩には付かない）
    expect(last.outcome.event).toBe(sw.event);
  });

  it("スイッチのイベントはフラグを立て、シャッターが消える", () => {
    const map = mapOf(ROAD_2F);
    const sw = switchOf(map);
    const shutter = map.objects.find((o) => o.kind.type === "sign" && o.condition !== undefined)!;
    const world = able();

    expect(isWalkable(map, world, shutter.at.x, shutter.at.y)).toBe(false);

    // スイッチのイベントを最後まで流す
    let runner = startEvent(allEvents.find((e) => e.id === sw.event)!.commands);
    for (let i = 0; i < 20 && !runner.done; i += 1) runner = stepEvent(runner, world).runner;

    expect(isWalkable(map, world, shutter.at.x, shutter.at.y)).toBe(true);
  });
});

/**
 * ジムの仕掛け3つ（v1.1-g）。
 *
 * **どれも新しい概念を1つも足していない。** 見えない壁は凡例、
 * クイズ扉は `choice` + `setFlag` + 条件つきオブジェクト、
 * テレポート床は `Warp.to.map` に自分自身。
 * ここで確かめたいのは仕掛けの中身より、**既存の型でちゃんと成立している**こと。
 */
describe("ジムの仕掛け（v1.1-g）", () => {
  const mapOf = (id: string) => allMaps.find((m) => m.id === id)!;
  const able = (): WorldState => {
    const world = emptyWorldState();
    world.abilities = [...FIELD_ABILITIES];
    return world;
  };

  /** そのマップの中だけを、warp を辿らずに塗る。 */
  const floodFrom = (map: MapData, world: WorldState, from: { x: number; y: number }) => {
    const seen = new Set([`${from.x},${from.y}`]);
    const stack = [from];
    while (stack.length > 0) {
      const here = stack.pop()!;
      for (const next of neighborsOf(map, world, here.x, here.y, {}, undefined)) {
        const key = `${next.x},${next.y}`;
        if (next.map !== map.id || seen.has(key)) continue;
        seen.add(key);
        stack.push({ x: next.x, y: next.y });
      }
    }
    return seen;
  };

  it("見えない壁は、床として描かれるのに通れない", () => {
    const gym = mapOf("kanto-fuchsia-gym");
    const world = able();
    // 見えない壁のマスは「地形は normal」なのに通れない ――
    // 描画は地形と凡例の文字を見るので、**規則と見た目が食い違っている**のが正しい
    const hidden: { x: number; y: number }[] = [];
    for (let y = 0; y < gym.size.height; y += 1) {
      for (let x = 0; x < gym.size.width; x += 1) {
        if (gym.layers.ground[y * gym.size.width + x] === "I") hidden.push({ x, y });
      }
    }
    expect(hidden.length).toBeGreaterThan(10);
    for (const at of hidden) {
      expect(terrainAt(gym, at.x, at.y), `${at.x},${at.y}`).toBe("normal");
      expect(isWalkable(gym, world, at.x, at.y), `${at.x},${at.y}`).toBe(false);
    }
  });

  it("見えない壁は迷路として効いている ―― まっすぐは行けない", () => {
    const gym = mapOf("kanto-fuchsia-gym");
    const door = gym.warps.find((w) => w.trigger === "step")!;
    const koga = gym.objects.find((o) => o.id === "fuchsia-koga")!;
    const start = { x: door.at.x, y: door.at.y - 1 };

    // 最短距離を測る。壁があるぶん、直線距離より必ず長くなる
    const steps = (world: WorldState): number => {
      const dist = new Map([[`${start.x},${start.y}`, 0]]);
      const queue = [start];
      while (queue.length > 0) {
        const here = queue.shift()!;
        const d = dist.get(`${here.x},${here.y}`)!;
        for (const next of neighborsOf(gym, world, here.x, here.y, {}, undefined)) {
          const key = `${next.x},${next.y}`;
          if (next.map !== gym.id || dist.has(key)) continue;
          dist.set(key, d + 1);
          queue.push({ x: next.x, y: next.y });
        }
      }
      // キョウの隣まで（本人のマスには立てない）
      return Math.min(
        ...[[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => dist.get(`${koga.at.x + dx!},${koga.at.y + dy!}`))
          .filter((d): d is number => d !== undefined),
      );
    };

    const straight = Math.abs(koga.at.x - start.x) + Math.abs(koga.at.y - start.y);
    expect(steps(able())).toBeGreaterThan(straight);
  });

  it("クイズ扉は、正解のフラグが立つまで道を塞ぐ", () => {
    const gym = mapOf("kanto-cinnabar-gym");
    const gates = gym.objects.filter((o) => o.id.startsWith("cinnabar-quiz-"));
    expect(gates.length).toBe(3);

    const world = able();
    for (const gate of gates) {
      expect(isWalkable(gym, world, gate.at.x, gate.at.y), gate.id).toBe(false);
      // 正解のイベントを最後まで流すと開く（分岐の1本目＝○が正解とは限らない）
      const event = allEvents.find((e) => e.id === gate.event)!;
      const choice = event.commands.find((c) => c.kind === "choice")!;
      if (choice.kind !== "choice") continue;
      const right = choice.options.find((o) =>
        o.then.some((c) => c.kind === "setFlag"),
      )!;
      let runner = startEvent(right.then);
      for (let i = 0; i < 20 && !runner.done; i += 1) runner = stepEvent(runner, world).runner;
      expect(isWalkable(gym, world, gate.at.x, gate.at.y), gate.id).toBe(true);
    }
  });

  it("テレポート床は、踏まないと部屋から出られない", () => {
    const gym = mapOf("kanto-saffron-gym");
    const panels = gym.warps.filter((w) => w.trigger === "step" && w.to.map === gym.id);
    expect(panels.length).toBeGreaterThan(8);

    // 入口の部屋から歩けるのは、その部屋のぶんだけ
    const door = gym.warps.find((w) => w.to.map !== gym.id)!;
    const inside = floodFrom(gym, able(), { x: door.at.x, y: door.at.y - 1 });
    let walkable = 0;
    for (let y = 0; y < gym.size.height; y += 1) {
      for (let x = 0; x < gym.size.width; x += 1) {
        if (isWalkable(gym, able(), x, y)) walkable += 1;
      }
    }
    expect(inside.size).toBeLessThan(walkable);
  });

  it("テレポート床を辿ると ナツメ の部屋に着く", () => {
    const gym = mapOf("kanto-saffron-gym");
    const sabrina = gym.objects.find((o) => o.id === "saffron-sabrina")!;
    const door = gym.warps.find((w) => w.to.map !== gym.id)!;
    const world = able();

    // warp を辿る探索（`neighborsOf` の既定）。同じマップの中を飛ぶ
    const byId = new Map([[gym.id, gym]]);
    const start = { x: door.at.x, y: door.at.y - 1 };
    const seen = new Set([`${start.x},${start.y}`]);
    const stack = [start];
    while (stack.length > 0) {
      const here = stack.pop()!;
      for (const next of neighborsOf(gym, world, here.x, here.y, {}, byId)) {
        const key = `${next.x},${next.y}`;
        if (next.map !== gym.id || seen.has(key)) continue;
        seen.add(key);
        stack.push({ x: next.x, y: next.y });
      }
    }
    // ナツメの隣に立てる
    expect(seen.has(`${sabrina.at.x},${sabrina.at.y + 1}`)).toBe(true);
  });
});
