// localStorage の薄いラッパー。
//
// Safari のプライベートモードは setItem で例外を投げるし、容量超過もある。
// ここを通していない localStorage 呼び出しはゲームを丸ごと落としうるので、
// アクセスは必ずこのモジュール経由にする。

export const SAVE_KEY = 'pkmn_save';
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

export const hasSave = () => read(SAVE_KEY) !== null;
