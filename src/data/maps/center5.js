export default {
  id: 'center5',
  name: 'ポケモンセンター',
  legend: {
    'W': 'wall', 'f': 'floor', 'C': 'counter', 'P': 'pc', 'M': 'mat',
  },
  tiles: [
    'WWWWWWWWWWWWWW',
    'WffffffffffffW',
    'WfCCCCCCCCfffW',
    'WffffffffffffW',
    'WffffffffffffW',
    'WffffffffffPfW',
    'WffffffffffffW',
    'WffffffffffffW',
    'WffffffffffffW',
    'WWWWWWMMWWWWWW',
  ],
  bgm: 'center',
  battleBg: 'indoor',
  // 全滅したときに運ばれてくる場所。最後に入ったセンターが記録される。
  respawn: { x: 6, y: 6 },
  encounters: null,
  warps: [
    { x: 6, y: 9, to: 'hanada', tx: 11, ty: 5, dir: 'down' },
    { x: 7, y: 9, to: 'hanada', tx: 11, ty: 5, dir: 'down' },
  ],
  npcs: [
    {
      id: 'nurse5', x: 5, y: 1, sprite: 'nurse', dir: 'down',
      lines: [
        'ハナダシティの ポケモンセンターへ ようこそ！',
        'ポケモンを げんきに しますか？',
        {
          ask: true,
          yes: [
            'わかりました。おあずかりします。',
            { heal: true },
            'おまたせしました！ ポケモンは げんきに なりました。',
            'また おこしくださいませ！',
          ],
          no: ['また おこしくださいませ！'],
        },
      ],
    },
    {
      id: 'hanadaHint', x: 10, y: 7, sprite: 'girl', dir: 'left', wander: true,
      lines: [
        'ハナダジムの リーダー カスミは みずタイプの つかいて。',
        'でんきや くさの わざが きくらしいわよ。',
      ],
    },
  ],
  signs: [],
  items: [],
};
