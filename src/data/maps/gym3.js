export default {
  id: 'gym3',
  name: 'ハナカゴジム',
  legend: {
    'W': 'wall', 'f': 'floor', 'M': 'mat', 'c': 'cliff', 'S': 'sign',
  },
  // 植木鉢を並べたような格子状の障害物。まっすぐには進めない。
  tiles: [
    'WWWWWWWWWWWW',
    'WffffffffffW',
    'WfccfccfccfW',
    'WffffffffffW',
    'WfccfccfccfW',
    'WffffffffffW',
    'WfccfccfccfW',
    'WffffffffffW',
    'WfccfccfccfW',
    'WSfffffffffW',
    'WWWWWMMWWWWW',
  ],
  bgm: 'gym',
  battleBg: 'indoor',
  encounters: null,
  warps: [
    { x: 5, y: 10, to: 'hanakago', tx: 4, ty: 5, dir: 'down' },
    { x: 6, y: 10, to: 'hanakago', tx: 4, ty: 5, dir: 'down' },
  ],
  npcs: [
    {
      id: 'gymgrass1', x: 8, y: 3, sprite: 'lass', dir: 'left', sight: 4,
      trainer: 'gymgrass1',
      lines: ['ここから さきは くさの じんちだよ！'],
    },
    {
      id: 'gymgrass2', x: 3, y: 7, sprite: 'bugcatcher', dir: 'right', sight: 4,
      trainer: 'gymgrass2',
      lines: ['リーダーに あうまえに ぼくを たおしていけ！'],
    },
    {
      id: 'leaderKusa', x: 5, y: 1, sprite: 'leader', dir: 'down',
      trainer: 'leaderKusa',
      lines: [
        'くさバッジが あれば、やせいポケモンが すこし つかまえやすく なるはずよ。',
        'つぎは このさきの どうくつに ゴーストジムが あるわ。',
      ],
    },
  ],
  signs: [
    { x: 1, y: 9, lines: ['ハナカゴジム', 'ジムリーダー ： リンドウ', '「くさの いのちの ちから」'] },
  ],
  items: [],
};
