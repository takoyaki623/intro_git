export default {
  id: 'nibi',
  name: 'ニビシティ',
  legend: {
    '.': 'path', ',': 'grass', 'T': 'tree', 'F': 'flower', 'S': 'sign',
    'D': 'door', 'W': 'wall', 'R': 'roof', 'O': 'window', 'c': 'cliff',
  },
  // 北が どうくつ の入口、南が ２ばんどうろ。
  // 西にジム、東にセンターとショップ。
  tiles: [
    'TTTTTTTccccTTTTTTTTT',
    'TTTTTTTc..cTTTTTTTTT',
    'T,,,,,,,..,,,,,,,,,T',
    'T,RRRRR,,..,,RRRRR,T',
    'T,WODOW,,..,,WODOW,T',
    'T,,,,,,,,..,,,,,,,,T',
    'T,,S,,,,,..,,,,,S,,T',
    'T,,,,,,,,..,,,,,,,,T',
    'T,RRRRRRR,,RRRRRRR,T',
    'T,WWWDWWW,,WWWDWWW,T',
    'T,,,,,,,,,,,,,,,,,,T',
    'T,,,,,,,,,,,,,,,,,,T',
    'T,,FF,,,,,,,,,,FF,,T',
    'T,,,,,,,,,,,,,,,,,,T',
    'T,,,,,,,,,,,,,,,,,,T',
    'TTTTTTTTT..TTTTTTTTT',
    'TTTTTTTTT..TTTTTTTTT',
  ],
  outdoor: true,   // 時間帯で明るさが変わる
  bgm: 'town',
  fly: { label: 'ニビシティ', x: 9, y: 11 },
  encounters: null,
  warps: [
    { x: 9, y: 16, to: 'route2', tx: 8, ty: 16, dir: 'down' },
    { x: 10, y: 16, to: 'route2', tx: 9, ty: 16, dir: 'down' },
    { x: 8, y: 1, to: 'cave1', tx: 8, ty: 14, dir: 'up' },
    { x: 9, y: 1, to: 'cave1', tx: 9, ty: 14, dir: 'up' },
    { x: 5, y: 9, to: 'gym2', tx: 5, ty: 9, dir: 'up' },
    { x: 14, y: 9, to: 'center2', tx: 6, ty: 8, dir: 'up' },
    { x: 4, y: 4, to: 'mart2', tx: 5, ty: 6, dir: 'up' },
  ],
  npcs: [
    {
      id: 'rival4', x: 5, y: 11, sprite: 'youngster', dir: 'up', sight: 4,
      trainer: 'rival4', when: 'badge_denki',
      lines: ['また どこかで あおうぜ。'],
    },
    {
      id: 'nibiGirl', x: 12, y: 6, sprite: 'girl', dir: 'left', wander: true,
      lines: [
        'ニビジムの リーダーは いわタイプの つかいて。',
        'みずか くさの ポケモンを つれていくと いいわよ。',
      ],
    },
    {
      id: 'nibiOld', x: 7, y: 12, sprite: 'prof', dir: 'down', wander: true,
      lines: [
        'ふたつめの バッジを もらうと そらを とべるように なるそうじゃ。',
        'いちど 行った まちなら どこへでも ひとっとびじゃ。',
      ],
    },
  ],
  items: [
    { x: 17, y: 13, item: 'いいきずぐすり', n: 2, flag: 'item_nibi_potion' },
  ],
  signs: [
    { x: 3, y: 6, lines: ['ニビシティ', 'いしの まちに ひらく はな'] },
    { x: 16, y: 6, lines: ['ひだり ： ニビジム', 'みぎ ： ポケモンセンター', '↑ きた ： おつきみやま'] },
  ],
};
