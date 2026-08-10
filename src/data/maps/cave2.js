export default {
  id: 'cave2',
  name: 'おつきみやま ちか１かい',
  legend: {
    '.': 'path', 'c': 'cliff', '~': 'water', 'S': 'sign', '<': 'stairs',
  },
  // 行き止まりの小部屋。地底湖があり、なみのり でしか渡れない先に
  // つきのいし（＝ここではライチュウ用の かみなりのいし の予備）が置いてある。
  tiles: [
    'cccccccccccccccccc',
    'cc<..............c',
    'cc...............c',
    'c......cccc......c',
    'c.....cc~~cc.....c',
    'c....cc~~~~cc....c',
    'c....c~~~~~~c....c',
    'c....c~~~~~~c....c',
    'c....cc~~~~cc....c',
    'c.....cc~~cc.....c',
    'c......c..c......c',
    'c................c',
    'cccccccccccccccccc',
  ],
  bgm: 'cave',
  encounters: {
    rate: 14,
    table: [
      { id: 41, min: 12, max: 16, weight: 40 },   // ズバット
      { id: 74, min: 12, max: 16, weight: 35 },   // イシツブテ
      { id: 75, min: 16, max: 18, weight: 10 },   // ゴローン
      { id: 42, min: 16, max: 18, weight: 15 },   // ゴルバット
    ],
  },
  water: {
    surf: {
      rate: 10,
      table: [
        { id: 54, min: 14, max: 20, weight: 70 },   // コダック
        { id: 129, min: 10, max: 15, weight: 30 },  // コイキング
      ],
    },
    fish: {
      1: { chance: 50, table: [{ id: 129, min: 10, max: 14, weight: 100 }] },
      2: {
        chance: 75,
        table: [
          { id: 54, min: 14, max: 20, weight: 60 },
          { id: 129, min: 14, max: 18, weight: 40 },
        ],
      },
    },
  },
  warps: [
    { x: 2, y: 1, to: 'cave1', tx: 17, ty: 10, dir: 'up' },
  ],
  npcs: [
    {
      id: 'hiker3', x: 14, y: 11, sprite: 'boy', dir: 'left', sight: 5,
      trainer: 'hiker3',
      lines: ['よく こんな おくまで きたな！'],
    },
  ],
  items: [
    // 地底湖のまんなか。なみのり を覚えるまで取れない。
    { x: 8, y: 6, item: 'かみなりのいし', n: 1, flag: 'item_cave2_stone' },
    { x: 16, y: 1, item: 'まんたんのくすり', n: 1, flag: 'item_cave2_potion' },
  ],
  signs: [
    { x: 3, y: 1, lines: ['ちてい こ', 'なみのりが なければ わたれない'] },
  ],
};
