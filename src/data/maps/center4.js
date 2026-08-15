export default {
  id: 'center4',
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
    { x: 6, y: 9, to: 'hanakago', tx: 11, ty: 5, dir: 'down' },
    { x: 7, y: 9, to: 'hanakago', tx: 11, ty: 5, dir: 'down' },
  ],
  npcs: [
    {
      id: 'nurse4', x: 5, y: 1, sprite: 'nurse', dir: 'down',
      lines: [
        'ハナカゴシティの ポケモンセンターへ ようこそ！',
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
      id: 'hanakagoHint', x: 10, y: 7, sprite: 'girl', dir: 'left', wander: true,
      lines: [
        'ボレイどうくつの おくには ゴーストジムが あるのよ。',
        'ノーマルタイプの わざが きかないから きを つけてね。',
      ],
    },
  ],
  signs: [],
  items: [],
};
