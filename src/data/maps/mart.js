export default {
  id: 'mart',
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
  encounters: null,
  warps: [
    { x: 5, y: 7, to: 'hajimari', tx: 15, ty: 12, dir: 'down' },
    { x: 6, y: 7, to: 'hajimari', tx: 15, ty: 12, dir: 'down' },
  ],
  npcs: [
    {
      // カウンターの向こう側。カウンター越しに話しかけられる。
      id: 'clerk', x: 4, y: 1, sprite: 'boy', dir: 'down',
      lines: [
        'いらっしゃいませ！ フレンドリィショップへ ようこそ。',
        // バッジを見せると おくの しなもの も出してもらえる。
        // バッジに「持っていると嬉しい理由」を持たせるための仕掛け。
        {
          if: 'badge_denki',
          then: [
            'おや バッジを おもちですね！ おくの しなものも どうぞ。',
            {
              shop: [
                'モンスターボール', 'スーパーボール', 'ハイパーボール',
                'きずぐすり', 'いいきずぐすり', 'すごいきずぐすり', 'まんたんのくすり',
                'どくけし', 'まひなおし', 'やけどなおし', 'めざめるドリンク', 'なんでもなおし',
                'げんきのかけら',
                'かみなりのいし', 'ほのおのいし', 'みずのいし', 'リーフのいし',
              ],
            },
          ],
          else: [
            {
              shop: [
                'モンスターボール', 'スーパーボール',
                'きずぐすり', 'いいきずぐすり',
                'どくけし', 'まひなおし', 'やけどなおし', 'めざめるドリンク',
                'げんきのかけら',
                'かみなりのいし', 'ほのおのいし', 'みずのいし', 'リーフのいし',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'martboy', x: 9, y: 5, sprite: 'girl', dir: 'left', wander: true,
      lines: [
        'つかまえた ポケモンは うると おかねに なるわけじゃないの。',
        'どうぐを うって おかねを つくるのよ。',
        'ジムバッジを もっていると もっと いい しなものを だしてくれるらしいわ。',
      ],
    },
  ],
  signs: [],
  items: [],
};
