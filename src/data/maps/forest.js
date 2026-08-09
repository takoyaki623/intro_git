export default {
  id: 'forest',
  name: 'ときわのもり',
  legend: {
    '.': 'path', ',': 'grass', 'g': 'tallgrass', 'T': 'tree', '~': 'water', 'S': 'sign',
  },
  tiles: [
    'TTTTTTTTTTTTTTTTTTTT',
    'T,,,,,,,,,,,,,,,,,,T',
    'T,gggg,TTTT,gggg,,,T',
    'T,gggg,TTTT,gggg,,,T',
    'T,,,,,,,,,,,,,,,,,,T',
    'T,TTTT,,gggg,,TTTT,T',
    'T,TTTT,,gggg,,TTTT,T',
    'T,,,,,,,gggg,,,,,,,T',
    'T,gggg,,,,,,,,gggg,T',
    'T,gggg,~~~~~~,ggg,,T',
    'T,gggg,~~~~~~,ggg,,T',
    'T,,,,,,~~~~~~,,,,,,T',
    'T,,,,,,,,,,,,,,,,,,T',
    'T,TTTT,,gggg,,TTTT,T',
    'T,TTTT,,gggg,,TTTT,T',
    'T,,,,,,,gggg,,,,,,,T',
    'T,gggg,TTTT,gggg,,,T',
    'T,,,,,,TTTT,,,,,S,,T',
    'T,,,,,,,,..,,,,,,,,T',
    'TTTTTTTT..TTTTTTTTTT',
  ],
  encounters: {
    rate: 10,
    table: [
      { id: 14, min: 4, max: 6, weight: 28 },   // キャタピー
      { id: 15, min: 5, max: 7, weight: 10 },   // トランセル
      { id: 10, min: 4, max: 6, weight: 20 },   // ポッポ
      { id: 12, min: 4, max: 6, weight: 15 },   // コラッタ
      { id: 17, min: 5, max: 7, weight: 17 },   // ピカチュウ
      { id: 129, min: 5, max: 8, weight: 10 },  // コイキング（池のほとり）
    ],
  },
  warps: [
    { x: 8, y: 19, to: 'route1', tx: 8, ty: 1, dir: 'down' },
    { x: 9, y: 19, to: 'route1', tx: 9, ty: 1, dir: 'down' },
  ],
  npcs: [
    {
      id: 'f1girl', x: 4, y: 12, sprite: 'girl', dir: 'down', wander: true,
      lines: [
        'いけの ちかくの くさむらでは たまに コイキングが はねてるの。',
        'よわいけど レベル２０で とんでもない すがたに なるのよ！',
      ],
    },
  ],
  items: [
    // ライチュウへの道はここで開通する
    { x: 17, y: 2, item: 'かみなりのいし', n: 1, flag: 'item_forest_stone' },
    { x: 3, y: 7, item: 'スーパーボール', n: 3, flag: 'item_forest_ball' },
    { x: 16, y: 11, item: 'いいきずぐすり', n: 2, flag: 'item_forest_potion' },
  ],
  signs: [
    { x: 16, y: 17, lines: ['ときわのもり', 'むしポケモンの すみか'] },
  ],
};
