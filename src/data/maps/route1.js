export default {
  id: 'route1',
  name: '１ばんどうろ',
  legend: {
    '.': 'path', ',': 'grass', 'g': 'tallgrass', 'T': 'tree', 'F': 'flower', 'S': 'sign',
    'L': 'ledge',
  },
  tiles: [
    'TTTTTTTT..TTTTTTTTTT',
    'TTTTTTTT..TTTTTTTTTT',
    'T,,,,,,,..,,,,,,,,,T',
    'T,gggg,,..,,gggg,,,T',
    'T,gggg,,..,,gggg,,,T',
    'T,gggg,,..,,gggg,,,T',
    'T,,,,,,,..,,,,,,,,,T',
    'T,,,,,,,..,,,,,S,,,T',
    'T,,,,,,,..,,,,,,,,,T',
    'TTTTLLLL..LLLLTTTTTT',   // 段差。北からは飛び降りられるが、南からは登れない
    'T,,,,,,,..,,,,,,,,,T',
    'T,gggggg..gggggg,,,T',
    'T,gggggg..gggggg,,,T',
    'T,gggggg..gggggg,,,T',
    'T,,,,,,,..,,,,,,,,,T',
    'T,,,,,,,..,,,,,,,,,T',
    'TTTTTTLL..LLTTTTTTTT',
    // 入口のすぐ北。道のわきがそのまま草むらなので、寄り道せずに育てられる
    'T,gggggg..gggggg,,,T',
    'T,gggggg..gggggg,,,T',
    'T,,FF,,,..,,,FF,,,,T',
    'TTTTTTTT..TTTTTTTTTT',
    'TTTTTTTT..TTTTTTTTTT',
  ],
  outdoor: true,   // 時間帯で明るさが変わる
  bgm: 'route',
  // rate = 草むら1歩あたりの遭遇率(%)
  encounters: {
    rate: 8,
    table: [
      { id: 396, min: 3, max: 5, weight: 25 },  // ムックル(4世代)
      { id: 921, min: 3, max: 5, weight: 20 },  // パモ(9世代)
      { id: 819, min: 3, max: 5, weight: 20 },  // ホシガリス(8世代)
      { id: 16, min: 3, max: 5, weight: 15 },   // ポッポ
      { id: 19, min: 3, max: 5, weight: 10 },   // コラッタ
      { id: 10, min: 2, max: 4, weight: 7 },    // キャタピー
      { id: 25, min: 4, max: 6, weight: 3 },    // ピカチュウ
    ],
  },
  // クリア後（殿堂入り後）はこちらを引く。育成場所として使い続けられるように。
  postgame: {
    rate: 8,
    table: [
      { id: 396, min: 40, max: 45, weight: 25 },
      { id: 921, min: 40, max: 45, weight: 20 },
      { id: 819, min: 40, max: 45, weight: 20 },
      { id: 16, min: 40, max: 45, weight: 15 },
      { id: 19, min: 40, max: 45, weight: 10 },
      { id: 10, min: 38, max: 43, weight: 7 },
      { id: 25, min: 42, max: 47, weight: 3 },
    ],
  },
  warps: [
    { x: 8, y: 21, to: 'hajimari', tx: 9, ty: 1, dir: 'down' },
    { x: 9, y: 21, to: 'hajimari', tx: 10, ty: 1, dir: 'down' },
    { x: 8, y: 0, to: 'tokiwa', tx: 8, ty: 13, dir: 'up' },
    { x: 9, y: 0, to: 'tokiwa', tx: 9, ty: 13, dir: 'up' },
  ],
  npcs: [
    {
      id: 'r1boy', x: 13, y: 10, sprite: 'boy', dir: 'down', wander: true,
      lines: [
        'ポケモンの HPが へったら ボールを なげるチャンス！',
        'ねむらせたり まひさせたり すると もっと つかまえやすくなるぞ。',
      ],
    },
    {
      // 道の右側を歩くと視線に入る。左側を通れば避けられる。
      id: 'youngster1', x: 12, y: 7, sprite: 'youngster', dir: 'left', sight: 4,
      trainer: 'youngster1',
      lines: ['きみの ポケモン つよかったなあ。'],
    },
    {
      id: 'lass1', x: 6, y: 15, sprite: 'lass', dir: 'right', sight: 3,
      trainer: 'lass1',
      lines: ['そらを とぶ ポケモンは じめんの わざが きかないのよ。'],
    },
  ],
  items: [
    { x: 17, y: 4, item: 'モンスターボール', n: 3, flag: 'item_route1_ball' },
    { x: 2, y: 18, item: 'きずぐすり', n: 2, flag: 'item_route1_potion' },
  ],
  // ぬしポケモン。倒す/つかまえると二度と出てこない。にげれば残る。
  statics: [
    {
      x: 4, y: 10, id: 26, lv: 10, flag: 'boss_route1', prize: 'きあいのハチマキ',
      lines: ['グルル…！', 'つよそうな ポケモンが にらんでいる！'],
    },
  ],
  signs: [
    { x: 15, y: 7, lines: ['１ばんどうろ', '↑ きた ： トキワシティ', '↓ みなみ ： はじまりのむら'] },
  ],
};
