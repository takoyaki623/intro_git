/**
 * セーブ（v0.5 で最小、v0.9 で完成）。
 *
 * v0.5 で保存するのは BP と施設の記録だけだったが、
 * **抽象化とマイグレーションの鎖はそのときに作った** ―― 後から挟めないため。
 * v0.9 で世界の状態が入り、鎖は2本目になった。
 * 設計: docs/design/save-data.md §2・§5 / docs/game-plan.md §8.3 論点1
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  createMemorySaveStore,
  emptySave,
  exportSave,
  importSave,
  migrate,
  recordCupWin,
  recordRun,
  resolveCommonBox,
  resolveParty,
  sendToCommonBox,
  storeCommonBox,
  storeParty,
  summarize,
  type PokemonInstance,
} from "@pkmn/core";

describe("セーブの読み書き", () => {
  it("保存したものがそのまま読める", async () => {
    const store = createMemorySaveStore();
    const data = recordRun(emptySave(), "battle-tower", { streak: 7, wins: 7, bp: 20 });
    await store.save(0, data);

    const loaded = await store.load(0);
    expect(loaded?.global.bp).toBe(20);
    expect(loaded?.global.endgame.facilityRecords["battle-tower"]?.bestStreak).toBe(7);
  });

  it("何も保存していないスロットは null", async () => {
    const store = createMemorySaveStore();
    expect(await store.load(3)).toBeNull();
  });

  it("最高連勝は負けても更新されない（下がらない）", () => {
    let data = recordRun(emptySave(), "battle-tower", { streak: 12, wins: 12, bp: 40 });
    data = recordRun(data, "battle-tower", { streak: 3, wins: 3, bp: 6 });
    const record = data.global.endgame.facilityRecords["battle-tower"]!;
    expect(record.bestStreak).toBe(12);
    expect(record.totalWins).toBe(15);
    expect(data.global.bp).toBe(46);
  });
});

describe("マイグレーション", () => {
  it("v1 のセーブが最新版へ引き上がる（鎖が実際に動く）", () => {
    // v0.5 で「空のまま形だけ」作っておいたマイグレーションが、v0.6 で初めて走る。
    const v1 = {
      schemaVersion: 1,
      global: { bp: 12, endgame: { facilityRecords: { "battle-tower": { bestStreak: 5, totalWins: 5, earnedBp: 12 } } } },
      settings: { battleSpeed: "fast" },
    };
    const migrated = migrate(v1);
    expect(migrated?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // 既存の記録は失われない
    expect(migrated?.global.bp).toBe(12);
    expect(migrated?.global.endgame.facilityRecords["battle-tower"]?.bestStreak).toBe(5);
    expect(migrated?.settings.battleSpeed).toBe("fast");
    // 新しい入れ物が空で足される
    expect(migrated?.global.endgame.tournamentRecords).toEqual({});
    expect(migrated?.regions).toEqual({});
    expect(migrated?.pokemon).toEqual({});
    expect(migrated?.settings.lossPenalty).toBe("none");
    expect(migrated?.global.boxUids).toEqual([]);
    expect(migrated?.settings.artSource).toBe("drawn");
  });

  it("施設の記録を書いてもトーナメントの記録が消えない", () => {
    let data = recordCupWin(emptySave(), "kanto-cup", "original", 15);
    data = recordRun(data, "battle-tower", { streak: 3, wins: 3, bp: 6 });
    expect(data.global.endgame.tournamentRecords["kanto-cup"]?.clearedTiers).toEqual(["original"]);
    expect(data.global.bp).toBe(21);
  });

  it("現在の版はそのまま通る", () => {
    const data = emptySave();
    expect(migrate(JSON.parse(JSON.stringify(data)))?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("未来の版は読まずに拒否する（壊すより読めない方がよい）", () => {
    expect(migrate({ ...emptySave(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toBeNull();
  });

  it("壊れたデータでも進行不能にならない", () => {
    expect(migrate(null)).toBeNull();
    expect(migrate("こわれている")).toBeNull();
    expect(migrate({})).toBeNull();

    // 型が違う値は既定値に落として読み込む（クラッシュの防止であって不正の検出ではない）
    const broken = {
      schemaVersion: 1,
      global: { bp: "abc", endgame: { facilityRecords: { "battle-tower": null } } },
      settings: {},
    };
    const fixed = migrate(broken);
    expect(fixed?.global.bp).toBe(0);
    expect(fixed?.settings.battleSpeed).toBe("normal");
  });
});


// ─────────────────────────────────────────────
// v0.9
// ─────────────────────────────────────────────

describe("過去版のセーブが全て読める（fixtures）", () => {
  // マイグレーションが壊れていることに気づくのは常に手遅れになってから。
  // 版を上げたら fixtures/saves に1件足す（save-data.md §5）
  const dir = "fixtures/saves";
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

  it("版ごとのサンプルが揃っている", () => {
    expect(files).toHaveLength(CURRENT_SCHEMA_VERSION);
    for (let v = 1; v <= CURRENT_SCHEMA_VERSION; v += 1) {
      expect(files, `v${v}.json`).toContain(`v${v}.json`);
    }
  });

  for (const file of files) {
    it(`${file} が最新版まで引き上がる`, () => {
      const raw = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as {
        schemaVersion: number;
        global: { bp: number };
      };
      const migrated = migrate(raw);
      expect(migrated, file).not.toBeNull();
      expect(migrated!.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      // 引き上げても BP は失われない
      expect(migrated!.global.bp).toBe(raw.global.bp);
    });
  }

  it("v3 のサンプルは世界の状態を保ったまま読める", () => {
    const data = migrate(JSON.parse(readFileSync(`${dir}/v3.json`, "utf8")))!;
    expect(Object.keys(data.pokemon)).toHaveLength(2);
    expect(data.regions["kanto"]?.position.map).toBe("kanto-route-1");
    expect(data.regions["kanto"]?.flags["kanto.pallet.got-starter"]).toBe(true);
    expect(data.global.dex["charmander"]).toBe("caught");
    expect(data.global.bag["poke-ball"]).toBe(7);

    const { party, box } = resolveParty(data, "kanto");
    expect(party.map((p) => p.species)).toEqual(["charmander"]);
    expect(box.map((p) => p.species)).toEqual(["pidgey"]);
    // 減っている HP がそのまま残る
    expect(party[0]!.currentHp).toBe(14);
  });
});

describe("器と個体の突き合わせ", () => {
  const mon = (uid: string, species: string): PokemonInstance => ({
    uid, species, exp: 135,
    ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    nature: "hardy", ability: "blaze",
    moves: [{ id: "scratch", pp: 30 }],
    currentHp: 10, status: null, statusCounter: 0, item: null,
    friendship: 70, shiny: false, gender: "male",
    met: { region: "kanto", level: 5 },
  });

  it("保存して読み直すと、手持ちの並び順まで戻る", () => {
    const party = [mon("a", "charmander"), mon("b", "pidgey")];
    const box = [mon("c", "rattata")];
    const place = { map: "kanto-route-1", x: 5, y: 12, facing: "left" } as const;
    const saved = storeParty(emptySave(), "kanto", party, box, {
      flags: {}, money: 3000, badges: 0, position: place, respawn: place,
    });

    const back = resolveParty(migrate(JSON.parse(JSON.stringify(saved)))!, "kanto");
    expect(back.party.map((p) => p.uid)).toEqual(["a", "b"]);
    expect(back.box.map((p) => p.uid)).toEqual(["c"]);
  });

  it("読み込みではプレイヤーの個体を減らさない", () => {
    // 器に居ない個体でも消さない。施設の連戦中のように、
    // 手持ちにもボックスにも居ないまま参照される場面がありうるため。
    // 捨てるのは書き込み側の仕事（下のテスト）
    const place = { map: "m", x: 0, y: 0, facing: "down" } as const;
    const saved = storeParty(emptySave(), "kanto", [mon("a", "charmander")], [], {
      flags: {}, money: 0, badges: 0, position: place, respawn: place,
    });
    const extra = { ...saved, pokemon: { ...saved.pokemon, z: mon("z", "mew") } };
    expect(Object.keys(migrate(JSON.parse(JSON.stringify(extra)))!.pokemon).sort()).toEqual(["a", "z"]);
  });

  it("uid が食い違う壊れた個体だけは捨てる", () => {
    const saved = emptySave();
    const broken = {
      ...saved,
      pokemon: { a: mon("a", "charmander"), b: { ...mon("x", "pidgey") } },
    };
    expect(Object.keys(migrate(JSON.parse(JSON.stringify(broken)))!.pokemon)).toEqual(["a"]);
  });

  it("二重所属は読み込みで直す（手持ちを優先する）", () => {
    const place = { map: "m", x: 0, y: 0, facing: "down" } as const;
    const one = mon("a", "charmander");
    let saved = storeParty(emptySave(), "kanto", [one], [], {
      flags: {}, money: 0, badges: 0, position: place, respawn: place,
    });
    // 手で壊す（外から編集されたセーブを読むときに起きうる）
    saved = { ...saved, regions: { kanto: { ...saved.regions["kanto"]!, boxUids: ["a"] } } };
    const back = resolveParty(migrate(JSON.parse(JSON.stringify(saved)))!, "kanto");
    expect(back.party.map((p) => p.uid)).toEqual(["a"]);
    expect(back.box).toEqual([]);
  });

  it("器を入れ替えると、外れた個体は保存から消える", () => {
    const place = { map: "m", x: 0, y: 0, facing: "down" } as const;
    const rest = { flags: {}, money: 0, badges: 0, position: place, respawn: place };
    let saved = storeParty(emptySave(), "kanto", [mon("a", "charmander")], [mon("b", "pidgey")], rest);
    expect(Object.keys(saved.pokemon).sort()).toEqual(["a", "b"]);
    // b を逃がした
    saved = storeParty(saved, "kanto", [mon("a", "charmander")], [], rest);
    expect(Object.keys(saved.pokemon)).toEqual(["a"]);
  });
});

describe("エクスポート／インポート", () => {
  it("書き出したものが読み戻せる", () => {
    const data = recordRun(emptySave(), "battle-tower", { streak: 9, wins: 9, bp: 30 });
    const back = importSave(exportSave(data));
    expect(back?.global.bp).toBe(30);
    expect(back?.global.endgame.facilityRecords["battle-tower"]?.bestStreak).toBe(9);
  });

  it("古い版のファイルを読み込むと引き上がる", () => {
    const back = importSave(readFileSync("fixtures/saves/v1.json", "utf8"));
    expect(back?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(back?.global.bp).toBe(42);
  });

  it("壊れたファイルは null（黙って新規データを作らない）", () => {
    expect(importSave("これは JSON ではない")).toBeNull();
    expect(importSave("{}")).toBeNull();
  });
});

describe("スロット一覧", () => {
  it("保存したスロットが要約つきで並ぶ", async () => {
    const store = createMemorySaveStore();
    await store.save(0, recordRun(emptySave(), "battle-tower", { streak: 5, wins: 5, bp: 12 }));
    await store.save(2, emptySave());

    const slots = await store.listSlots();
    expect(slots.map((s) => s.slot)).toEqual([0, 2]);
    expect(slots[0]!.summary).toContain("BP 12");
  });

  it("要約は読めないデータでも落ちない", () => {
    expect(summarize(null)).toContain("よみこめない");
  });
});


// ─────────────────────────────────────────────
// v0.10 ― 共通ボックスと現在地方
// ─────────────────────────────────────────────

describe("共通ボックス", () => {
  const mon = (uid: string, species: string): PokemonInstance => ({
    uid, species, exp: 135,
    ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    nature: "hardy", ability: "blaze",
    moves: [{ id: "scratch", pp: 30 }],
    currentHp: 10, status: null, statusCounter: 0, item: null,
    friendship: 70, shiny: false, gender: "male",
    met: { region: "kanto", level: 5 },
  });
  const place = { map: "m", x: 0, y: 0, facing: "down" } as const;
  const rest = { flags: {}, money: 0, badges: 0, position: place, respawn: place };

  const withKanto = (party: PokemonInstance[], box: PokemonInstance[] = []) =>
    storeParty(emptySave(), "kanto", party, box, rest);

  const reload = (data: ReturnType<typeof emptySave>) =>
    migrate(JSON.parse(JSON.stringify(data)))!;

  it("v3 のセーブは共通ボックスが空・カントーに居る状態から始まる", () => {
    const v3 = JSON.parse(readFileSync("fixtures/saves/v3.json", "utf8")) as { schemaVersion: number };
    const up = migrate(v3)!;
    expect(up.global.boxUids).toEqual([]);
    expect(up.global.currentRegion).toBe("kanto");
  });

  it("v4 のサンプルから共通ボックスが読める", () => {
    const data = migrate(JSON.parse(readFileSync("fixtures/saves/v4.json", "utf8")))!;
    expect(resolveCommonBox(data).map((p) => p.species)).toEqual(["eevee"]);
    // 共通ボックスの個体は地方の器には出てこない
    expect(resolveParty(data, "kanto").box.map((p) => p.species)).toEqual(["pidgey"]);
  });

  it("地方から送ると、地方の器から外れて共通ボックスに入る", () => {
    const saved = withKanto([mon("a", "charmander")], [mon("b", "pidgey")]);
    const sent = sendToCommonBox(saved, ["b"]);

    expect(sent.global.boxUids).toEqual(["b"]);
    expect(resolveParty(sent, "kanto").box).toEqual([]);
    expect(resolveParty(sent, "kanto").party.map((p) => p.uid)).toEqual(["a"]);
  });

  it("送ってから地方を保存しても、送った個体は残る", () => {
    let data = withKanto([mon("a", "charmander"), mon("b", "pidgey")]);
    data = sendToCommonBox(data, ["b"]);
    data = storeParty(data, "kanto", [mon("a", "charmander")], [], rest);

    expect(Object.keys(data.pokemon).sort()).toEqual(["a", "b"]);
    expect(resolveCommonBox(reload(data)).map((p) => p.uid)).toEqual(["b"]);
  });

  it("地方の記録が古いままでも、共通ボックスの個体を保存で捨てない", () => {
    // **書き込みで個体を失わない**という不変条件を直接見る。
    //
    // storeParty は「地方の器から外れた個体を捨てる」（幽霊を残さないため）。
    // 共通ボックスを見ないと、地方の記録が古い瞬間に**送ったはずの個体が消える**。
    // sendToCommonBox は地方と共通ボックスを同時に動かすのでこの状態は作らないが、
    // 捨てる判断が「片方しか見ていない」ままだと、いつか別の経路で踏む
    const saved = withKanto([mon("a", "charmander"), mon("b", "pidgey")]);
    const stale = { ...saved, global: { ...saved.global, boxUids: ["b"] } };

    const after = storeParty(stale, "kanto", [mon("a", "charmander")], [], rest);
    expect(Object.keys(after.pokemon).sort()).toEqual(["a", "b"]);
  });

  it("同じ個体を2回送っても増えない", () => {
    let data = withKanto([mon("a", "charmander"), mon("b", "pidgey")]);
    data = sendToCommonBox(data, ["b"]);
    data = sendToCommonBox(data, ["b"]);
    expect(data.global.boxUids).toEqual(["b"]);
  });

  it("居ない個体を送っても何も起きない", () => {
    const data = withKanto([mon("a", "charmander")]);
    expect(sendToCommonBox(data, ["zzz"])).toBe(data);
  });

  it("地方にも共通ボックスにも居る壊れたセーブは、地方を正として直す", () => {
    const saved = withKanto([mon("a", "charmander")]);
    const broken = { ...saved, global: { ...saved.global, boxUids: ["a"] } };
    const fixed = reload(broken);

    expect(fixed.global.boxUids).toEqual([]);
    expect(resolveParty(fixed, "kanto").party.map((p) => p.uid)).toEqual(["a"]);
  });

  it("拠点の器を保存しても、外れた個体を捨てない", () => {
    // 拠点の「手持ち」は共通ボックスから一時的に取り出したもの。
    // 逃がすのは release の仕事で、編成し直しただけで消えては困る
    const data = storeCommonBox(emptySave(), [mon("a", "charmander")], [mon("b", "pidgey")]);
    expect(data.global.boxUids).toEqual(["a", "b"]);
    expect(Object.keys(data.pokemon).sort()).toEqual(["a", "b"]);
  });
});

describe("現在地方", () => {
  it("新しいセーブは拠点に居る", () => {
    expect(emptySave().global.currentRegion).toBeNull();
  });

  it("知らない地方が入っていたら拠点に落とす", () => {
    const data = { ...emptySave(), global: { ...emptySave().global, currentRegion: "hoenn" } };
    expect(migrate(JSON.parse(JSON.stringify(data)))!.global.currentRegion).toBeNull();
  });
});

// ─────────────────────────────────────────────
// v1.0 殿堂入り
// ─────────────────────────────────────────────

describe("殿堂入りの記録（v1.0・スキーマv5）", () => {
  it("v4 のセーブは「まだ殿堂入りしていない」から始まる", () => {
    const data = migrate(JSON.parse(readFileSync("fixtures/saves/v4.json", "utf8")))!;
    expect(data.schemaVersion).toBe(5);
    // **後から作った記録を「あったこと」にはしない。**
    // バッジ8つでも、記録が残っていなければ殿堂は空
    expect(data.global.hallOfFame).toEqual([]);
  });

  it("v5 のサンプルは記録を保ったまま読める", () => {
    const data = migrate(JSON.parse(readFileSync("fixtures/saves/v5.json", "utf8")))!;
    expect(data.global.hallOfFame).toHaveLength(1);
    const entry = data.global.hallOfFame[0]!;
    expect(entry.region).toBe("kanto");
    expect(entry.count).toBe(1);
    expect(entry.party.map((p) => p.species)).toEqual(["charmander", "pidgey"]);
    // **個体そのものではなく写し。** ニックネームも色違いもそのとき固定
    expect(entry.party[1]!.nickname).toBe("ポポ");
    expect(entry.party[1]!.shiny).toBe(true);
  });

  it("壊れた記録は空として読む（進行不能にしない）", () => {
    const raw = JSON.parse(readFileSync("fixtures/saves/v5.json", "utf8")) as {
      global: { hallOfFame: unknown };
    };
    raw.global.hallOfFame = "こわれている";
    expect(migrate(raw)!.global.hallOfFame).toEqual([]);
  });
});
