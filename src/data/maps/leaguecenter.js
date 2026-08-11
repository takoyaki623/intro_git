export default {
  id: 'leaguecenter',
  name: 'ポケモンリーグ うけつけ',
  legend: {
    'W': 'wall', 'f': 'floor', 'C': 'counter', 'P': 'pc', 'M': 'mat', 'D': 'door',
  },
  // ここが最後の回復地点。この先のリーグ本殿には センターも どうぐの補充もない。
  tiles: [
    'WWWWWWWWWWWWDW',
    'WffffffffffffW',
    'WfCCCCCCCCfffW',
    'WffffffffffffW',
    'WffffffffffffW',
    'WffffffffffPfW',
    'WffffffffffffW',
    'WffffffffffffW',
    'WffffffffffffW',
    'WWWWWWWDWWWWWW',
  ],
  bgm: 'center',
  battleBg: 'indoor',
  respawn: { x: 6, y: 6 },
  encounters: null,
  warps: [
    { x: 1, y: 6, to: 'route3', tx: 18, ty: 10, dir: 'left' },
    { x: 7, y: 9, to: 'league', tx: 3, ty: 12, dir: 'up', when: 'allBadges' },
    // 殿堂入り後だけ開く、うけつけ奥の とびら（S-1）。
    { x: 12, y: 0, to: 'legendroom', tx: 4, ty: 7, dir: 'up', when: 'hallOfFame' },
  ],
  npcs: [
    {
      id: 'nurseLeague', x: 5, y: 1, sprite: 'nurse', dir: 'down',
      lines: [
        'ここが さいごの ポケモンセンターです。',
        'このさきの ポケモンリーグには もう かいふくの てだては ありません。',
        'ポケモンを げんきに しますか？',
        {
          ask: true,
          yes: [
            'わかりました。おあずかりします。',
            { heal: true },
            'おまたせしました！ じゅんびは いいですね？',
          ],
          no: ['むりせず ととのえてから いどんでくださいね。'],
        },
      ],
    },
    {
      id: 'leagueGuide', x: 9, y: 5, sprite: 'boy', dir: 'left', wander: true,
      lines: [
        { if: 'hallOfFame', then: [
          'でんどうにゅうり おめでとう！',
          'そういえば… うけつけの きたがわの とびら、いままで 気づかなかったな。',
          'なにか いるのかも しれないぞ。',
        ], else: [
          { if: 'allBadges', then: [
            'バッジが 4つ そろってる！ とびらが ひらくはずだ。',
            'なかは 4れんせんだ。とちゅうで もどれないぞ。',
          ], else: [
            'ここは ポケモンリーグ うけつけ。',
            'とびらは ジムバッジが 4つ ぜんぶ ないと ひらかないんだ。',
          ] },
        ] },
      ],
    },
  ],
  signs: [],
  items: [],
};
