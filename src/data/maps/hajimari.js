export default {
  id: 'hajimari',
  name: 'はじまりのむら',
  legend: {
    '.': 'path', ',': 'grass', 'g': 'tallgrass', 'T': 'tree', 'F': 'flower',
    'S': 'sign', 'D': 'door', 'W': 'wall', 'R': 'roof', 'O': 'window',
  },
  tiles: [
    'TTTTTTTTT..TTTTTTTTT',
    'TTTTTTTTT..TTTTTTTTT',
    'T,,,,,,,,..,,,,,,,,T',
    'T,RRRRR,,..,,RRRRR,T',
    'T,WOWDW,,..,,WOWDW,T',
    'T,,,,,,,,..,,,,,,,,T',
    'T,,,,,,,,..,,,,,,,,T',
    'T,,S,,,,,..,,,,,S,,T',
    'T,,,,,,,,..,,,,,,,,T',
    'T,,,,,,,,..,,,,,,,,T',
    'T,RRRRRRR,,RRRRRRRRT',
    'T,WWWDWWW,,WWWWDWWWT',
    'T,,,,,,,,,,,,,,,,,,T',
    'T,,,,,,,,,,,,,,,,,,T',
    'T,,FF,,,,,,,,,,FF,,T',
    'T,,,,,,,,,,,,,,,,,,T',
    'TTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTT',
  ],
  bgm: 'town',
  // そらをとぶ の行き先。着地点は必ず歩ける場所にする。
  fly: { label: 'はじまりのむら', x: 9, y: 12 },
  encounters: null,
  warps: [
    { x: 9, y: 0, to: 'route1', tx: 8, ty: 20, dir: 'up' },
    { x: 10, y: 0, to: 'route1', tx: 9, ty: 20, dir: 'up' },
    { x: 5, y: 4, to: 'myhouse', tx: 4, ty: 6, dir: 'up' },
    { x: 5, y: 11, to: 'center', tx: 6, ty: 8, dir: 'up' },
    { x: 15, y: 11, to: 'mart', tx: 5, ty: 6, dir: 'up' },
    { x: 16, y: 4, to: 'gym', tx: 5, ty: 9, dir: 'up' },
  ],
  npcs: [
    {
      id: 'prof', x: 8, y: 13, sprite: 'prof', dir: 'down',
      lines: [
        { if: 'gotStarter', then: [
          'ポケモンは たびの あいぼうじゃ。',
          'きたの １ばんどうろで くさむらに はいれば やせいの ポケモンに あえる。',
          'ボールを つかって なかまを ふやすのじゃ！',
        ], else: [
          'おお よく きたな！',
          'わしは この むらの ポケモンはかせ。',
          'きみに さいしょの ポケモンを ひとつ わたそう。',
          'さあ すきなのを えらびなさい！',
          { chooseStarter: [1, 4, 7] },
        ] },
      ],
    },
    {
      id: 'boy1', x: 4, y: 8, sprite: 'boy', dir: 'down', wander: true,
      lines: [
        'くさむらには やせいの ポケモンが いるんだ。',
        'ポケモンを つれてないと あぶないよ！',
      ],
    },
    {
      id: 'girl1', x: 14, y: 6, sprite: 'girl', dir: 'left', wander: true,
      lines: [
        'まんなかの おおきい たてものが ポケモンセンター。',
        'ポケモンが よわっても ただで げんきに してくれるのよ。',
      ],
    },
  ],
  signs: [
    { x: 3, y: 7, lines: ['はじまりのむら', 'ここから すべてが はじまる'] },
    { x: 16, y: 7, lines: ['↑ きた ： １ばんどうろ', 'ひだり ： ポケモンセンター', 'みぎ ： フレンドリィショップ'] },
    { x: 12, y: 5, lines: ['ときわジム', 'ジムリーダー ： マチス', 'でんきタイプの つかいて'] },
  ],
};
