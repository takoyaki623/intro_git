/**
 * 最小セーブ（v0.5）。
 *
 * v0.5 で保存するのは BP と施設の記録だけ。
 * それでも **抽象化とマイグレーションの鎖は今のうちに作る** ―― 後から挟めないため。
 * 設計: docs/design/save-data.md §2・§5 / docs/game-plan.md §8.3 論点1
 */

import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  createMemorySaveStore,
  emptySave,
  migrate,
  recordCupWin,
  recordRun,
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
  it("v1 のセーブが v2 へ引き上がる（鎖が実際に動く）", () => {
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
