export default {
  id: 'hanada',
  name: 'ハナダシティ',
  legend: {
    '.': 'path', ',': 'grass', 'T': 'tree', 'F': 'flower', 'S': 'sign',
    'D': 'door', 'W': 'wall', 'R': 'roof', 'O': 'window',
  },
  // 南が おつきみやま ちいてい こ（なみのりで来る）、北が ハナカゴシティ。
  // 屋根の3棟は西から みずジム／ポケモンセンター／ショップ。
  tiles: [
    'TTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTT..TTTTTTTTTTT',
    'T,,,,,,,,,,,,,,,,,,,,,T',
    'T,RRRRR,,RRRRR,,RRRRR,T',
    'T,WODOW,,WODOW,,WODOW,T',
    'T,,,,,,,,,,,,,,,,,,,,,T',
    'T,S,,,,,,F,F,,,,,,,,,,T',
    'T,,,,,,,,,,,,,,,,,,,,,T',
    'T,,,,,,,,,,,,,,,,,,,,,T',
    'T,,,,,,,,,,,,,,,,S,,,,T',
    'T,,,,,,,,,,,,,,,,,,,,,T',
    'TTTTTTTTTT..TTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTT',
  ],
  outdoor: true,
  bgm: 'town',
  fly: { label: 'ハナダシティ', x: 11, y: 9 },
  encounters: null,
  warps: [
    { x: 10, y: 11, to: 'cave2', tx: 9, ty: 8, dir: 'down' },
    { x: 11, y: 11, to: 'cave2', tx: 9, ty: 8, dir: 'down' },
    { x: 10, y: 1, to: 'hanakago', tx: 10, ty: 10, dir: 'up' },
    { x: 11, y: 1, to: 'hanakago', tx: 11, ty: 10, dir: 'up' },
    { x: 4, y: 4, to: 'gym5', tx: 5, ty: 9, dir: 'up' },
    { x: 11, y: 4, to: 'center5', tx: 6, ty: 8, dir: 'up' },
    { x: 18, y: 4, to: 'mart4', tx: 5, ty: 6, dir: 'up' },
  ],
  npcs: [
    {
      id: 'hanadaGirl1', x: 5, y: 7, sprite: 'lass', dir: 'right', sight: 4,
      trainer: 'hanadaGirl1',
      lines: ['ここは みずと つりの まちよ！'],
    },
    {
      id: 'hanadaBoy1', x: 16, y: 7, sprite: 'boy', dir: 'left', sight: 4,
      trainer: 'hanadaBoy1',
      lines: ['カスミさんの ジムは この まちの じまんなんだ。'],
    },
    {
      id: 'hanadaOld', x: 7, y: 9, sprite: 'prof', dir: 'down', wander: true,
      lines: [
        'ここは みずタイプの ジムが ある まち。',
        'きたには ハナカゴシティが あるぞ。',
      ],
    },
  ],
  items: [
    { x: 20, y: 9, item: 'いいつりざお', n: 1, flag: 'item_hanada_rod' },
  ],
  signs: [
    { x: 2, y: 6, lines: ['ハナダシティ', 'みずと つりの まち'] },
    { x: 17, y: 9, lines: ['きた ： ハナカゴシティ', 'みなみ ： おつきみやま ちていこ'] },
  ],
};
