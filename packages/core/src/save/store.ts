/**
 * セーブの抽象化（v0.5）。
 *
 * v0.5 で保存するのは BP と施設の記録だけ。だが **保存先を抽象化するのは今**。
 * IndexedDB を直接叩くコードがゲーム側に散ってからでは剥がせなくなる。
 * v0.9 で IndexedDB へ移すときに差し替えるのは、この interface の実装1つだけになる。
 *
 * 構造は最終形（save-data.md §3）の部分集合にしてある。
 * 「global に入れるものは地方をまたぐ」という分割をここから守っておくと、
 * v0.9 のマイグレーションが項目の追加だけで済む。
 *
 * 設計: docs/design/save-data.md §2・§5 / docs/game-plan.md §8.3 論点1
 */

import type { FacilityId } from "../endgame/facility.js";

export const CURRENT_SCHEMA_VERSION = 1;

export type FacilityRecord = {
  bestStreak: number;
  totalWins: number;
  /** その施設で通算いくつ BP を得たか。 */
  earnedBp: number;
};

export type Settings = {
  battleSpeed: "normal" | "fast" | "logOnly";
};

export type SaveData = {
  /** 必ず最初のフィールド。読み込み時に必ず確認する。 */
  schemaVersion: number;
  global: {
    bp: number;
    endgame: {
      facilityRecords: Record<FacilityId, FacilityRecord>;
    };
  };
  settings: Settings;
};

export interface SaveStore {
  load(slot: number): Promise<SaveData | null>;
  save(slot: number, data: SaveData): Promise<void>;
  clear(slot: number): Promise<void>;
}

export function emptySave(): SaveData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    global: { bp: 0, endgame: { facilityRecords: {} } },
    settings: { battleSpeed: "normal" },
  };
}

/**
 * 版ごとのマイグレーション。v1 が最初なのでまだ空。
 * **鎖の形だけ先に置く。** 後から足すと、必ず1つ飛ばす。
 */
const migrations: Record<number, (data: SaveData) => SaveData> = {};

/**
 * 読み込んだデータを現在の版まで引き上げる。
 *
 * - 一方向のみ。ダウングレードは実装しない
 * - 現在より新しいセーブは読まずに拒否する（壊すより読めない方がよい）
 */
export function migrate(raw: unknown): SaveData | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as SaveData;
  if (typeof data.schemaVersion !== "number") return null;
  if (data.schemaVersion > CURRENT_SCHEMA_VERSION) return null;

  let current = data;
  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const step = migrations[current.schemaVersion + 1];
    if (step === undefined) return null;
    current = step(current);
  }
  return normalize(current);
}

/**
 * 壊れたデータで進行不能にならないようにする。
 * 不正の検出ではなくクラッシュの防止のために行う（save-data.md §9）。
 */
function normalize(data: SaveData): SaveData {
  const base = emptySave();
  const records = data.global?.endgame?.facilityRecords ?? {};
  const clean: Record<FacilityId, FacilityRecord> = {};
  for (const [id, rec] of Object.entries(records)) {
    if (typeof rec !== "object" || rec === null) continue;
    clean[id] = {
      bestStreak: Number(rec.bestStreak) || 0,
      totalWins: Number(rec.totalWins) || 0,
      earnedBp: Number(rec.earnedBp) || 0,
    };
  }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    global: { bp: Number(data.global?.bp) || 0, endgame: { facilityRecords: clean } },
    settings: { battleSpeed: data.settings?.battleSpeed ?? base.settings.battleSpeed },
  };
}

/** 施設の記録を更新する。連勝の最高記録は負けても残る。 */
export function recordRun(
  data: SaveData,
  facility: FacilityId,
  result: { streak: number; wins: number; bp: number },
): SaveData {
  const prev = data.global.endgame.facilityRecords[facility] ?? {
    bestStreak: 0,
    totalWins: 0,
    earnedBp: 0,
  };
  return {
    ...data,
    global: {
      ...data.global,
      bp: data.global.bp + result.bp,
      endgame: {
        facilityRecords: {
          ...data.global.endgame.facilityRecords,
          [facility]: {
            bestStreak: Math.max(prev.bestStreak, result.streak),
            totalWins: prev.totalWins + result.wins,
            earnedBp: prev.earnedBp + result.bp,
          },
        },
      },
    },
  };
}

/** テストと、保存先が使えない環境のための実装。 */
export function createMemorySaveStore(): SaveStore {
  const slots = new Map<number, string>();
  return {
    load: async (slot) => {
      const raw = slots.get(slot);
      return raw === undefined ? null : migrate(JSON.parse(raw));
    },
    save: async (slot, data) => {
      slots.set(slot, JSON.stringify(data));
    },
    clear: async (slot) => {
      slots.delete(slot);
    },
  };
}
