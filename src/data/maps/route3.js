export default {
  id: 'route3',
  name: '３ばんどうろ',
  legend: {
    '.': 'path', ',': 'grass', 'g': 'tallgrass', 'T': 'tree', 'S': 'sign',
  },
  // 西が おつきみやま ちか（なみのりを覚えてからでないと来られない）、
  // 東が ポケモンリーグ前のセンター。リーグ前さいごの育成場所。
  tiles: [
    'TTTTTTTTTTTTTTTTTTTT',
    'T,,,,,,,,,,,,,,,,,,T',
    'T,gggggg,,,,gggggg,T',
    'T,gggggg,,,,gggggg,T',
    'T,gggggg,,,,gggggg,T',
    'T,,,,,,,,,,,,,,,,,,T',
    '.,,,,,,,,,,,,,,,,,,T',
    'T,gggggg,,,,gggggg,T',
    'T,gggggg,,,,gggggg,T',
    'T,gggggg,,,,gggggg,T',
    'T,,,,,,,,,,,,,,,,,,.',
    'TTTTTTTTTTTTTTTTTTTT',
  ],
  outdoor: true,
  bgm: 'route',
  encounters: {
    rate: 10,
    table: [
      { id: 397, min: 24, max: 27, weight: 22 },  // ムクバード
      { id: 922, min: 24, max: 27, weight: 22 },  // パモット
      { id: 820, min: 25, max: 28, weight: 18 },  // ヨクバリス
      { id: 662, min: 24, max: 27, weight: 18 },  // ヒノヤコマ
      { id: 42, min: 25, max: 28, weight: 12 },   // ゴルバット
      { id: 20, min: 24, max: 27, weight: 8 },    // ラッタ
    ],
  },
  postgame: {
    rate: 10,
    table: [
      { id: 397, min: 62, max: 65, weight: 22 },
      { id: 922, min: 62, max: 65, weight: 22 },
      { id: 820, min: 63, max: 66, weight: 18 },
      { id: 662, min: 62, max: 65, weight: 18 },
      { id: 42, min: 63, max: 66, weight: 12 },
      { id: 20, min: 62, max: 65, weight: 8 },
    ],
  },
  warps: [
    { x: 0, y: 6, to: 'cave2', tx: 16, ty: 11, dir: 'left' },
    { x: 19, y: 10, to: 'leaguecenter', tx: 1, ty: 6, dir: 'right' },
  ],
  npcs: [
    {
      id: 'ace1', x: 6, y: 5, sprite: 'youngster', dir: 'right', sight: 4,
      trainer: 'ace1',
      lines: ['この さきは ポケモンリーグだ。じゅんびは いいか？'],
    },
    {
      id: 'ace2', x: 13, y: 9, sprite: 'lass', dir: 'left', sight: 4,
      trainer: 'ace2',
      lines: ['リーグちょうせんの まえに、わたしと しょうぶよ！'],
    },
  ],
  items: [
    { x: 3, y: 10, item: 'すごいきずぐすり', n: 2, flag: 'item_route3_potion' },
    { x: 16, y: 1, item: 'ハイパーボール', n: 3, flag: 'item_route3_ball' },
    { x: 13, y: 1, item: 'きあいのハチマキ', n: 1, flag: 'item_route3_band' },
  ],
  signs: [
    { x: 9, y: 5, lines: ['３ばんどうろ', '→ ポケモンリーグ', 'これより さき、かいふくは できない'] },
  ],
};
