// ゲーム全体の状態。単一のオブジェクトに集約し、セーブはここだけを見る。

import * as Storage from '../core/storage.js';
import { rng } from '../core/rng.js';
import { serialize, hydrate, fullHeal } from './monster.js';
import { getItem } from '../data/items.js';

export const SAVE_VERSION = 1;
export const PARTY_MAX = 6;
export const BOX_COUNT = 3;
export const BOX_SIZE = 30;

/** セーブ形式のマイグレーション。version が上がるたびに 1つ足す。 */
const MIGRATIONS = {
  // 1: (s) => { ...s, version: 2, /* 変換 */ },
};

export const state = {
  player: {
    name: 'サトシ',
    money: 3000,
    pos: { map: 'hajimari', x: 9, y: 12, dir: 'up' },
    respawn: { map: 'center', x: 6, y: 6 },
  },
  party: [],
  boxes: Array.from({ length: BOX_COUNT }, () => new Array(BOX_SIZE).fill(null)),
  bag: {},
  flags: {},
  dex: { seen: [], caught: [], where: {} },
  playTimeMs: 0,
  stepsSinceEncounter: 0,
  startedAt: Date.now(),
  // そだてや に あずけた1匹。{ mon, stepsLeft, startLv }
  daycare: null,
};

export function resetState() {
  state.player = {
    name: 'サトシ',
    money: 3000,
    pos: { map: 'hajimari', x: 9, y: 12, dir: 'up' },
    respawn: { map: 'center', x: 6, y: 6 },
  };
  state.party = [];
  state.boxes = Array.from({ length: BOX_COUNT }, () => new Array(BOX_SIZE).fill(null));
  state.bag = { 'モンスターボール': 5, 'きずぐすり': 3 };
  state.flags = {};
  state.dex = { seen: [], caught: [], where: {} };
  state.playTimeMs = 0;
  state.stepsSinceEncounter = 0;
  state.startedAt = Date.now();
  state.daycare = null;
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

// ---- セーブ ----

export function buildSave() {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    playTimeMs: state.playTimeMs,
    rngSeed: rng.seed,
    player: {
      name: state.player.name,
      money: state.player.money,
      pos: { ...state.player.pos },
      respawn: { ...state.player.respawn },
    },
    party: state.party.map(serialize),
    boxes: state.boxes.map((b) => b.map((m) => (m ? serialize(m) : null))),
    bag: { ...state.bag },
    flags: { ...state.flags },
    dex: { seen: [...state.dex.seen], caught: [...state.dex.caught], where: { ...state.dex.where } },
    daycare: state.daycare
      ? { mon: serialize(state.daycare.mon), steps: state.daycare.steps, startLv: state.daycare.startLv }
      : null,
  };
}

export function save() {
  return Storage.write(Storage.SAVE_KEY, buildSave());
}

/**
 * セーブを読み込んで state に反映する。
 * 戻り値 { ok } / { ok:false, reason }
 */
export function load() {
  const raw = Storage.read(Storage.SAVE_KEY);
  if (!raw) return { ok: false, reason: 'none' };

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
    };
    state.playTimeMs = s.playTimeMs ?? 0;
    state.stepsSinceEncounter = 0;
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

/** プレイ時間の表示（h:mm） */
export function playTimeText() {
  const total = Math.floor(state.playTimeMs / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
