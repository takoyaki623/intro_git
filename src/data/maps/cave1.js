export default {
  id: 'cave1',
  name: 'おつきみやま １かい',
  legend: {
    '.': 'path', 'c': 'cliff', 'S': 'sign', '>': 'stairs',
  },
  // 岩壁で道を分ける。まっすぐ北へ抜けるだけなら短いが、
  // 東へ回ると地下へ降りる階段がある。
  tiles: [
    'cccccccccccccccccccc',
    'c........cc........c',
    'c.cccccc.cc.cccccc.c',
    'c.cccccc.cc.cccccc.c',
    'c........cc........c',
    'c.cccc.............c',
    'c.cccc.cccccccccc..c',
    'c......cccccccccc..c',
    'c.cccc.cc......cc..c',
    'c.cccc.cc.cccc.cc..c',
    'c......cc.cccc.cc.>c',
    'c.cccccc.......cc..c',
    'c.cccccc.cccc..cc..c',
    'c........cccc......c',
    'cccccccc..cccccccccc',
    'cccccccc..cccccccccc',
  ],
  bgm: 'cave',
  encounters: {
    rate: 12,
    table: [
      { id: 41, min: 13, max: 16, weight: 45 },   // ズバット
      { id: 74, min: 13, max: 16, weight: 40 },   // イシツブテ
      { id: 12, min: 13, max: 16, weight: 15 },   // コラッタ
    ],
  },
  warps: [
    { x: 8, y: 15, to: 'nibi', tx: 8, ty: 2, dir: 'down' },
    { x: 9, y: 15, to: 'nibi', tx: 9, ty: 2, dir: 'down' },
    { x: 18, y: 10, to: 'cave2', tx: 2, ty: 2, dir: 'down' },
  ],
  npcs: [
    {
      id: 'hiker1', x: 4, y: 13, sprite: 'boy', dir: 'right', sight: 4,
      trainer: 'hiker1',
      lines: ['いわタイプは かたいだろう？'],
    },
    {
      id: 'hiker2', x: 17, y: 5, sprite: 'youngster', dir: 'down', sight: 4,
      trainer: 'hiker2',
      lines: ['ちかには もっと つよい やつが いるぜ。'],
    },
  ],
  items: [
    { x: 1, y: 1, item: 'げんきのかけら', n: 1, flag: 'item_cave1_revive' },
    { x: 18, y: 1, item: 'ハイパーボール', n: 2, flag: 'item_cave1_ball' },
  ],
  signs: [],
};
