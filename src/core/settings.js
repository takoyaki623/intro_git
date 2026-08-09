// 設定。セーブデータとは別のキーに持つ。
//
// 「はじめから」を選んでも消えないのが設定の正しいふるまいなので、
// pkmn_save ではなく pkmn_settings に分けている。

import * as Storage from './storage.js';
import * as Audio from './audio.js';
import * as Music from './music.js';

/** 文字送りの速さ。数字は「1文字あたり何フレームか」。 */
export const TEXT_SPEEDS = [
  { id: 'fast', label: 'はやい', frames: 1 },
  { id: 'normal', label: 'ふつう', frames: 2 },
  { id: 'slow', label: 'ゆっくり', frames: 4 },
];

const DEFAULTS = { textSpeed: 'normal', sound: true, volume: 0.4, music: true, musicVolume: 0.5 };

export const settings = { ...DEFAULTS };

export const textFrames = () =>
  (TEXT_SPEEDS.find((s) => s.id === settings.textSpeed) ?? TEXT_SPEEDS[1]).frames;

/** 設定を実際の各モジュールへ反映する */
export function apply() {
  Audio.setEnabled(settings.sound);
  Audio.setVolume(settings.volume);
  Audio.setMusicVolume(settings.musicVolume);
  Music.setMuted(!settings.music);
}

export function load() {
  const raw = Storage.read(Storage.SETTINGS_KEY);
  if (raw && typeof raw === 'object') {
    // 知らない値が入っていても既定値に落として続ける（手で編集されても壊れない）
    if (TEXT_SPEEDS.some((s) => s.id === raw.textSpeed)) settings.textSpeed = raw.textSpeed;
    if (typeof raw.sound === 'boolean') settings.sound = raw.sound;
    if (typeof raw.volume === 'number') settings.volume = Math.max(0, Math.min(1, raw.volume));
  }
  apply();
  return settings;
}

export function save() {
  return Storage.write(Storage.SETTINGS_KEY, { ...settings });
}

export function set(key, value) {
  settings[key] = value;
  apply();
  save();
}
