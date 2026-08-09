// どうぐ。
//
// pocket: 'ボール' | 'かいふく' | 'たいせつなもの'
// use.kind は BagScene と battle.js が解釈する。

export const ITEMS = {
  'モンスターボール': {
    pocket: 'ボール', ballRate: 1, price: 200,
    desc: 'やせいの ポケモンを つかまえる ボール。',
  },
  'スーパーボール': {
    pocket: 'ボール', ballRate: 1.5, price: 600,
    desc: 'モンスターボールより つかまえやすい ボール。',
  },
  'ハイパーボール': {
    pocket: 'ボール', ballRate: 2, price: 1200,
    desc: 'スーパーボールより さらに つかまえやすい ボール。',
  },

  'きずぐすり': {
    pocket: 'かいふく', price: 300, use: { kind: 'heal', amount: 20 },
    usableIn: ['field', 'battle'],
    desc: 'ポケモンの HPを 20 かいふくする。',
  },
  'いいきずぐすり': {
    pocket: 'かいふく', price: 700, use: { kind: 'heal', amount: 50 },
    usableIn: ['field', 'battle'],
    desc: 'ポケモンの HPを 50 かいふくする。',
  },
  'すごいきずぐすり': {
    pocket: 'かいふく', price: 1200, use: { kind: 'heal', amount: 120 },
    usableIn: ['field', 'battle'],
    desc: 'ポケモンの HPを 120 かいふくする。',
  },
  'まんたんのくすり': {
    pocket: 'かいふく', price: 2500, use: { kind: 'heal', amount: 'full' },
    usableIn: ['field', 'battle'],
    desc: 'ポケモンの HPを すべて かいふくする。',
  },
  'どくけし': {
    pocket: 'かいふく', price: 100, use: { kind: 'cure', status: 'どく' },
    usableIn: ['field', 'battle'],
    desc: 'どく じょうたいを かいふくする。',
  },
  'まひなおし': {
    pocket: 'かいふく', price: 200, use: { kind: 'cure', status: 'まひ' },
    usableIn: ['field', 'battle'],
    desc: 'まひ じょうたいを かいふくする。',
  },
  'やけどなおし': {
    pocket: 'かいふく', price: 250, use: { kind: 'cure', status: 'やけど' },
    usableIn: ['field', 'battle'],
    desc: 'やけど じょうたいを かいふくする。',
  },
  'めざめるドリンク': {
    pocket: 'かいふく', price: 250, use: { kind: 'cure', status: 'ねむり' },
    usableIn: ['field', 'battle'],
    desc: 'ねむり じょうたいを かいふくする。',
  },
  'なんでもなおし': {
    pocket: 'かいふく', price: 600, use: { kind: 'cure', status: 'all' },
    usableIn: ['field', 'battle'],
    desc: 'すべての じょうたい いじょうを なおす。',
  },
  'げんきのかけら': {
    pocket: 'かいふく', price: 1500, use: { kind: 'revive', ratio: 0.5 },
    usableIn: ['field', 'battle'], targetFainted: true,
    desc: 'ひんしの ポケモンを HP はんぶんで ふっかつさせる。',
  },

  'ほのおのいし': {
    pocket: 'たいせつなもの', price: 2100, use: { kind: 'evoStone' },
    usableIn: ['field'],
    desc: 'とくていの ポケモンを しんかさせる ふしぎな いし。',
  },
  'みずのいし': {
    pocket: 'たいせつなもの', price: 2100, use: { kind: 'evoStone' },
    usableIn: ['field'],
    desc: 'とくていの ポケモンを しんかさせる ふしぎな いし。',
  },
  'リーフのいし': {
    pocket: 'たいせつなもの', price: 2100, use: { kind: 'evoStone' },
    usableIn: ['field'],
    desc: 'とくていの ポケモンを しんかさせる ふしぎな いし。',
  },
  'かみなりのいし': {
    pocket: 'たいせつなもの', price: 2100, use: { kind: 'evoStone' },
    usableIn: ['field'],
    desc: 'とくていの ポケモンを しんかさせる ふしぎな いし。',
  },
};

for (const [name, it] of Object.entries(ITEMS)) {
  it.name = name;
  it.use ??= null;
  it.usableIn ??= [];
}

export const getItem = (name) => ITEMS[name] ?? null;
export const POCKETS = ['ボール', 'かいふく', 'たいせつなもの'];
