export default {
  id: 'mart3',
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
    { x: 5, y: 7, to: 'hanakago', tx: 18, ty: 5, dir: 'down' },
    { x: 6, y: 7, to: 'hanakago', tx: 18, ty: 5, dir: 'down' },
  ],
  npcs: [
    {
      id: 'clerk3', x: 4, y: 1, sprite: 'boy', dir: 'down',
      lines: [
        'いらっしゃいませ！ ハナカゴシティてんへ ようこそ。',
        {
          shop: [
            'モンスターボール', 'スーパーボール', 'ハイパーボール',
            'きずぐすり', 'いいきずぐすり', 'すごいきずぐすり', 'まんたんのくすり',
            'どくけし', 'まひなおし', 'やけどなおし', 'めざめるドリンク', 'なんでもなおし',
            'ピーピーエイド', 'ピーピーリカバー',
            'げんきのかけら', 'いいつりざお',
            'むしよけスプレー', 'あなぬけのヒモ', 'オボンのみ',
            'かみなりのいし', 'ほのおのいし', 'みずのいし', 'リーフのいし',
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
