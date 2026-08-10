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
  bgm: 'center',
  // 全滅したときに運ばれてくる場所。最後に入ったセンターが記録される。
  respawn: { x: 6, y: 6 },
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
    // 交換の3人。えらばなかった御三家は、ここでしか手に入らない。
    {
      id: 'tradeA', x: 2, y: 4, sprite: 'girl', dir: 'down',
      lines: [
        {
          if: 'trade_fushigidane',
          then: ['フシギダネを だいじに してね！'],
          else: [
            'わたし ポッポが ほしいの。',
            'かわりに フシギダネを あげる。どう？',
            { trade: { want: 16, give: 1, lv: 8, flag: 'trade_fushigidane' } },
          ],
        },
      ],
    },
    {
      id: 'tradeB', x: 2, y: 7, sprite: 'youngster', dir: 'down',
      lines: [
        {
          if: 'trade_hitokage',
          then: ['ヒトカゲは ほのおが つよいぞ！'],
          else: [
            'コラッタと ヒトカゲを こうかんしない？',
            'ぼく コラッタが すきなんだ。',
            { trade: { want: 19, give: 4, lv: 8, flag: 'trade_hitokage' } },
          ],
        },
      ],
    },
    {
      id: 'tradeC', x: 11, y: 4, sprite: 'lass', dir: 'left',
      lines: [
        {
          if: 'trade_zenigame',
          then: ['ゼニガメは そだてると たのもしいわよ。'],
          else: [
            'キャタピーを もってない？',
            'ゼニガメと こうかんして あげる！',
            { trade: { want: 10, give: 7, lv: 8, flag: 'trade_zenigame' } },
          ],
        },
      ],
    },
  ],
  signs: [],
};
