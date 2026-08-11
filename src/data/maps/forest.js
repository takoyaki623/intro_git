export default {
  id: 'forest',
  name: 'トキワのもり',
  legend: {
    '.': 'path', ',': 'grass', 'g': 'tallgrass', 'T': 'tree', '~': 'water', 'S': 'sign',
  },
  tiles: [
    'TTTTTTTT..TTTTTTTTTT',
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
  outdoor: true,   // 時間帯で明るさが変わる
  bgm: 'route',
  encounters: {
    rate: 10,
    table: [
      // コイキングは草むらではなく、池で つり／なみのり で出る
      { id: 280, min: 6, max: 9, weight: 10 },  // ラルトス(3世代)
      { id: 872, min: 6, max: 9, weight: 18 },  // ユキハミ(8世代)
      { id: 661, min: 6, max: 9, weight: 15 },  // ヤヤコマ(6世代)
      { id: 25, min: 7, max: 10, weight: 15 },  // ピカチュウ
      { id: 10, min: 6, max: 9, weight: 20 },   // キャタピー
      { id: 11, min: 7, max: 10, weight: 7 },   // トランセル
      { id: 16, min: 6, max: 9, weight: 10 },   // ポッポ
      { id: 19, min: 6, max: 9, weight: 5 },    // コラッタ
    ],
  },
  postgame: {
    rate: 10,
    table: [
      { id: 280, min: 44, max: 47, weight: 10 },
      { id: 872, min: 44, max: 47, weight: 18 },
      { id: 661, min: 44, max: 47, weight: 15 },
      { id: 25, min: 45, max: 48, weight: 15 },
      { id: 10, min: 44, max: 47, weight: 20 },
      { id: 11, min: 45, max: 48, weight: 7 },
      { id: 16, min: 44, max: 47, weight: 10 },
      { id: 19, min: 44, max: 47, weight: 5 },
    ],
  },
  // 池。なみのりを おぼえた みずポケモンがいれば わたれる。
  // つりざおは 岸に立って みずを むけば つかえる。
  water: {
    surf: {
      rate: 12,
      table: [
        { id: 129, min: 10, max: 18, weight: 70 },   // コイキング
        { id: 130, min: 15, max: 20, weight: 30 },   // ギャラドス
      ],
    },
    fish: {
      1: { chance: 55, table: [{ id: 129, min: 5, max: 10, weight: 100 }] },
      2: {
        chance: 75,
        table: [
          { id: 129, min: 10, max: 15, weight: 65 },
          { id: 130, min: 15, max: 20, weight: 35 },
        ],
      },
    },
  },
  warps: [
    { x: 8, y: 0, to: 'route2', tx: 8, ty: 16, dir: 'up' },
    { x: 9, y: 0, to: 'route2', tx: 9, ty: 16, dir: 'up' },
    { x: 8, y: 19, to: 'tokiwa', tx: 8, ty: 1, dir: 'down' },
    { x: 9, y: 19, to: 'tokiwa', tx: 9, ty: 1, dir: 'down' },
  ],
  npcs: [
    {
      id: 'rival3', x: 9, y: 4, sprite: 'youngster', dir: 'down', sight: 5,
      trainer: 'rival3', when: 'gotStarter',
      lines: ['もりの きたぐちは もう すぐだ。さきに いくぜ！'],
    },
    {
      id: 'f1girl', x: 4, y: 12, sprite: 'girl', dir: 'down', wander: true,
      lines: [
        'いけで つりを すると コイキングが つれるわ。',
        'よわいけど レベル２０で とんでもない すがたに なるのよ！',
      ],
    },
    {
      // 池の南と北、どちらの通り道にも1人ずつ置いてある
      id: 'bugcatcher1', x: 5, y: 12, sprite: 'bugcatcher', dir: 'right', sight: 4,
      trainer: 'bugcatcher1',
      lines: ['トランセルは かたいけど こうげきは にがてなんだ。'],
    },
    {
      id: 'bugcatcher2', x: 14, y: 4, sprite: 'bugcatcher', dir: 'left', sight: 5,
      trainer: 'bugcatcher2',
      lines: ['むしポケモンは そだつのが はやいんだ。'],
    },
    {
      // 池のほとり。つりざおをくれる。
      id: 'fisher', x: 6, y: 9, sprite: 'boy', dir: 'right',
      lines: [
        {
          if: 'gotRod',
          then: [
            'みずべを むいて Ａボタン。それだけで つりが できるぞ。',
            'なみのりを おぼえた ポケモンが いれば いけを わたることも できる。',
          ],
          else: [
            'おっ きみ つりに きょうみは あるかい？',
            'この つりざおを あげよう。もう つかわないからな。',
            { give: 'ボロのつりざお', n: 1 },
            { flag: 'gotRod' },
            'みずべを むいて Ａボタンだ。がんばりな！',
          ],
        },
      ],
    },
  ],
  items: [
    // ライチュウへの道はここで開通する
    { x: 17, y: 2, item: 'かみなりのいし', n: 1, flag: 'item_forest_stone' },
    { x: 3, y: 7, item: 'スーパーボール', n: 3, flag: 'item_forest_ball' },
    { x: 16, y: 11, item: 'いいきずぐすり', n: 2, flag: 'item_forest_potion' },
    { x: 10, y: 4, item: 'オボンのみ', n: 1, flag: 'item_forest_oran' },
  ],
  signs: [
    { x: 16, y: 17, lines: ['トキワのもり', 'むしポケモンの すみか', '↑ きた ： ２ばんどうろ'] },
  ],
  statics: [
    {
      x: 10, y: 1, id: 12, lv: 15, flag: 'boss_forest', prize: 'オボンのみ',
      lines: ['バサッ、バサッ…！', '大きな むしポケモンが とんでいる！'],
    },
  ],
};
