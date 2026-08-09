export default {
  id: 'myhouse',
  name: 'じぶんのいえ',
  legend: {
    'W': 'wall', 'f': 'floor', 'B': 'bed', 'P': 'pc', 'M': 'mat', 'C': 'counter',
  },
  tiles: [
    'WWWWWWWWWW',
    'WffffffffW',
    'WBfffffPfW',
    'WffffffffW',
    'WffffffffW',
    'WffffffffW',
    'WffffffffW',
    'WWWWMMWWWW',
  ],
  bgm: 'town',
  encounters: null,
  warps: [
    { x: 4, y: 7, to: 'hajimari', tx: 5, ty: 5, dir: 'down' },
    { x: 5, y: 7, to: 'hajimari', tx: 5, ty: 5, dir: 'down' },
  ],
  npcs: [
    {
      id: 'mom', x: 6, y: 4, sprite: 'girl', dir: 'down',
      lines: [
        'いってらっしゃい！',
        'つかれたら ベッドで やすみなさい。ポケモンも げんきに なるわよ。',
      ],
    },
  ],
  items: [
    { x: 8, y: 2, item: 'きずぐすり', n: 1, flag: 'item_home_potion' },
  ],
  signs: [],
};
