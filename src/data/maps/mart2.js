export default {
  id: 'mart2',
  name: 'フレンドリィショップ',
  legend: {
    'W': 'wall', 'f': 'floor', 'C': 'counter', 'M': 'mat',
  },
  tiles: [
    'WWWWWWWWWWWW',
    'WffffffffffW',
    'WfCCCCCCfffW',
    'WffffffffffW',
    'WffffffffffW',
    'WffffffffffW',
    'WffffffffffW',
    'WWWWWMMWWWWW',
  ],
  bgm: 'town',
  encounters: null,
  warps: [
    { x: 5, y: 7, to: 'nibi', tx: 4, ty: 5, dir: 'down' },
    { x: 6, y: 7, to: 'nibi', tx: 4, ty: 5, dir: 'down' },
  ],
  npcs: [
    {
      id: 'clerk2', x: 4, y: 1, sprite: 'boy', dir: 'down',
      lines: [
        'いらっしゃいませ！ ニビシティてんへ ようこそ。',
        {
          shop: [
            'モンスターボール', 'スーパーボール',
            'きずぐすり', 'いいきずぐすり', 'すごいきずぐすり',
            'どくけし', 'まひなおし', 'やけどなおし', 'めざめるドリンク',
            'ピーピーエイド',
            'げんきのかけら',
            'むしよけスプレー', 'あなぬけのヒモ', 'オボンのみ',
          ],
        },
      ],
    },
  ],
  signs: [],
  items: [],
};
