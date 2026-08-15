export default {
  id: 'center2',
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
    { x: 6, y: 9, to: 'nibi', tx: 14, ty: 10, dir: 'down' },
    { x: 7, y: 9, to: 'nibi', tx: 14, ty: 10, dir: 'down' },
  ],
  npcs: [
    {
      id: 'nurse2', x: 5, y: 1, sprite: 'nurse', dir: 'down',
      lines: [
        'ニビシティの ポケモンセンターへ ようこそ！',
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
      id: 'nibiHint', x: 10, y: 7, sprite: 'girl', dir: 'left', wander: true,
      lines: [
        'おつきみやまの ちかには みずうみが あるんですって。',
        'なみのりが できないと わたれないみたい。',
      ],
    },
  ],
  signs: [],
  items: [],
};
