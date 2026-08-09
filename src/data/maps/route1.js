export default {
  id: 'route1',
  name: '１ばんどうろ',
  legend: {
    '.': 'path', ',': 'grass', 'g': 'tallgrass', 'T': 'tree', 'F': 'flower', 'S': 'sign',
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
    'TTTT,,,,..,,,,TTTTTT',
    'T,,,,,,,..,,,,,,,,,T',
    'T,gggggg..gggggg,,,T',
    'T,gggggg..gggggg,,,T',
    'T,gggggg..gggggg,,,T',
    'T,,,,,,,..,,,,,,,,,T',
    'T,,,,,,,..,,,,,,,,,T',
    'TTTTTT,,..,,TTTTTTTT',
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
  ],
  signs: [
    { x: 15, y: 7, lines: ['１ばんどうろ', '↑ きた ： ときわのもり'] },
  ],
};
