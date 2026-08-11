export default {
  id: 'ghostcave',
  name: 'ボレイどうくつ',
  legend: {
    '.': 'path', 'c': 'cliff', 'S': 'sign',
  },
  // ハナカゴシティの北。渦を巻くような通路の奥に ゴーストジムがある。
  tiles: [
    'ccccccccccccc',
    'cc.........cc',
    'cc.ccccccc.cc',
    'cc.c.....c.cc',
    'cc.c.ccc.c.cc',
    'cc.c.c.c.c.cc',
    'cc.c.....c.cc',
    'cc.ccccccc.cc',
    'cc.........cc',
    'ccccc..cccccc',
  ],
  bgm: 'cave',
  battleBg: 'cave',
  encounters: {
    rate: 13,
    table: [
      { id: 607, min: 30, max: 33, weight: 30 },  // ヒトモシ
      { id: 633, min: 30, max: 33, weight: 25 },  // モノズ
      { id: 41, min: 29, max: 32, weight: 30 },   // ズバット
      { id: 74, min: 29, max: 32, weight: 15 },   // イシツブテ
    ],
  },
  postgame: {
    rate: 13,
    table: [
      { id: 607, min: 56, max: 59, weight: 30 },
      { id: 633, min: 56, max: 59, weight: 25 },
      { id: 41, min: 55, max: 58, weight: 30 },
      { id: 74, min: 55, max: 58, weight: 15 },
    ],
  },
  warps: [
    { x: 5, y: 9, to: 'hanakago', tx: 7, ty: 2, dir: 'down' },
    { x: 6, y: 9, to: 'hanakago', tx: 8, ty: 2, dir: 'down' },
    { x: 6, y: 1, to: 'gym4', tx: 5, ty: 9, dir: 'up' },
  ],
  npcs: [
    {
      id: 'ghostboy1', x: 2, y: 3, sprite: 'boy', dir: 'down', sight: 4,
      trainer: 'ghostboy1',
      lines: ['この さきは ボレイどうくつ… きみょうな けはいが するだろう？'],
    },
    {
      id: 'ghostgirl1', x: 10, y: 5, sprite: 'girl', dir: 'up', sight: 4,
      trainer: 'ghostgirl1',
      lines: ['ゴーストタイプの わざは ノーマルタイプに きかないの。'],
    },
    {
      id: 'ghostboy2', x: 4, y: 8, sprite: 'youngster', dir: 'right', sight: 4,
      trainer: 'ghostboy2',
      lines: ['この さきに ジムが ある。きを つけろよ。'],
    },
  ],
  items: [
    { x: 2, y: 7, item: 'まんたんのくすり', n: 1, flag: 'item_ghostcave_potion' },
  ],
  signs: [],
};
