// localStorage の薄いラッパー。
//
// Safari のプライベートモードは setItem で例外を投げるし、容量超過もある。
// ここを通していない localStorage 呼び出しはゲームを丸ごと落としうるので、
// アクセスは必ずこのモジュール経由にする。

// セーブは3枠 + オートセーブ1枠。
// 枠を分けておくと「上書きしてしまった」で終わらない。
export const SLOT_COUNT = 3;
export const SAVE_KEY = 'pkmn_save';                    // 旧・単一枠（読み込みだけ面倒を見る）
export const slotKey = (i) => (i === 'auto' ? 'pkmn_save_auto' : `pkmn_save_${i}`);
export const SETTINGS_KEY = 'pkmn_settings';

let available = null;

export function isAvailable() {
  if (available !== null) return available;
  try {
    const k = '__pkmn_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function read(key) {
  if (!isAvailable()) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch (e) {
    console.warn(`[storage] ${key} の読み込みに失敗しました`, e);
    return null;
  }
}

/** 書き込めたら true。失敗しても例外は投げない。 */
export function write(key, value) {
  if (!isAvailable()) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`[storage] ${key} の書き込みに失敗しました`, e);
    return false;
  }
}

export function remove(key) {
  if (!isAvailable()) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const hasSave = () => allSlots().some((s) => s.data !== null);

/**
 * 全部の枠の中身。UI がそのまま並べられる形で返す。
 * 旧形式（pkmn_save）が残っていたら、1枠目として拾う。
 */
export function allSlots() {
  const out = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    let data = read(slotKey(i));
    if (i === 0 && data === null) data = read(SAVE_KEY);   // 旧セーブの引き継ぎ
    out.push({ slot: i, data });
  }
  out.push({ slot: 'auto', data: read(slotKey('auto')) });
  return out;
}
