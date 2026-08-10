export default {
  id: 'gym',
  name: 'トキワジム',
  legend: {
    'W': 'wall', 'f': 'floor', 'M': 'mat', 'C': 'counter', 'S': 'sign',
  },
  // 左右のカウンターで通り道を細くしてある。
  // まっすぐ進むと必ずジムトレーナーの視線に入る作り。
  tiles: [
    'WWWWWWWWWWWW',
    'WffffffffffW',
    'WffffffffffW',
    'WfCCffffCCfW',
    'WfCCffffCCfW',
    'WffffffffffW',
    'WfCCffffCCfW',
    'WfCCffffCCfW',
    'WffffffffffW',
    'WSfffffffffW',
    'WWWWWMMWWWWW',
  ],
  bgm: 'gym',
  encounters: null,
  warps: [
    { x: 5, y: 10, to: 'tokiwa', tx: 5, ty: 10, dir: 'down' },
    { x: 6, y: 10, to: 'tokiwa', tx: 5, ty: 10, dir: 'down' },
  ],
  npcs: [
    {
      // 入口から まっすぐ北へ進むと、この2人の視線を必ず横切る
      id: 'gymboy2', x: 4, y: 7, sprite: 'bugcatcher', dir: 'right', sight: 4,
      trainer: 'gymboy2',
      lines: ['まひは やっかいだろ？ ぼくも そう おもうよ。'],
    },
    {
      id: 'gymboy1', x: 7, y: 3, sprite: 'youngster', dir: 'left', sight: 4,
      trainer: 'gymboy1',
      lines: ['ぼくを たおしたなら リーダーにも かてるかもね。'],
    },
    {
      id: 'leaderDenki', x: 5, y: 1, sprite: 'leader', dir: 'down',
      trainer: 'leaderDenki',
      lines: [
        'でんきバッジを もつ きみなら もう だいじょうぶだ。',
        'フレンドリィショップの おくの しなものも かえるように なったはずだ。',
      ],
    },
  ],
  signs: [
    {
      x: 1,
      y: 9,
      lines: ['トキワジム', 'ジムリーダー ： マチス', '「しびれるような でんげきを！」'],
    },
  ],
  items: [],
};
