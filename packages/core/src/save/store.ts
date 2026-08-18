/**
 * セーブの抽象化（v0.5 で導入、v0.6 で拡張）。
 *
 * 保存するのは BP と、施設・トーナメントの記録だけ。だが **保存先を抽象化するのは今**。
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
import { TIERS, type TierId } from "../endgame/named.js";
import type { CupId } from "../types.js";

/**
 * v1 → v2: トーナメントの記録を足した（v0.6）。
 * **最初のマイグレーションが実際に走る版。** 鎖が動くことをここで確かめる。
 */
export const CURRENT_SCHEMA_VERSION = 2;

export type FacilityRecord = {
  bestStreak: number;
  totalWins: number;
  /** その施設で通算いくつ BP を得たか。 */
  earnedBp: number;
};

/** カップごとの記録。優勝したティアが次のティアを開ける。 */
export type TournamentRecord = {
  clearedTiers: TierId[];
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
      tournamentRecords: Record<CupId, TournamentRecord>;
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
    global: { bp: 0, endgame: { facilityRecords: {}, tournamentRecords: {} } },
    settings: { battleSpeed: "normal" },
  };
}

/**
 * 版ごとのマイグレーション。順に適用する。
 *
 * v0.5 で「空のまま形だけ」作っておいたものが、v0.6 で初めて実際に走った。
 * 先に鎖を作っておかないと、2つ目の版で必ず1つ飛ばす ―― の実例になっている。
 */
const migrations: Record<number, (data: SaveData) => SaveData> = {
  // v0.6: トーナメントの記録を追加。既存のセーブには空の記録を足すだけ
  2: (v1) => ({
    ...v1,
    schemaVersion: 2,
    global: {
      ...v1.global,
      endgame: { ...v1.global.endgame, tournamentRecords: {} },
    },
  }),
};

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

  const cups = data.global?.endgame?.tournamentRecords ?? {};
  const cleanCups: Record<CupId, TournamentRecord> = {};
  for (const [id, rec] of Object.entries(cups)) {
    if (typeof rec !== "object" || rec === null) continue;
    const tiers = Array.isArray(rec.clearedTiers) ? rec.clearedTiers : [];
    // 知らないティア名が入っていても落とさない。読めるものだけ拾う
    cleanCups[id] = { clearedTiers: tiers.filter((t): t is TierId => TIERS.includes(t)) };
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    global: {
      bp: Number(data.global?.bp) || 0,
      endgame: { facilityRecords: clean, tournamentRecords: cleanCups },
    },
    settings: { battleSpeed: data.settings?.battleSpeed ?? base.settings.battleSpeed },
  };
}

/** カップの優勝を記録する。同じティアを2回優勝しても重複しない。 */
export function recordCupWin(
  data: SaveData,
  cup: CupId,
  tier: TierId,
  bp: number,
): SaveData {
  const prev = data.global.endgame.tournamentRecords[cup] ?? { clearedTiers: [] };
  const clearedTiers = prev.clearedTiers.includes(tier)
    ? prev.clearedTiers
    : [...prev.clearedTiers, tier];
  return {
    ...data,
    global: {
      ...data.global,
      bp: data.global.bp + bp,
      endgame: {
        ...data.global.endgame,
        tournamentRecords: { ...data.global.endgame.tournamentRecords, [cup]: { clearedTiers } },
      },
    },
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
        ...data.global.endgame,
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
