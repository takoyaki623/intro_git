export default {
  id: 'hanakago',
  name: 'ハナカゴシティ',
  legend: {
    '.': 'path', ',': 'grass', 'T': 'tree', 'F': 'flower', 'S': 'sign',
    'D': 'door', 'W': 'wall', 'R': 'roof', 'O': 'window',
  },
  // 南が ハナダシティ、北が ボレイどうくつ。
  // 屋根の3棟は西から くさジム／ポケモンセンター／ショップ。
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
    'T,,,,,,,,,,,,,,,,,,S,,T',
    'T,,,,,,,,,,,,,,,,,,,,,T',
    'TTTTTTTTTT..TTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTT',
  ],
  outdoor: true,
  bgm: 'town',
  fly: { label: 'ハナカゴシティ', x: 11, y: 9 },
  encounters: null,
  warps: [
    { x: 10, y: 11, to: 'hanada', tx: 10, ty: 2, dir: 'down' },
    { x: 11, y: 11, to: 'hanada', tx: 11, ty: 2, dir: 'down' },
    { x: 10, y: 1, to: 'ghostcave', tx: 5, ty: 8, dir: 'up' },
    { x: 11, y: 1, to: 'ghostcave', tx: 6, ty: 8, dir: 'up' },
    { x: 4, y: 4, to: 'gym3', tx: 5, ty: 9, dir: 'up' },
    { x: 11, y: 4, to: 'center4', tx: 6, ty: 8, dir: 'up' },
    { x: 18, y: 4, to: 'mart3', tx: 5, ty: 6, dir: 'up' },
  ],
  npcs: [
    {
      id: 'hanaboy1', x: 5, y: 7, sprite: 'youngster', dir: 'right', sight: 4,
      trainer: 'hanaboy1',
      lines: ['また いつか しょうぶ しような！'],
    },
    {
      id: 'hanagirl1', x: 16, y: 7, sprite: 'lass', dir: 'left', sight: 4,
      trainer: 'hanagirl1',
      lines: ['モクローと おはなの せわを してるの。'],
    },
    {
      id: 'hanaboy2', x: 11, y: 8, sprite: 'boy', dir: 'up', sight: 3,
      trainer: 'hanaboy2',
      lines: ['ジムリーダーの リンドウは つよいぞ！'],
    },
    {
      id: 'hanaOld', x: 7, y: 9, sprite: 'prof', dir: 'down', wander: true,
      lines: [
        'ここは くさタイプの ジムが ある まち。',
        'きたの どうくつには ゴーストジムも あるそうじゃ。',
      ],
    },
  ],
  items: [],
  signs: [
    { x: 2, y: 6, lines: ['ハナカゴシティ', 'はなと みどりの まち'] },
    { x: 19, y: 9, lines: ['きた ： ボレイどうくつ（ゴーストジム）', 'みなみ ： おつきみやま ちていこ'] },
  ],
  statics: [
    // 花だんの あいだに すわる まちの ぬし。だれも しょうたいを しらない。
    {
      x: 10, y: 6, id: 3, lv: 26, postgameLv: 57, flag: 'boss_hanakago',
      lines: ['ふわ…', 'はなだんの あいだから、おおきな いきものが ゆっくり たちあがった！'],
    },
  ],
};
