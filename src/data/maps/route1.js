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
    'T,,,,,,,..,,,,,,,,,T',
    'T,,FF,,,..,,,FF,,,,T',
    'T,,,,,,,..,,,,,,,,,T',
    'TTTTTTTT..TTTTTTTTTT',
    'TTTTTTTT..TTTTTTTTTT',
  ],
  // rate = 草むら1歩あたりの遭遇率(%)
  encounters: {
    rate: 8,
    table: [
      { id: 10, min: 2, max: 4, weight: 35 },   // ポッポ
      { id: 12, min: 2, max: 4, weight: 35 },   // コラッタ
      { id: 14, min: 2, max: 3, weight: 20 },   // キャタピー
      { id: 17, min: 3, max: 5, weight: 10 },   // ピカチュウ
    ],
  },
  warps: [
    { x: 8, y: 21, to: 'hajimari', tx: 9, ty: 1, dir: 'down' },
    { x: 9, y: 21, to: 'hajimari', tx: 10, ty: 1, dir: 'down' },
    { x: 8, y: 0, to: 'forest', tx: 8, ty: 18, dir: 'up' },
    { x: 9, y: 0, to: 'forest', tx: 9, ty: 18, dir: 'up' },
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
  signs: [
    { x: 15, y: 7, lines: ['１ばんどうろ', '↑ きた ： ときわのもり'] },
  ],
};
