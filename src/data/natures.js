// せいかく。ひとつのステータスを1.1倍、別のひとつを0.9倍にする。
//
// 上げる能力と下げる能力が同じものは「補正なし」で、5つある。
// HP には補正がかからない（本家と同じ）。

const STATS = ['atk', 'def', 'spa', 'spd', 'spe'];

/** 上げる能力ごとの名前。並びは STATS と同じ順。 */
const NAMES = {
  atk: ['がんばりや', 'さみしがり', 'ゆうかん', 'いじっぱり', 'やんちゃ'],
  def: ['ずぶとい', 'すなお', 'のんき', 'わんぱく', 'のうてんき'],
  spa: ['ひかえめ', 'おっとり', 'れいせい', 'てれや', 'うっかりや'],
  spd: ['おだやか', 'おとなしい', 'なまいき', 'しんちょう', 'きまぐれ'],
  spe: ['おくびょう', 'せっかち', 'まじめ', 'ようき', 'むじゃき'],
};

/** id は 0..24。up と down が同じなら補正なし。 */
export const NATURES = [];
for (let up = 0; up < STATS.length; up++) {
  for (let down = 0; down < STATS.length; down++) {
    NATURES.push({
      id: NATURES.length,
      name: NAMES[STATS[up]][down],
      up: up === down ? null : STATS[up],
      down: up === down ? null : STATS[down],
    });
  }
}

export const getNature = (id) => NATURES[id] ?? NATURES[0];

/** そのステータスへの倍率（1.1 / 1.0 / 0.9） */
export function natureMul(nature, stat) {
  if (!nature || stat === 'hp') return 1;
  if (nature.up === stat) return 1.1;
  if (nature.down === stat) return 0.9;
  return 1;
}

/** 「こうげきが たかい」のような一言。ずかんや つよさをみる 用。 */
export function natureText(nature) {
  const LABEL = { atk: 'こうげき', def: 'ぼうぎょ', spa: 'とくこう', spd: 'とくぼう', spe: 'すばやさ' };
  if (!nature?.up) return 'かたよりが ない';
  return `${LABEL[nature.up]}が たかく ${LABEL[nature.down]}が ひくい`;
}
