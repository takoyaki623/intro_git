export default {
  id: 'hanakago',
  name: 'ハナカゴシティ',
  legend: {
    '.': 'path', ',': 'grass', 'T': 'tree', 'F': 'flower', 'S': 'sign',
    'D': 'door', 'W': 'wall', 'R': 'roof', 'O': 'window',
  },
  // 南が おつきみやま ちいてい こ（なみのりで来る）、北が ボレイどうくつ。
  // くさジムは 西がわ。
  tiles: [
    'TTTTTTTTTTTTTT',
    'TTTTTTT..TTTTT',
    'T,,,,,,,,,,,,T',
    'T,RRRRR,,,,,,T',
    'T,WODOW,,,,,,T',
    'T,,,,,,,,,,,,T',
    'T,,S,,,,F,F,,T',
    'T,,,,,,,,,,,,T',
    'T,,,,,,,,,,,,T',
    'T,,,,,,,,,S,,T',
    'TTTTTTT..TTTTT',
    'TTTTTTTTTTTTTT',
  ],
  outdoor: true,
  bgm: 'town',
  fly: { label: 'ハナカゴシティ', x: 7, y: 9 },
  encounters: null,
  warps: [
    { x: 7, y: 10, to: 'cave2', tx: 9, ty: 8, dir: 'down' },
    { x: 8, y: 10, to: 'cave2', tx: 9, ty: 8, dir: 'down' },
    { x: 7, y: 1, to: 'ghostcave', tx: 5, ty: 8, dir: 'up' },
    { x: 8, y: 1, to: 'ghostcave', tx: 6, ty: 8, dir: 'up' },
    { x: 4, y: 4, to: 'gym3', tx: 5, ty: 9, dir: 'up' },
  ],
  npcs: [
    {
      id: 'hanaboy1', x: 10, y: 3, sprite: 'youngster', dir: 'left', sight: 4,
      trainer: 'hanaboy1',
      lines: ['また いつか しょうぶ しような！'],
    },
    {
      id: 'hanagirl1', x: 10, y: 8, sprite: 'lass', dir: 'left', sight: 4,
      trainer: 'hanagirl1',
      lines: ['モクローと おはなの せわを してるの。'],
    },
    {
      id: 'hanaboy2', x: 5, y: 8, sprite: 'boy', dir: 'up', sight: 3,
      trainer: 'hanaboy2',
      lines: ['ジムリーダーの リンドウは つよいぞ！'],
    },
    {
      id: 'hanaNurse', x: 11, y: 6, sprite: 'nurse', dir: 'down',
      lines: [
        'ハナカゴシティへ ようこそ。',
        'ポケモンを げんきに しますか？',
        {
          ask: true,
          yes: [
            'わかりました。おあずかりします。',
            { heal: true },
            'おまたせしました！ ポケモンは げんきに なりました。',
          ],
          no: ['また いつでも どうぞ！'],
        },
      ],
    },
    {
      id: 'hanaOld', x: 4, y: 7, sprite: 'prof', dir: 'down', wander: true,
      lines: [
        'ここは くさタイプの ジムが ある まち。',
        'きたの どうくつには ゴーストジムも あるそうじゃ。',
      ],
    },
  ],
  items: [],
  signs: [
    { x: 3, y: 6, lines: ['ハナカゴシティ', 'はなと みどりの まち'] },
    { x: 10, y: 9, lines: ['きた ： ボレイどうくつ（ゴーストジム）', 'みなみ ： おつきみやま ちていこ'] },
  ],
};
