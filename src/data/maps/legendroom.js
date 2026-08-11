export default {
  id: 'legendroom',
  name: 'いいつたえの ま',
  legend: {
    'W': 'wall', 'f': 'floor', 'M': 'mat', 'S': 'sign',
  },
  // うけつけの奥、殿堂入りしないと開かない小部屋。伝説のぬしが1体だけいる。
  tiles: [
    'WWWWWWWWW',
    'WfffffffW',
    'WfffffffW',
    'WfffffffW',
    'WfffffffW',
    'WfffffffW',
    'WfffffffW',
    'WSffffffW',
    'WWWWMMWWW',
  ],
  bgm: 'cave',
  battleBg: 'indoor',
  encounters: null,
  warps: [
    { x: 4, y: 8, to: 'leaguecenter', tx: 12, ty: 1, dir: 'down' },
    { x: 5, y: 8, to: 'leaguecenter', tx: 12, ty: 1, dir: 'down' },
  ],
  npcs: [],
  items: [],
  signs: [
    { x: 1, y: 7, lines: ['いいつたえの ま', 'ふるくから この ちに ねむる ものが いる、と'] },
  ],
  statics: [
    {
      x: 4, y: 2, id: 634, lv: 60, flag: 'legend_boss', legendary: true,
      lines: [
        'ズズ…ン…！',
        'くうきが おもく なった…',
        'ふるくから この ちを まもる ものが、しずかに めを あけた。',
      ],
    },
  ],
};
