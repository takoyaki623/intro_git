export default {
  id: 'gym4',
  name: 'ボレイジム',
  legend: {
    'W': 'wall', 'f': 'floor', 'M': 'mat', 'c': 'cliff', 'S': 'sign',
  },
  // うすぐらい石柱がならぶ。列を ひとつずつ よけながら 奥へ すすむ。
  tiles: [
    'WWWWWWWWWWWW',
    'WffffffffffW',
    'WcffcffcffcW',
    'WffffffffffW',
    'WcffcffcffcW',
    'WffffffffffW',
    'WcffcffcffcW',
    'WffffffffffW',
    'WcffcffcffcW',
    'WSfffffffffW',
    'WWWWWMMWWWWW',
  ],
  bgm: 'gym',
  battleBg: 'indoor',
  encounters: null,
  warps: [
    { x: 5, y: 10, to: 'ghostcave', tx: 6, ty: 1, dir: 'down' },
    { x: 6, y: 10, to: 'ghostcave', tx: 6, ty: 1, dir: 'down' },
  ],
  npcs: [
    {
      id: 'gymghost1', x: 8, y: 3, sprite: 'girl', dir: 'left', sight: 4,
      trainer: 'gymghost1',
      lines: ['ようこそ、まよいびとよ…'],
    },
    {
      id: 'gymghost2', x: 3, y: 7, sprite: 'boy', dir: 'right', sight: 4,
      trainer: 'gymghost2',
      lines: ['リーダーに あうには おれを こえていけ。'],
    },
    {
      id: 'leaderGhost', x: 5, y: 1, sprite: 'leader', dir: 'down',
      trainer: 'leaderGhost',
      lines: [
        'ゴーストバッジが あれば、てにいれる けいけんちが すこし ふえるわ。',
        'バッジが 4つ そろえば、ポケモンリーグの とびらが ひらくはずよ。',
      ],
    },
  ],
  signs: [
    { x: 1, y: 9, lines: ['ボレイジム', 'ジムリーダー ： コトリ', '「さまよう たましいの ちから」'] },
  ],
  items: [],
};
