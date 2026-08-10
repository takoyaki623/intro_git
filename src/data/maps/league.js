export default {
  id: 'league',
  name: 'ポケモンリーグ',
  legend: {
    '.': 'path', 'W': 'wall',
  },
  // 一本道の回廊。エリート3人＋チャンピオン(ライバル)の4連戦。
  // 倒すまでは その場に立ちふさがって進めない（横に すりぬけられない はば）。
  tiles: [
    'WWWWWWW',
    'WWW.WWW',
    'WWW.WWW',
    'WWW.WWW',
    'WWW.WWW',
    'WWW.WWW',
    'WWW.WWW',
    'WWW.WWW',
    'WWW.WWW',
    'WWW.WWW',
    'WWW.WWW',
    'WWW.WWW',
    'WWW.WWW',
    'WWWWWWW',
  ],
  bgm: 'gym',
  encounters: null,
  warps: [
    { x: 3, y: 12, to: 'leaguecenter', tx: 7, ty: 8, dir: 'down' },
  ],
  npcs: [
    {
      id: 'elite1', x: 3, y: 11, sprite: 'lass', dir: 'down', sight: 3,
      trainer: 'elite1', unless: 'trainer_elite1',
      lines: ['むしと こおりの ぐんだんに おそれを なせ！'],
    },
    {
      id: 'elite2', x: 3, y: 8, sprite: 'girl', dir: 'down', sight: 3,
      trainer: 'elite2', unless: 'trainer_elite2',
      lines: ['この さきは ゴーストの せかいよ…'],
    },
    {
      id: 'elite3', x: 3, y: 5, sprite: 'boy', dir: 'down', sight: 3,
      trainer: 'elite3', unless: 'trainer_elite3',
      lines: ['はどうと はがねの ちからを みせてやる！'],
    },
    {
      id: 'rival5', x: 3, y: 2, sprite: 'youngster', dir: 'down', sight: 3,
      trainer: 'rival5', unless: 'trainer_rival5',
      lines: ['おれが チャンピオンだ。かかってこいよ！'],
    },
  ],
  items: [],
  signs: [],
};
