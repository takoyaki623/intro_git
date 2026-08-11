export default {
  id: 'gym2',
  name: 'ニビジム',
  legend: {
    'W': 'wall', 'f': 'floor', 'M': 'mat', 'c': 'cliff', 'S': 'sign',
  },
  // 岩を置いて道をくねらせる。まっすぐは進めない。
  tiles: [
    'WWWWWWWWWWWW',
    'WffffffffffW',
    'WffcccccfffW',
    'WffffffcfffW',
    'WfcccffcfffW',
    'WfcffffcfffW',
    'WfcffcccfffW',
    'WffffffffffW',
    'WffcccccfffW',
    'WSfffffffffW',
    'WWWWWMMWWWWW',
  ],
  bgm: 'gym',
  battleBg: 'indoor',
  encounters: null,
  warps: [
    { x: 5, y: 10, to: 'nibi', tx: 5, ty: 10, dir: 'down' },
    { x: 6, y: 10, to: 'nibi', tx: 5, ty: 10, dir: 'down' },
  ],
  npcs: [
    {
      id: 'gymrock1', x: 9, y: 7, sprite: 'youngster', dir: 'left', sight: 4,
      trainer: 'gymrock1',
      lines: ['いわは かたい。だが みずには かなわない。'],
    },
    {
      id: 'gymrock2', x: 10, y: 4, sprite: 'bugcatcher', dir: 'left', sight: 3,
      trainer: 'gymrock2',
      lines: ['ぼうぎょが たかいと なかなか たおれないだろ。'],
    },
    {
      id: 'leaderIwa', x: 5, y: 1, sprite: 'leader', dir: 'down',
      trainer: 'leaderIwa',
      lines: [
        'いわバッジが あれば そらを とべる。',
        'いちど 行った まちなら どこへでも もどれるぞ。',
      ],
    },
  ],
  signs: [
    { x: 1, y: 9, lines: ['ニビジム', 'ジムリーダー ： イワオ', '「いしのように かたい こころ」'] },
  ],
  items: [],
};
