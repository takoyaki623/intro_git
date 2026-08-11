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
    'T,WOWDW,,..,,WOWOW,T',
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
  outdoor: true,   // 時間帯で明るさが変わる
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
  ],
  npcs: [
    {
      id: 'prof', x: 8, y: 13, sprite: 'prof', dir: 'down',
      lines: [
        { if: 'gotStarter', then: [
          'ポケモンは たびの あいぼうじゃ。',
          'きたの １ばんどうろで くさむらに はいれば やせいの ポケモンに あえる。',
          'そだててから そのさきの トキワシティの ジムに いどむと よい。',
          'ボールを つかって なかまを ふやすのじゃ！',
          { if: 'dexReady10', then: [
            { if: 'dexReward10', then: [], else: [
              'おお、ずかんが １０しゅるいも うまっておる！',
              'これは わざマシンを あげよう。',
              { give: 'わざマシン０２', n: 1 },
              { flag: 'dexReward10' },
            ] },
          ], else: [] },
          { if: 'dexReady20', then: [
            { if: 'dexReward20', then: [], else: [
              'ほう、２０しゅるいとは たいしたものじゃ！',
              'ハイパーボールを わたしておこう。',
              { give: 'ハイパーボール', n: 10 },
              { flag: 'dexReward20' },
            ] },
          ], else: [] },
          { if: 'dexReadyAll', then: [
            { if: 'dexRewardAll', then: [], else: [
              'なんと！ ずかんを コンプリートしたのか！',
              'わしからは これを あげよう。ひかるおまもりじゃ。',
              'もっているだけで、やせいポケモンを つかまえやすくなるぞ。',
              { give: 'ひかるおまもり', n: 1 },
              { flag: 'dexRewardAll' },
            ] },
          ], else: [] },
        ], else: [
          'おお よく きたな！',
          'わしは この むらの ポケモンはかせ。',
          'きみに さいしょの ポケモンを ひとつ わたそう。',
          'さあ すきなのを えらびなさい！',
          { chooseStarter: [722, 4, 258] },
        ] },
      ],
    },
    {
      id: 'rival1', x: 9, y: 6, sprite: 'youngster', dir: 'down', sight: 6,
      trainer: 'rival1', when: 'gotStarter', unless: 'hallOfFame',
      lines: ['また しょうぶ しような！'],
    },
    {
      // 殿堂入り後、同じ場所に「成長したライバル」として再戦できる（Q-2）。
      id: 'rival6', x: 9, y: 6, sprite: 'youngster', dir: 'down', sight: 6,
      trainer: 'rival6', when: 'hallOfFame',
      lines: ['また しょうぶ しような！'],
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
    { x: 3, y: 7, lines: ['はじまりのむら', 'ちいさな むら', 'ここから すべてが はじまる'] },
    { x: 16, y: 7, lines: ['↑ きた ： １ばんどうろ', 'そのさきに トキワシティ', 'ジムは あちらに ある'] },
  ],
};
