// ゲーム全体の状態。単一のオブジェクトに集約し、セーブはここだけを見る。

import * as Storage from '../core/storage.js';
import { rng } from '../core/rng.js';
import { serialize, hydrate, fullHeal } from './monster.js';
import { getItem } from '../data/items.js';
import { SPECIES } from '../data/species.js';

const DEX_TOTAL = Object.keys(SPECIES).length;

export const SAVE_VERSION = 3;
export const PARTY_MAX = 6;
export const BOX_COUNT = 3;
export const BOX_SIZE = 30;

// 図鑑番号を全国図鑑に揃えたときの旧id→新idの対応（種族の再編、Phase I）。
// キャタピー系・ポッポ系・コラッタ系・ピカチュウが実際の全国図鑑とずれていたのを直した。
const DEX_RENUMBER = { 10: 16, 11: 17, 12: 19, 13: 20, 14: 10, 15: 11, 16: 12, 17: 25 };
const renumberId = (id) => DEX_RENUMBER[id] ?? id;

/** セーブ形式のマイグレーション。version が上がるたびに 1つ足す。 */
const MIGRATIONS = {
  1: (s) => {
    const remapMon = (m) => (m ? { ...m, id: renumberId(m.id) } : m);
    return {
      ...s,
      version: 2,
      party: (s.party ?? []).map(remapMon),
      boxes: (s.boxes ?? []).map((box) => (box ?? []).map(remapMon)),
      dex: {
        ...s.dex,
        seen: (s.dex?.seen ?? []).map(renumberId),
        caught: (s.dex?.caught ?? []).map(renumberId),
        where: Object.fromEntries(
          Object.entries(s.dex?.where ?? {}).map(([id, place]) => [renumberId(Number(id)), place]),
        ),
      },
      daycare: s.daycare ? { ...s.daycare, mon: remapMon(s.daycare.mon) } : s.daycare,
    };
  },
  // Phase Z-1/Z-2: プレイ統計・でんどうのま記録・色違いを追加。古いセーブは空の記録から始まる。
  2: (s) => ({
    ...s,
    version: 3,
    stats: { steps: 0, battles: 0, caught: 0, fled: 0, ballsUsed: 0, towerBest: 0, ...(s.stats ?? {}) },
    hallOfFame: s.hallOfFame ?? [],
  }),
};

export const state = {
  player: {
    name: 'サトシ',
    money: 3000,
    pos: { map: 'hajimari', x: 9, y: 12, dir: 'up' },
    respawn: { map: 'center', x: 6, y: 6 },
    rivalName: null,
    rivalStarter: null,
  },
  party: [],
  boxes: Array.from({ length: BOX_COUNT }, () => new Array(BOX_SIZE).fill(null)),
  bag: {},
  flags: {},
  dex: { seen: [], caught: [], where: {}, shiny: [] },
  playTimeMs: 0,
  stepsSinceEncounter: 0,
  startedAt: Date.now(),
  // 殿堂入りした回数。タイトルの「つづきから」に ★ を出すのに使う。
  hallOfFameCount: 0,
  // でんどうのま（Phase Z-2）。何回目にどのパーティで勝ったかを残す。
  hallOfFame: [],
  // トレーナーカード用の記録（Phase Z-1）。
  stats: { steps: 0, battles: 0, caught: 0, fled: 0, ballsUsed: 0, towerBest: 0 },
  // そだてや に あずけた1匹。{ mon, stepsLeft, startLv }
  daycare: null,
  // むしよけスプレーの残り歩数。セーブには含めない（リロードで切れても実害が薄い）。
  repelSteps: 0,
  // あなぬけのヒモの戻り先。直前に「屋外→屋内」で入った場所を覚える。
  lastEntrance: null,
};

export function resetState() {
  state.player = {
    name: 'サトシ',
    money: 3000,
    pos: { map: 'hajimari', x: 9, y: 12, dir: 'up' },
    respawn: { map: 'center', x: 6, y: 6 },
    rivalName: null,
    rivalStarter: null,
  };
  state.party = [];
  state.boxes = Array.from({ length: BOX_COUNT }, () => new Array(BOX_SIZE).fill(null));
  state.bag = { 'モンスターボール': 5, 'きずぐすり': 3 };
  state.flags = {};
  state.dex = { seen: [], caught: [], where: {}, shiny: [] };
  state.playTimeMs = 0;
  state.stepsSinceEncounter = 0;
  state.startedAt = Date.now();
  state.hallOfFameCount = 0;
  state.hallOfFame = [];
  state.stats = { steps: 0, battles: 0, caught: 0, fled: 0, ballsUsed: 0, towerBest: 0 };
  state.daycare = null;
  state.repelSteps = 0;
  state.lastEntrance = null;
}

// ---- フラグ ----
export const getFlag = (k) => !!state.flags[k];
export const setFlag = (k, v = true) => { state.flags[k] = v; };

// ---- 図鑑 ----
export function registerSeen(id) {
  if (!state.dex.seen.includes(id)) state.dex.seen.push(id);
}
export function registerCaught(id) {
  registerSeen(id);
  if (!state.dex.caught.includes(id)) state.dex.caught.push(id);
  // 最初につかまえた場所だけ覚える（あとで同じ種を捕っても上書きしない）
  state.dex.where[id] ??= state.player.pos.map;
  // 図鑑の報酬（博士）が受け取れる状態かどうかの目印。一度立ったら下がらない。
  const n = state.dex.caught.length;
  if (n >= 10) state.flags.dexReady10 = true;
  if (n >= 20) state.flags.dexReady20 = true;
  if (n >= DEX_TOTAL) state.flags.dexReadyAll = true;
}

/** 色違いを捕まえたことを図鑑に記す（Phase Z-3）。 */
export function registerShinyCaught(id) {
  state.dex.shiny ??= [];
  if (!state.dex.shiny.includes(id)) state.dex.shiny.push(id);
}

// ---- バッグ ----
export function addItem(name, n = 1) {
  if (!getItem(name)) {
    console.warn(`[state] 未知の どうぐ ${name}`);
    return false;
  }
  state.bag[name] = (state.bag[name] ?? 0) + n;
  return true;
}

export function removeItem(name, n = 1) {
  const have = state.bag[name] ?? 0;
  if (have < n) return false;
  if (have === n) delete state.bag[name];
  else state.bag[name] = have - n;
  return true;
}

export const countItem = (name) => state.bag[name] ?? 0;

/** ポケットごとの所持品一覧 */
export function bagPocket(pocket) {
  return Object.entries(state.bag)
    .map(([name, n]) => ({ item: getItem(name), n }))
    .filter((e) => e.item && e.item.pocket === pocket)
    .sort((a, b) => a.item.name.localeCompare(b.item.name, 'ja'));
}

// ---- 手持ち・ボックス ----
export const partyFull = () => state.party.length >= PARTY_MAX;
export const livingParty = () => state.party.filter((m) => m.curHP > 0);
export const isWipedOut = () => state.party.length > 0 && livingParty().length === 0;

/**
 * 捕まえた個体を加える。
 * 戻り値 'party' | 'box' | null（ボックスも満杯）
 */
export function addMonster(mon) {
  if (!partyFull()) {
    state.party.push(mon);
    return 'party';
  }
  for (const box of state.boxes) {
    const i = box.indexOf(null);
    if (i >= 0) {
      box[i] = mon;
      return 'box';
    }
  }
  return null;
}

export function healParty() {
  for (const m of state.party) fullHeal(m);
}

// ---- プレイ統計（Phase Z-1）----
export const addStat = (key, n = 1) => { state.stats[key] = (state.stats[key] ?? 0) + n; };

/** でんどうのまの記録を1本足す（Phase Z-2）。パーティの種族・Lv・ニックネームだけ残す。 */
export function recordHallOfFame() {
  state.hallOfFame.push({
    at: Date.now(),
    party: state.party.map((m) => ({
      speciesId: m.species.id, name: m.species.name, nick: m.nick, level: m.level, shiny: !!m.shiny,
    })),
  });
}

// ---- セーブ ----

export function buildSave() {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    playTimeMs: state.playTimeMs,
    hallOfFameCount: state.hallOfFameCount,
    hallOfFame: state.hallOfFame.map((h) => ({ at: h.at, party: h.party.map((m) => ({ ...m })) })),
    stats: { ...state.stats },
    rngSeed: rng.seed,
    player: {
      name: state.player.name,
      money: state.player.money,
      pos: { ...state.player.pos },
      respawn: { ...state.player.respawn },
      rivalName: state.player.rivalName,
      rivalStarter: state.player.rivalStarter,
    },
    party: state.party.map(serialize),
    boxes: state.boxes.map((b) => b.map((m) => (m ? serialize(m) : null))),
    bag: { ...state.bag },
    flags: { ...state.flags },
    dex: {
      seen: [...state.dex.seen], caught: [...state.dex.caught], where: { ...state.dex.where },
      shiny: [...(state.dex.shiny ?? [])],
    },
    daycare: state.daycare
      ? { mon: serialize(state.daycare.mon), steps: state.daycare.steps, startLv: state.daycare.startLv }
      : null,
  };
}

/** 枠を指定して書く。'auto' はオートセーブ用の枠。 */
export function save(slot = 0) {
  return Storage.write(Storage.slotKey(slot), buildSave());
}

/**
 * オートセーブ。ポケモンセンターで回復したときなど、
 * 「ここまでは確実」と言える場所でだけ呼ぶ。
 */
export function autoSave() {
  return save('auto');
}

/**
 * セーブを読み込んで state に反映する。
 * 戻り値 { ok } / { ok:false, reason }
 */
export function load(slot = 0) {
  // 旧形式の単一セーブしか無い人もいるので、1枠目だけは古いキーも見る
  const raw = Storage.read(Storage.slotKey(slot))
    ?? (slot === 0 ? Storage.read(Storage.SAVE_KEY) : null);
  if (!raw) return { ok: false, reason: 'none' };
  return applySave(raw);
}

/**
 * 生のセーブオブジェクト(raw)を state に反映する。
 * load() と、文字列インポート(importSaveText)の両方から使う共通経路。
 * マイグレーションもここで通すので、書き出した時点のバージョンが古くても読める。
 */
function applySave(raw) {
  let s = raw;
  if (typeof s.version !== 'number') return { ok: false, reason: 'broken' };
  // 未来のバージョンは読まない。黙って壊すより読めないと言うほうがまし。
  if (s.version > SAVE_VERSION) return { ok: false, reason: 'newer' };

  while (s.version < SAVE_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) return { ok: false, reason: 'broken' };
    s = step(s);
  }

  try {
    state.player = {
      name: s.player?.name ?? 'サトシ',
      money: s.player?.money ?? 0,
      pos: {
        map: s.player?.pos?.map ?? 'hajimari',
        x: s.player?.pos?.x ?? 9,
        y: s.player?.pos?.y ?? 12,
        dir: s.player?.pos?.dir ?? 'down',
      },
      respawn: {
        map: s.player?.respawn?.map ?? 'center',
        x: s.player?.respawn?.x ?? 6,
        y: s.player?.respawn?.y ?? 6,
      },
      rivalName: s.player?.rivalName ?? null,
      rivalStarter: s.player?.rivalStarter ?? null,
    };
    state.party = (s.party ?? []).map(hydrate).filter(Boolean).slice(0, PARTY_MAX);
    state.boxes = Array.from({ length: BOX_COUNT }, (_, bi) => {
      const src = s.boxes?.[bi] ?? [];
      return Array.from({ length: BOX_SIZE }, (_, i) => (src[i] ? hydrate(src[i]) : null));
    });
    state.bag = {};
    for (const [k, v] of Object.entries(s.bag ?? {})) {
      if (getItem(k)) state.bag[k] = v;
      else console.warn(`[state] 未知の どうぐ ${k} をスキップしました`);
    }
    state.flags = { ...(s.flags ?? {}) };
    state.dex = {
      seen: [...(s.dex?.seen ?? [])],
      caught: [...(s.dex?.caught ?? [])],
      where: { ...(s.dex?.where ?? {}) },
      shiny: [...(s.dex?.shiny ?? [])],
    };
    state.playTimeMs = s.playTimeMs ?? 0;
    state.hallOfFameCount = s.hallOfFameCount ?? 0;
    state.hallOfFame = Array.isArray(s.hallOfFame) ? s.hallOfFame.map((h) => ({ at: h.at, party: h.party ?? [] })) : [];
    state.stats = { steps: 0, battles: 0, caught: 0, fled: 0, ballsUsed: 0, towerBest: 0, ...(s.stats ?? {}) };
    state.stepsSinceEncounter = 0;
    state.repelSteps = 0;
    state.lastEntrance = null;
    const dc = s.daycare;
    const dcMon = dc?.mon ? hydrate(dc.mon) : null;
    state.daycare = dcMon ? { mon: dcMon, steps: dc.steps ?? 0, startLv: dc.startLv ?? dcMon.level } : null;
    if (typeof s.rngSeed === 'number') rng.seed = s.rngSeed;
    return { ok: true };
  } catch (e) {
    console.error('[state] セーブの復元に失敗しました', e);
    return { ok: false, reason: 'broken' };
  }
}

// ---- セーブの文字列入出力（A3）----
// 端末をまたいで進行を渡すための、コピー＆貼り付け用の文字列。
// btoa は Latin1 前提で日本語(UTF-8)を直接は通せないので、バイト列を経由する。

function bytesToBase64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** いま進行中の state を、貼り付け可能な1つの文字列にする。 */
export function exportSaveText() {
  const json = JSON.stringify(buildSave());
  return bytesToBase64(new TextEncoder().encode(json));
}

/**
 * exportSaveText() で作った文字列を state に反映する。
 * 壊れた文字列・未対応バージョンでもクラッシュせず { ok:false, reason } を返す。
 */
export function importSaveText(text) {
  let raw;
  try {
    const json = new TextDecoder().decode(base64ToBytes(String(text).trim()));
    raw = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'broken' };
  }
  if (raw === null || typeof raw !== 'object') return { ok: false, reason: 'broken' };
  return applySave(raw);
}

/** プレイ時間の表示（h:mm） */
export function playTimeText() {
  const total = Math.floor(state.playTimeMs / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
