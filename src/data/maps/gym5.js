export default {
  id: 'gym5',
  name: 'ハナダジム',
  legend: {
    'W': 'wall', 'f': 'floor', 'M': 'mat', 'c': 'cliff', 'S': 'sign',
  },
  // gym2(ニビジム)と同じ いわ の迷路構図。屋内なので実際の水場(なみのり判定)は置かず、
  // タイル運用は cliff のまま「みずジムらしい 曲がりくねった通路」だけ踏襲する。
  tiles: [
    'WWWWWWWWWWWW',
    'WffffffffffW',
    'WffcccccfffW',
    'WffffffcfffW',
    'WfcccffcfffW',
    'WfcffffcfffW',
    'WfcffcccfffW',
    'WffffffffffW',
    'WffcccccfffW',
    'WSfffffffffW',
    'WWWWWMMWWWWW',
  ],
  bgm: 'gym',
  battleBg: 'indoor',
  encounters: null,
  warps: [
    { x: 5, y: 10, to: 'hanada', tx: 4, ty: 5, dir: 'down' },
    { x: 6, y: 10, to: 'hanada', tx: 4, ty: 5, dir: 'down' },
  ],
  npcs: [
    {
      id: 'hanadaswim1', x: 9, y: 6, sprite: 'girl', dir: 'left', sight: 4,
      trainer: 'hanadaswim1',
      lines: ['みずタイプは ながれるように たたかうのよ！'],
    },
    {
      id: 'hanadaswim2', x: 3, y: 3, sprite: 'lass', dir: 'right', sight: 3,
      trainer: 'hanadaswim2',
      lines: ['カスミさんに あうまえに わたしを たおしていって！'],
    },
    {
      id: 'leaderMizu', x: 5, y: 1, sprite: 'leader', dir: 'down',
      trainer: 'leaderMizu',
      lines: [
        'みずバッジが あれば、つりで さかなが かかりやすくなる。',
        'このさきは ハナカゴシティよ。',
      ],
    },
  ],
  signs: [
    { x: 1, y: 9, lines: ['ハナダジム', 'ジムリーダー ： カスミ', '「みずの ながれに さからうな」'] },
  ],
  items: [],
};
