export default {
  id: 'route2',
  name: '２ばんどうろ',
  legend: {
    '.': 'path', ',': 'grass', 'g': 'tallgrass', 'T': 'tree', 'F': 'flower', 'S': 'sign',
    'L': 'ledge', '~': 'water',
  },
  // 南（トキワのもり）から北（ニビシティ）へ。
  // 東の池は なみのり を覚えてから来ると、落ちものが1つ取れる。
  tiles: [
    'TTTTTTTT..TTTTTTTTTT',
    'TTTTTTTT..TTTTTTTTTT',
    'T,,,,,,,..,,,,,,,,,T',
    'T,gggg,,..,,,,,,,,,T',
    'T,gggg,,..,,~~~~~,,T',
    'T,gggg,,..,,~~~~~,,T',
    'T,,,,,,,..,,~~~~~,,T',
    'T,,,,,,,..,,,,,,,,,T',
    'TTTTTLLL..LLLTTTTTTT',
    'T,,,,,,,..,,,,,,,,,T',
    'T,,S,,,,..,,,,,,,,,T',
    'T,,,,,,,..,,,gggg,,T',
    'T,gggg,,..,,,gggg,,T',
    'T,gggg,,..,,,gggg,,T',
    'T,,,,,,,..,,,,,,,,,T',
    'T,,FF,,,..,,,,,FF,,T',
    'T,,,,,,,..,,,,,,,,,T',
    'TTTTTTTT..TTTTTTTTTT',
  ],
  outdoor: true,   // 時間帯で明るさが変わる
  bgm: 'route',
  encounters: {
    rate: 9,
    table: [
      { id: 179, min: 11, max: 14, weight: 20 },  // メリープ(2世代)
      { id: 607, min: 11, max: 14, weight: 12 },  // ヒトモシ(5世代)
      { id: 16, min: 10, max: 13, weight: 18 },   // ポッポ
      { id: 19, min: 10, max: 13, weight: 15 },   // コラッタ
      { id: 41, min: 11, max: 14, weight: 18 },   // ズバット
      { id: 74, min: 11, max: 14, weight: 12 },   // イシツブテ
      { id: 25, min: 11, max: 14, weight: 5 },    // ピカチュウ
    ],
  },
  postgame: {
    rate: 9,
    table: [
      { id: 179, min: 48, max: 51, weight: 20 },
      { id: 607, min: 48, max: 51, weight: 12 },
      { id: 16, min: 47, max: 50, weight: 18 },
      { id: 19, min: 47, max: 50, weight: 15 },
      { id: 41, min: 48, max: 51, weight: 18 },
      { id: 74, min: 48, max: 51, weight: 12 },
      { id: 25, min: 48, max: 51, weight: 5 },
      // 最終進化を低weightで混ぜる（Q-3）
      { id: 608, min: 48, max: 51, weight: 4 },  // ランプラー(←ヒトモシ)
      { id: 180, min: 48, max: 51, weight: 4 },  // モココ(←メリープ)
    ],
  },
  water: {
    surf: {
      rate: 10,
      table: [
        { id: 54, min: 12, max: 18, weight: 60 },   // コダック
        { id: 129, min: 10, max: 15, weight: 40 },  // コイキング
      ],
    },
    fish: {
      1: { chance: 55, table: [{ id: 129, min: 8, max: 12, weight: 100 }] },
      2: {
        chance: 75,
        table: [
          { id: 54, min: 12, max: 18, weight: 55 },
          { id: 129, min: 12, max: 16, weight: 45 },
        ],
      },
    },
  },
  warps: [
    { x: 8, y: 17, to: 'forest', tx: 8, ty: 1, dir: 'down' },
    { x: 9, y: 17, to: 'forest', tx: 9, ty: 1, dir: 'down' },
    { x: 8, y: 0, to: 'nibi', tx: 9, ty: 15, dir: 'up' },
    { x: 9, y: 0, to: 'nibi', tx: 10, ty: 15, dir: 'up' },
  ],
  npcs: [
    {
      id: 'youngster2', x: 12, y: 9, sprite: 'youngster', dir: 'left', sight: 4,
      trainer: 'youngster2',
      lines: ['きたの ニビシティには ジムが あるぞ。'],
    },
    {
      id: 'lass2', x: 5, y: 14, sprite: 'lass', dir: 'right', sight: 4,
      trainer: 'lass2',
      lines: ['いわタイプには みずや くさが よく きくのよ。'],
    },
    {
      id: 'daycare', x: 3, y: 2, sprite: 'prof', dir: 'down',
      lines: [
        'わしは そだてや じゃ。',
        'ポケモンを あずけると あるいた ぶんだけ そだてておく。',
        { daycare: true },
      ],
    },
    {
      id: 'r2hiker', x: 15, y: 2, sprite: 'boy', dir: 'down',
      lines: [
        'きたの やまみちに どうくつが ある。',
        'まっくらだが つよい ポケモンが すんでいるぞ。',
      ],
    },
  ],
  items: [
    { x: 17, y: 4, item: 'ピーピーエイド', n: 1, flag: 'item_route2_pp' },
    { x: 2, y: 6, item: 'スーパーボール', n: 3, flag: 'item_route2_ball' },
  ],
  signs: [
    { x: 3, y: 10, lines: ['２ばんどうろ', '↑ きた ： ニビシティ', '↓ みなみ ： トキワのもり'] },
  ],
};
