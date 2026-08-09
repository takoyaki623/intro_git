export default {
  id: 'center',
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
  encounters: null,
  warps: [
    { x: 6, y: 9, to: 'hajimari', tx: 5, ty: 12, dir: 'down' },
    { x: 7, y: 9, to: 'hajimari', tx: 5, ty: 12, dir: 'down' },
  ],
  npcs: [
    {
      // カウンターの向こう側に立つ。カウンター越しに話しかけられる。
      id: 'nurse', x: 5, y: 1, sprite: 'nurse', dir: 'down',
      lines: [
        'ポケモンセンターへ ようこそ！',
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
      id: 'hint', x: 10, y: 7, sprite: 'boy', dir: 'left', wander: true,
      lines: [
        'おくの パソコンで あずけた ポケモンを だしいれ できるよ。',
        'てもちが ６ひき いっぱいでも つかまえられるってわけ。',
      ],
    },
  ],
  signs: [],
};
