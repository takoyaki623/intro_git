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
  // PP回復。技を1つずつ選ばせる画面を作らずに済むよう、まとめて回復する。
  'ピーピーエイド': {
    pocket: 'かいふく', price: 900, use: { kind: 'pp', amount: 10 },
    usableIn: ['field', 'battle'],
    desc: 'ぜんぶの わざの PPを 10 ずつ かいふくする。',
  },
  'ピーピーリカバー': {
    pocket: 'かいふく', price: 1800, use: { kind: 'pp', amount: 'full' },
    usableIn: ['field', 'battle'],
    desc: 'ぜんぶの わざの PPを まんたんに する。',
  },

  'げんきのかけら': {
    pocket: 'かいふく', price: 1500, use: { kind: 'revive', ratio: 0.5 },
    usableIn: ['field', 'battle'], targetFainted: true,
    desc: 'ひんしの ポケモンを HP はんぶんで ふっかつさせる。',
  },

  // 使うと state.repelSteps / あなぬけ を動かす。encounter.js と world.js が見にいく。
  'むしよけスプレー': {
    pocket: 'たいせつなもの', price: 400, use: { kind: 'repel', steps: 100 },
    usableIn: ['field'],
    desc: '100ほの あいだ、よわい やせいポケモンが でなくなる。',
  },
  'あなぬけのヒモ': {
    pocket: 'たいせつなもの', price: 350, use: { kind: 'escape' },
    usableIn: ['field'],
    desc: 'どうくつや たてものの いりぐちまで いっきに もどる。',
  },

  // 水辺を向いて A で使う。バッグからではなく地形から使うので usableIn は空。
  'ボロのつりざお': {
    pocket: 'たいせつなもの', use: { kind: 'rod', power: 1 },
    usableIn: [],
    desc: 'みずべを むいて つかう。ポケモンが つれることが ある。',
  },
  'いいつりざお': {
    pocket: 'たいせつなもの', price: 3000, use: { kind: 'rod', power: 2 },
    usableIn: [],
    desc: 'ボロのつりざおより いい ポケモンが つれる つりざお。',
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

  // もちもの。mon.held に名前で持たせる。効果は battle.js が hold.kind を見て解釈する。
  // 未対応の kind は黙って無視する（データがエンジンより先行してもよい）。
  'オボンのみ': {
    pocket: 'もちもの', price: 500, hold: { kind: 'pinchHeal', threshold: 0.5, ratio: 0.25 },
    desc: 'もたせると、HPが はんぶん いかに なったとき すこし かいふくする（1かいだけ）。',
  },
  'たべのこし': {
    pocket: 'もちもの', price: 1200, hold: { kind: 'endTurnHeal', ratio: 1 / 16 },
    desc: 'もたせると、まいターン すこしずつ HPが かいふくする。',
  },
  'きあいのハチマキ': {
    pocket: 'もちもの', price: 1000, hold: { kind: 'endure', chance: 10 },
    desc: 'もたせると、ときどき ひんしに なる こうげきを HP1で もちこたえる。',
  },
};

// わざマシン。使っても無くならない（何匹にでも教えられる）。
// 昔のシリーズは1回きりだが、覚えさせ先を間違えたときの取り返しがつかないので
// ここでは使い切らない方式にした。
const TMS = [
  ['わざマシン０１', 'のしかかり', 3000],
  ['わざマシン０２', 'かえんほうしゃ', 4000],
  ['わざマシン０３', 'なみのり', 4000],
  ['わざマシン０４', '10まんボルト', 4000],
  ['わざマシン０５', 'はっぱカッター', 2000],
  ['わざマシン０６', 'かみつく', 2000],
  ['わざマシン０７', 'ねんりき', 2000],
  ['わざマシン０８', 'こうごうせい', 2500],
];
for (const [name, move, price] of TMS) {
  ITEMS[name] = {
    pocket: 'わざマシン', price, use: { kind: 'tm', move },
    usableIn: ['field'],
    desc: `${move}を おぼえさせる。なんども つかえる。`,
  };
}

for (const [name, it] of Object.entries(ITEMS)) {
  it.name = name;
  it.use ??= null;
  it.hold ??= null;
  it.usableIn ??= [];
}

export const getItem = (name) => ITEMS[name] ?? null;
export const POCKETS = ['ボール', 'かいふく', 'わざマシン', 'もちもの', 'たいせつなもの'];
