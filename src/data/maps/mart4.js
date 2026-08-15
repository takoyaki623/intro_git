export default {
  id: 'mart4',
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
  battleBg: 'indoor',
  encounters: null,
  warps: [
    { x: 5, y: 7, to: 'hanada', tx: 18, ty: 5, dir: 'down' },
    { x: 6, y: 7, to: 'hanada', tx: 18, ty: 5, dir: 'down' },
  ],
  npcs: [
    {
      id: 'clerk4', x: 4, y: 1, sprite: 'boy', dir: 'down',
      lines: [
        'いらっしゃいませ！ ハナダシティてんへ ようこそ。',
        {
          shop: [
            'モンスターボール', 'スーパーボール', 'ハイパーボール',
            'きずぐすり', 'いいきずぐすり', 'すごいきずぐすり',
            'どくけし', 'まひなおし', 'やけどなおし', 'めざめるドリンク',
            'ピーピーエイド', 'ピーピーリカバー',
            'げんきのかけら', 'いいつりざお',
            'むしよけスプレー', 'あなぬけのヒモ', 'オボンのみ',
            'みずのいし',
            'わざマシン０１', 'わざマシン０２', 'わざマシン０３', 'わざマシン０４',
            'わざマシン０５', 'わざマシン０６', 'わざマシン０７', 'わざマシン０８',
            'わざマシン０９', 'わざマシン１０', 'わざマシン１１', 'わざマシン１２',
            'わざマシン１３', 'わざマシン１４', 'わざマシン１５', 'わざマシン１６',
            'わざマシン１７', 'わざマシン１８', 'わざマシン１９',
          ],
        },
      ],
    },
  ],
  signs: [],
  items: [],
};
