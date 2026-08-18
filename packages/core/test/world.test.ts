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
  interact,
  isWalkable,
  legalActions,
  objectAt,
  pickEncounter,
  startEvent,
  step,
  stepEvent,
  stepPlayer,
  terrainAt,
  visibleObjects,
  walkCommands,
  type Direction,
  type EncounterState,
  type EventEffect,
  type MapData,
  type PlayerPosition,
  type WorldState,
} from "../src/index.js";
import {
  allEncounterTables,
  allEvents,
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

    // 町側からドアを調べると家に戻る
    const town = mapById(TOWN);
    const back = interact(town, world, { map: TOWN, x: 3, y: 5, facing: "up" });
    expect(back?.kind).toBe("warp");
    if (back?.kind !== "warp") throw new Error("warp のはず");
    expect(back.warp.to.map).toBe(HOUSE);
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

  it("出現テーブルの抽選が rate の比に従う", () => {
    const table = allEncounterTables.find((t) => t.id === "kanto-route-1-grass")!;
    const r = createRng({ s: 7, calls: 0 });
    const count: Record<string, number> = {};
    for (let i = 0; i < 4000; i += 1) {
      const picked = pickEncounter(table, r);
      count[picked.species] = (count[picked.species] ?? 0) + 1;
      const entry = table.entries.find((e) => e.species === picked.species)!;
      expect(picked.level).toBeGreaterThanOrEqual(entry.levelRange[0]);
      expect(picked.level).toBeLessThanOrEqual(entry.levelRange[1]);
    }
    // 50:50 のテーブル。4000 回なら 45%〜55% に収まる
    for (const entry of table.entries) {
      const ratio = (count[entry.species] ?? 0) / 4000;
      expect(ratio, entry.species).toBeGreaterThan(0.45);
      expect(ratio, entry.species).toBeLessThan(0.55);
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

    // 3. 研究所のドアを調べて入る
    goTo({ x: 4, y: 10 });
    face("up");
    const door = interact(mapById(TOWN), world, position);
    expect(door?.kind).toBe("warp");
    if (door?.kind !== "warp") throw new Error("ドアのはず");
    position = { ...door.warp.to };
    visited.add(position.map);
    expect(position.map).toBe(LAB);

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
