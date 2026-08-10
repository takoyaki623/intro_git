export default {
  id: 'tokiwa',
  name: 'トキワシティ',
  legend: {
    '.': 'path', ',': 'grass', 'T': 'tree', 'F': 'flower', 'S': 'sign',
    'D': 'door', 'W': 'wall', 'R': 'roof', 'O': 'window',
  },
  // 南が １ばんどうろ、北が トキワのもり。
  // 西にジム、東にポケモンセンター。
  tiles: [
    'TTTTTTTT..TTTTTTTTTT',
    'TTTTTTTT..TTTTTTTTTT',
    'T,,,,,,,..,,,,,,,,,T',
    'T,RRRRR,,..,,RRRRR,T',
    'T,WOWDW,,..,,WOWDW,T',
    'T,,,,,,,,..,,,,,,,,T',
    'T,,S,,,,,..,,,,,S,,T',
    'T,,,,,,,,..,,,,,,,,T',
    'T,RRRRRRR,,RRRRRRR,T',
    'T,WWWDWWW,,WWWDWWW,T',
    'T,,,,,,,,,,,,,,,,,,T',
    'T,,FF,,,,,,,,,,FF,,T',
    'T,,,,,,,,,,,,,,,,,,T',
    'TTTTTTTT..TTTTTTTTTT',
    'TTTTTTTT..TTTTTTTTTT',
  ],
  outdoor: true,
  bgm: 'town',
  fly: { label: 'トキワシティ', x: 9, y: 10 },
  encounters: null,
  warps: [
    { x: 8, y: 14, to: 'route1', tx: 8, ty: 1, dir: 'down' },
    { x: 9, y: 14, to: 'route1', tx: 9, ty: 1, dir: 'down' },
    { x: 8, y: 0, to: 'forest', tx: 8, ty: 18, dir: 'up' },
    { x: 9, y: 0, to: 'forest', tx: 9, ty: 18, dir: 'up' },
    { x: 5, y: 9, to: 'gym', tx: 5, ty: 9, dir: 'up' },
    { x: 14, y: 9, to: 'center3', tx: 6, ty: 8, dir: 'up' },
  ],
  npcs: [
    {
      id: 'tokiwaGirl', x: 12, y: 6, sprite: 'girl', dir: 'left', wander: true,
      lines: [
        'ここが トキワシティ。ジムが あるのよ。',
        'リーダーの マチスは でんきタイプの つかいて。',
      ],
    },
    {
      id: 'tokiwaBoy', x: 6, y: 12, sprite: 'boy', dir: 'down', wander: true,
      lines: [
        'ジムに かつと ジムバッジが もらえる。',
        'バッジが あると ショップの しなぞろえも かわるらしいぞ。',
      ],
    },
  ],
  items: [
    { x: 17, y: 11, item: 'きずぐすり', n: 2, flag: 'item_tokiwa_potion' },
  ],
  signs: [
    { x: 3, y: 6, lines: ['トキワシティ', 'えいえんの みどり ゆきかう まち'] },
    { x: 16, y: 6, lines: ['ひだり ： トキワジム', 'みぎ ： ポケモンセンター', '↑ きた ： トキワのもり'] },
  ],
};
