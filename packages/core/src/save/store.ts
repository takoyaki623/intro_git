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
import type { CupId, PokemonInstance } from "../types.js";

/**
 * v1 → v2: トーナメントの記録を足した（v0.6）。
 * v2 → v3: **世界の状態を入れた**（v0.9）。手持ち・ボックス・図鑑・バッグ・
 *          フラグ・現在地・お金。ここまでは全部メモリ上にしか無かった。
 */
export const CURRENT_SCHEMA_VERSION = 3;

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
  /** 全滅したときにお金を失うか。**既定は失わない**（economy.md §2）。 */
  lossPenalty: "none" | "classic";
};

/**
 * 地方ごとの進行（v0.9）。
 *
 * **個体そのものはここに入れない。** `uid` の配列だけを持ち、実体は
 * `SaveData.pokemon` に置く ―― 共通ボックスが数千体になったとき、
 * 1体入れ替えるたびに全体を書き直さずに済ませるため（save-data.md §2）。
 */
export type RegionProgress = {
  /** 進行フラグ。宣言済みのものだけが入る（world.md §6）。 */
  flags: Record<string, boolean>;
  money: number;
  badges: number;
  /** 手持ち。並び順がそのまま出す順になる。 */
  partyUids: string[];
  /** 地方ボックス。 */
  boxUids: string[];
  /** 今いる場所。 */
  position: { map: string; x: number; y: number; facing: "up" | "down" | "left" | "right" };
  /** 最後に使ったポケモンセンター。全滅したらここへ戻る（economy.md §2）。 */
  respawn: { map: string; x: number; y: number; facing: "up" | "down" | "left" | "right" };
};

/** 図鑑の状態。 */
export type DexEntryState = "seen" | "caught";

export type SaveData = {
  /** 必ず最初のフィールド。読み込み時に必ず確認する。 */
  schemaVersion: number;
  global: {
    bp: number;
    /** 図鑑は地方をまたぐ（全国図鑑）。 */
    dex: Record<string, DexEntryState>;
    /** 道具の在庫。地方をまたいで持ち歩く。 */
    bag: Record<string, number>;
    endgame: {
      facilityRecords: Record<FacilityId, FacilityRecord>;
      tournamentRecords: Record<CupId, TournamentRecord>;
    };
  };
  /**
   * 個体の実体。**器（手持ち・ボックス）は uid しか持たない。**
   * 保存先はこれを別ストアに分けてよい（save-data.md §2）。
   */
  pokemon: Record<string, PokemonInstance>;
  regions: Record<string, RegionProgress>;
  settings: Settings;
};

export type SlotInfo = {
  slot: number;
  savedAt: number;
  /** 一覧に出す要約。「カントー / てもち3 / 図鑑12」 */
  summary: string;
};

export interface SaveStore {
  load(slot: number): Promise<SaveData | null>;
  save(slot: number, data: SaveData): Promise<void>;
  clear(slot: number): Promise<void>;
  /** スロット一覧（v0.9）。 */
  listSlots(): Promise<SlotInfo[]>;
}

/**
 * エクスポート／インポート（save-data.md §8）。
 *
 * **ブラウザのストレージは消える。** キャッシュクリアでも、
 * シークレットウィンドウでも、ブラウザの乗り換えでも消える。
 * 数百時間ぶんがそれで失われないよう、ファイルに出せることを必須機能にする。
 *
 * 保存先に依存しないので `SaveStore` の外に置く。
 */
export const exportSave = (data: SaveData): string => JSON.stringify(data, null, 2);

/** 読めなければ null。**黙って新規データを作らない。** */
export function importSave(text: string): SaveData | null {
  try {
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}

export function emptySave(): SaveData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    global: { bp: 0, dex: {}, bag: {}, endgame: { facilityRecords: {}, tournamentRecords: {} } },
    pokemon: {},
    regions: {},
    settings: { battleSpeed: "normal", lossPenalty: "none" },
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

  // v0.9: 世界の状態を追加。
  // v0.8 までのセーブには BP と施設の記録しか無いので、
  // **冒険は「まだ始めていない」状態から始まる。** 消える進行は元から無い
  3: (v2) => ({
    ...v2,
    schemaVersion: 3,
    global: { ...v2.global, dex: {}, bag: {} },
    pokemon: {},
    regions: {},
    settings: { ...v2.settings, lossPenalty: "none" },
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

  // ── 個体 ──
  // uid が食い違っているものだけ捨てる。
  //
  // **「どの器にも居ない個体」は読み込みでは消さない。**
  // 施設の連戦中（`ActiveRun.memberUids`・v0.9 以降）のように、
  // 手持ちにもボックスにも居ないまま参照される場面がありうる。
  // 消すのは書き込み側（`storeParty`）の仕事にして、
  // **読み込みでプレイヤーのデータを減らさない。**
  const pokemon: Record<string, PokemonInstance> = {};
  for (const [uid, instance] of Object.entries(data.pokemon ?? {})) {
    if (typeof instance !== "object" || instance === null) continue;
    if (typeof instance.uid !== "string" || instance.uid !== uid) continue;
    pokemon[uid] = instance;
  }

  const regions: Record<string, RegionProgress> = {};
  for (const [id, raw] of Object.entries(data.regions ?? {})) {
    if (typeof raw !== "object" || raw === null) continue;
    const known = (uids: unknown): string[] =>
      (Array.isArray(uids) ? uids : []).filter((u): u is string => typeof u === "string" && u in pokemon);
    const place = (v: unknown, fallback: RegionProgress["position"]) =>
      typeof v === "object" && v !== null && typeof (v as { map?: unknown }).map === "string"
        ? (v as RegionProgress["position"])
        : fallback;
    const home = { map: "", x: 0, y: 0, facing: "down" as const };
    regions[id] = {
      flags: typeof raw.flags === "object" && raw.flags !== null ? raw.flags : {},
      money: Number(raw.money) || 0,
      badges: Number(raw.badges) || 0,
      partyUids: known(raw.partyUids).slice(0, 6),
      boxUids: known(raw.boxUids),
      position: place(raw.position, home),
      respawn: place(raw.respawn, home),
    };
  }

  const bag: Record<string, number> = {};
  for (const [id, count] of Object.entries(data.global?.bag ?? {})) {
    const n = Math.floor(Number(count));
    if (Number.isFinite(n) && n > 0) bag[id] = n;
  }

  const dex: Record<string, DexEntryState> = {};
  for (const [id, state] of Object.entries(data.global?.dex ?? {})) {
    if (state === "seen" || state === "caught") dex[id] = state;
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    global: {
      bp: Number(data.global?.bp) || 0,
      dex,
      bag,
      endgame: { facilityRecords: clean, tournamentRecords: cleanCups },
    },
    pokemon,
    regions,
    settings: {
      battleSpeed: data.settings?.battleSpeed ?? base.settings.battleSpeed,
      lossPenalty: data.settings?.lossPenalty === "classic" ? "classic" : "none",
    },
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

/**
 * 器と個体を突き合わせる（v0.9）。
 *
 * **1体がちょうど1箇所に属する**という不変条件は `storage.ts` が守っているが、
 * セーブは uid の配列に落とすので、読み込むときに壊れていることがありうる。
 * ここが最後の関所になる。
 */
export function resolveParty(
  data: SaveData,
  region: string,
): { party: PokemonInstance[]; box: PokemonInstance[] } {
  const progress = data.regions[region];
  if (progress === undefined) return { party: [], box: [] };
  const pick = (uids: string[]) =>
    uids.map((uid) => data.pokemon[uid]).filter((p): p is PokemonInstance => p !== undefined);

  const party = pick(progress.partyUids);
  const inParty = new Set(party.map((p) => p.uid));
  // 手持ちにも居る個体はボックスから外す（二重所属を読み込みで直す）
  return { party, box: pick(progress.boxUids).filter((p) => !inParty.has(p.uid)) };
}

/** 器の中身をセーブの形へ落とす。個体の実体は `pokemon` に集める。 */
export function storeParty(
  data: SaveData,
  region: string,
  party: readonly PokemonInstance[],
  box: readonly PokemonInstance[],
  rest: Omit<RegionProgress, "partyUids" | "boxUids">,
): SaveData {
  const pokemon = { ...data.pokemon };
  // この地方の器から外れた個体は捨てる（幽霊を残さない）
  const before = new Set([
    ...(data.regions[region]?.partyUids ?? []),
    ...(data.regions[region]?.boxUids ?? []),
  ]);
  for (const uid of before) delete pokemon[uid];
  for (const p of [...party, ...box]) pokemon[p.uid] = p;

  return {
    ...data,
    pokemon,
    regions: {
      ...data.regions,
      [region]: { ...rest, partyUids: party.map((p) => p.uid), boxUids: box.map((p) => p.uid) },
    },
  };
}

/** テストと、保存先が使えない環境のための実装。 */
export function createMemorySaveStore(): SaveStore {
  const slots = new Map<number, string>();
  const savedAt = new Map<number, number>();
  return {
    load: async (slot) => {
      const raw = slots.get(slot);
      return raw === undefined ? null : migrate(JSON.parse(raw));
    },
    save: async (slot, data) => {
      slots.set(slot, JSON.stringify(data));
      savedAt.set(slot, Date.now());
    },
    clear: async (slot) => {
      slots.delete(slot);
      savedAt.delete(slot);
    },
    listSlots: async () =>
      [...slots.keys()].sort().map((slot) => ({
        slot,
        savedAt: savedAt.get(slot) ?? 0,
        summary: summarize(migrate(JSON.parse(slots.get(slot)!))),
      })),
  };
}

/** スロット一覧に出す1行。 */
export function summarize(data: SaveData | null): string {
  if (data === null) return "よみこめない データ";
  const caught = Object.values(data.global.dex).filter((s) => s === "caught").length;
  const party = Object.values(data.regions).reduce((n, r) => n + r.partyUids.length, 0);
  const box = Object.values(data.regions).reduce((n, r) => n + r.boxUids.length, 0);
  return `てもち ${party} ・ ボックス ${box} ・ ずかん ${caught} ・ BP ${data.global.bp}`;
}
