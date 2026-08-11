// トレーナー（人間の対戦相手）とジムバッジ。
//
// マップの NPC は `trainer: 'id'` でここを指す。倒したかどうかは
// フラグ `trainer_<id>` で覚えるので、セーブ形式を増やさずに済む。
//
//   class   : 肩書き（「たんパンこぞう」など）
//   name    : 名前
//   sprite  : chars.js のキャラ名
//   prize   : 賞金の係数。実際の賞金 = prize × 最後に出したポケモンのレベル
//   skill   : 行動選択の賢さ 0..3。3 は気まぐれを起こさず変化技も使いこなす
//   party   : 手持ち。上から順に出てくる
//   badge   : 倒すと `badge_<id>` が立つ（ジムリーダーだけ）
//   sight   : 何マス先まで視線が届くか（マップ側で上書きできる）
//   intro / defeat / after : 戦闘前・負けた直後・再会したときのセリフ

export const TRAINERS = {
  // ---- １ばんどうろ ----
  youngster1: {
    class: 'たんパンこぞう', name: 'マサル', skill: 1, sprite: 'youngster', prize: 35, sight: 4,
    party: [{ id: 19, lv: 6 }, { id: 16, lv: 7 }],
    intro: ['やあ！ ぼくと しょうぶ しようよ！'],
    defeat: ['うわーっ つよいなあ！'],
    after: ['くさむらで レベルを あげてから また やろうね。'],
  },
  lass1: {
    class: 'ミニスカート', name: 'あやか', skill: 1, sprite: 'lass', prize: 40, sight: 3,
    party: [{ id: 16, lv: 5 }],
    intro: ['あら！ めが あったわね。しょうぶよ！'],
    defeat: ['まけちゃった…'],
    after: ['ポッポは そらを とぶのが とくいなの。'],
  },

  // ---- トキワのもり ----
  bugcatcher1: {
    class: 'むしとりしょうねん', name: 'ケンタ', skill: 1, sprite: 'bugcatcher', prize: 30, sight: 4,
    party: [{ id: 10, lv: 10 }, { id: 11, lv: 11 }],
    intro: ['むしポケモンは さいこうだぜ！ しょうぶだ！'],
    defeat: ['ぼくの むしポケモンが…'],
    after: ['トランセルは かたいけど こうげきは にがてなんだ。'],
  },
  bugcatcher2: {
    class: 'むしとりしょうねん', name: 'ヒロシ', skill: 1, sprite: 'bugcatcher', prize: 30, sight: 5,
    party: [{ id: 10, lv: 11 }, { id: 11, lv: 13 }],
    intro: ['もりの おくには つよい やつが いるらしいぜ！'],
    defeat: ['まだまだ だったか…'],
    after: ['むしポケモンは そだつのが はやいんだ。'],
  },

  // ---- ジム ----
  gymboy1: {
    class: 'ジムトレーナー', name: 'たけし', skill: 2, sprite: 'youngster', prize: 60, sight: 5,
    party: [{ id: 25, lv: 9 }],
    intro: ['ジムリーダーに あいたければ ぼくを たおしてから だ！'],
    defeat: ['ぐぬぬ… やるな！'],
    after: ['でんきタイプは じめんタイプに ぜんぜん ダメージが とおらないぞ。'],
  },
  gymboy2: {
    class: 'ジムトレーナー', name: 'みつる', skill: 2, sprite: 'bugcatcher', prize: 60, sight: 4,
    party: [{ id: 25, lv: 7 }, { id: 19, lv: 8 }],
    intro: ['この さきは とおさないよ！'],
    defeat: ['まいったなあ。'],
    after: ['まひすると すばやさが はんぶんに なって うごけないことも あるんだ。'],
  },
  leaderDenki: {
    class: 'ジムリーダー', name: 'マチス', skill: 3, sprite: 'leader', prize: 120, sight: 0,
    badge: 'denki',
    party: [{ id: 25, lv: 9 }, { id: 26, lv: 11 }],
    intro: [
      'ようこそ トキワジムへ！',
      'わたしが ジムリーダーの マチスだ。',
      'でんきの おそろしさ… その みで あじわうがいい！',
    ],
    defeat: [
      'みごとだ！ きみの ちからは ほんものだな。',
      'この でんきバッジを うけとってくれ！',
    ],
    after: [
      'でんきバッジが あれば ショップの おくの しなものも かえるように なる。',
      'いい たびを！',
    ],
  },

  // ---- ２ばんどうろ ----
  youngster2: {
    class: 'たんパンこぞう', name: 'ゴロー', skill: 1, sprite: 'youngster', prize: 45, sight: 4,
    party: [{ id: 19, lv: 13 }, { id: 74, lv: 14 }],
    intro: ['ニビシティへ いくのかい？ そのまえに しょうぶだ！'],
    defeat: ['やるなあ！'],
    after: ['きたの ニビシティには ジムが あるぞ。'],
  },
  lass2: {
    class: 'ミニスカート', name: 'みさき', skill: 1, sprite: 'lass', prize: 45, sight: 4,
    party: [{ id: 16, lv: 13 }, { id: 41, lv: 14 }],
    intro: ['あら かわいい ポケモン！ でも まけないわ。'],
    defeat: ['つよかったわ…'],
    after: ['いわタイプには みずや くさが よく きくのよ。'],
  },

  // ---- おつきみやま ----
  hiker1: {
    class: 'やまおとこ', name: 'げんぞう', skill: 2, sprite: 'boy', prize: 60, sight: 4,
    party: [{ id: 74, lv: 15 }, { id: 74, lv: 16 }],
    intro: ['ここは おれの にわだ！ とおしはせん！'],
    defeat: ['むむむ… まけたか。'],
    after: ['イシツブテは レベル２５で ゴローンに なるぞ。'],
  },
  hiker2: {
    class: 'やまおとこ', name: 'たいち', skill: 2, sprite: 'youngster', prize: 60, sight: 4,
    party: [{ id: 41, lv: 16 }, { id: 74, lv: 17 }],
    intro: ['ちかへ いきたいのか？ おれを たおしてからだ！'],
    defeat: ['まいった！'],
    after: ['ちかには もっと つよい やつが いるぜ。'],
  },
  hiker3: {
    class: 'やまおとこ', name: 'いわお', skill: 2, sprite: 'boy', prize: 70, sight: 5,
    party: [{ id: 42, lv: 18 }, { id: 75, lv: 19 }],
    intro: ['よく こんな おくまで きたな！ ほめてやる！'],
    defeat: ['たいしたもんだ。'],
    after: ['ちていこの まんなかに なにか おちてるらしいぞ。'],
  },

  // ---- ニビジム ----
  gymrock1: {
    class: 'ジムトレーナー', name: 'こうじ', skill: 2, sprite: 'youngster', prize: 80, sight: 4,
    party: [{ id: 74, lv: 18 }],
    intro: ['リーダーに あうには ぼくを たおしてからだ！'],
    defeat: ['ぐっ… やるな。'],
    after: ['いわは かたい。だが みずには かなわない。'],
  },
  gymrock2: {
    class: 'ジムトレーナー', name: 'さとる', skill: 2, sprite: 'bugcatcher', prize: 80, sight: 4,
    party: [{ id: 74, lv: 17 }, { id: 41, lv: 18 }],
    intro: ['ここは とおさないよ！'],
    defeat: ['つよいなあ。'],
    after: ['ぼうぎょが たかいと なかなか たおれないだろ。'],
  },
  leaderIwa: {
    class: 'ジムリーダー', name: 'イワオ', skill: 3, sprite: 'leader', prize: 150, sight: 0,
    badge: 'iwa',
    party: [{ id: 74, lv: 20 }, { id: 75, lv: 22 }],
    intro: [
      'よく ここまで きたな。',
      'わたしが ニビジムリーダーの イワオだ。',
      'いしのように かたい こころ ―― みせてもらおう！',
    ],
    defeat: [
      'みごとだ。きみの ポケモンは よく そだっている。',
      'この いわバッジを うけとれ！',
    ],
    after: [
      'いわバッジが あれば そらを とべる。',
      'いちど 行った まちなら どこへでも もどれるぞ。',
    ],
  },

  // ---- ハナカゴシティ（くさジム） ----
  hanaboy1: {
    class: 'はなやさん', name: 'そういち', skill: 2, sprite: 'youngster', prize: 85, sight: 4,
    party: [{ id: 1, lv: 24 }, { id: 2, lv: 25 }],
    intro: ['ようこそ ハナカゴシティへ。くさの ちからを みせてやる！'],
    defeat: ['みずみずしい はいぼくだ…'],
    after: ['くさタイプは みずと じめんに つよいんだ。'],
  },
  hanagirl1: {
    class: 'フラワーガール', name: 'すみれ', skill: 2, sprite: 'lass', prize: 85, sight: 4,
    party: [{ id: 722, lv: 26 }],
    intro: ['モクローと いっしょに おはなを そだてているの。'],
    defeat: ['はっぱが しおれちゃった…'],
    after: ['ジムは この さきよ。がんばってね。'],
  },
  hanaboy2: {
    class: 'きこりの こ', name: 'げん', skill: 2, sprite: 'boy', prize: 90, sight: 4,
    party: [{ id: 723, lv: 27 }],
    intro: ['もりの おくへ ようこそ。ここから さきは ちからだめしだ！'],
    defeat: ['やられた… もりも まけを みとめるさ。'],
    after: ['ジムリーダーの まえに ジムトレーナーが 2にん いるぞ。'],
  },
  gymgrass1: {
    class: 'ジムトレーナー', name: 'あおい', skill: 2, sprite: 'lass', prize: 100, sight: 4,
    party: [{ id: 2, lv: 27 }],
    intro: ['ここから さきは くさの じんちだよ！'],
    defeat: ['まけちゃった… でも たのしかった！'],
    after: ['フシギソウは どくタイプも あわせもつんだよ。'],
  },
  gymgrass2: {
    class: 'ジムトレーナー', name: 'りょくと', skill: 2, sprite: 'bugcatcher', prize: 100, sight: 4,
    party: [{ id: 723, lv: 28 }],
    intro: ['リーダーに あうまえに ぼくを たおしていけ！'],
    defeat: ['くっ… もりの ちからが およばなかったか。'],
    after: ['フクスローは すばやい こうげきが とくいだ。'],
  },
  leaderKusa: {
    class: 'ジムリーダー', name: 'リンドウ', skill: 3, sprite: 'leader', prize: 180, sight: 0,
    badge: 'kusa',
    party: [{ id: 723, lv: 28 }, { id: 3, lv: 30 }],
    intro: [
      'ようこそ ハナカゴジムへ。',
      'わたしが ジムリーダーの リンドウ。',
      'くさの いのちの ちからを みせよう！',
    ],
    defeat: [
      'みごとに さきほこったわね。',
      'この くさバッジを うけとって。',
    ],
    after: [
      'くさバッジが あれば、やせいポケモンが すこし つかまえやすく なるはずよ。',
      'つぎは このさきの どうくつに ゴーストジムが あるわ。',
    ],
  },

  // ---- ボレイどうくつ（ゴーストジム） ----
  ghostboy1: {
    class: 'いれいし', name: 'ゆうと', skill: 2, sprite: 'boy', prize: 95, sight: 4,
    party: [{ id: 607, lv: 31 }],
    intro: ['この さきは ボレイどうくつ… きみょうな けはいが するだろう？'],
    defeat: ['ヒトモシの ひが きえた…'],
    after: ['ほのおと ゴーストの タイプは めずらしい くみあわせだ。'],
  },
  ghostgirl1: {
    class: 'れいばいし', name: 'かなえ', skill: 2, sprite: 'girl', prize: 95, sight: 4,
    party: [{ id: 41, lv: 31 }, { id: 607, lv: 32 }],
    intro: ['あなたの うしろに… ふふ、うそよ。しょうぶしましょう。'],
    defeat: ['まさか この わたしが…'],
    after: ['ゴーストタイプの わざは ノーマルタイプに きかないの。'],
  },
  ghostboy2: {
    class: 'やみのちょうじゃ', name: 'くろむ', skill: 2, sprite: 'youngster', prize: 100, sight: 5,
    party: [{ id: 633, lv: 33 }],
    intro: ['おれの モノズは あくと ドラゴンの ちからを もつ。'],
    defeat: ['ぐああ… やみに のまれたか。'],
    after: ['この さきに ジムが ある。きを つけろよ。'],
  },
  gymghost1: {
    class: 'ジムトレーナー', name: 'しのぶ', skill: 2, sprite: 'girl', prize: 105, sight: 4,
    party: [{ id: 607, lv: 33 }],
    intro: ['ようこそ、まよいびとよ…'],
    defeat: ['きえて いく…'],
    after: ['ランプラーは ひとだまのように とぶのよ。'],
  },
  gymghost2: {
    class: 'ジムトレーナー', name: 'れい', skill: 2, sprite: 'boy', prize: 105, sight: 4,
    party: [{ id: 608, lv: 34 }],
    intro: ['リーダーに あうには おれを こえていけ。'],
    defeat: ['からだが… とおく なって いく…'],
    after: ['リーダーは この おくに いる。'],
  },
  leaderGhost: {
    class: 'ジムリーダー', name: 'コトリ', skill: 3, sprite: 'leader', prize: 220, sight: 0,
    badge: 'ghost',
    party: [{ id: 607, lv: 35 }, { id: 608, lv: 37 }],
    intro: [
      'ようこそ… ボレイジムへ。',
      'わたしが ジムリーダーの コトリ。',
      'この よを さまよう たましいの ちからを みせるわ。',
    ],
    defeat: [
      'ふふ… みごとよ。',
      'この ゴーストバッジを うけとりなさい。',
    ],
    after: [
      'ゴーストバッジが あれば、てにいれる けいけんちが すこし ふえるわ。',
      'バッジが 4つ そろえば、ポケモンリーグの とびらが ひらくはずよ。',
    ],
  },

  // ---- ３ばんどうろ（リーグ前さいご） ----
  ace1: {
    class: 'エキスパート', name: 'タクミ', skill: 2, sprite: 'youngster', prize: 130, sight: 4,
    party: [{ id: 922, lv: 38 }, { id: 397, lv: 39 }],
    intro: ['リーグに いどむまえの さいしゅう テストだ！'],
    defeat: ['やるじゃないか。リーグでも がんばれよ。'],
    after: ['この さきに センターと ポケモンリーグが ある。'],
  },
  ace2: {
    class: 'エキスパート', name: 'ミワ', skill: 2, sprite: 'lass', prize: 130, sight: 4,
    party: [{ id: 820, lv: 37 }, { id: 662, lv: 38 }],
    intro: ['あなたも リーグを めざしてるのね。まけないわよ！'],
    defeat: ['つよいのね… きっと リーグでも かつわ。'],
    after: ['じゅんびが できたら リーグの うけつけへ。'],
  },

  // ---- ポケモンリーグ ----
  elite1: {
    class: 'エリートフォー', name: 'カレン', skill: 3, sprite: 'lass', prize: 300, sight: 0,
    party: [{ id: 397, lv: 42 }, { id: 12, lv: 43 }, { id: 873, lv: 45 }],
    intro: [
      'ようこそ ポケモンリーグへ。',
      'むしと こおりの ぐんだんに おそれを なせ！',
    ],
    defeat: ['みごとよ。つぎへ おすすみなさい。'],
    after: ['がんばって。あなたなら いける わ。'],
  },
  elite2: {
    class: 'エリートフォー', name: 'カンナ', skill: 3, sprite: 'girl', prize: 310, sight: 0,
    party: [{ id: 42, lv: 43 }, { id: 608, lv: 44 }, { id: 724, lv: 46 }],
    intro: [
      'この さきは ゴーストの せかい…',
      'こわくて とおれるかしら？',
    ],
    defeat: ['ふふ、みごとね。つぎへ どうぞ。'],
    after: ['チャンピオンは とても つよいわ。きを つけて。'],
  },
  elite3: {
    class: 'エリートフォー', name: 'シバ', skill: 3, sprite: 'boy', prize: 320, sight: 0,
    party: [{ id: 820, lv: 44 }, { id: 75, lv: 45 }, { id: 448, lv: 48 }],
    intro: [
      'はどうと はがねの ちからを みせてやる！',
      'ここを こえれば チャンピオンだ！',
    ],
    defeat: ['つよいな…！ これなら チャンピオンにも わたりあえる。'],
    after: ['チャンピオンルームは この さきだ。いって こい！'],
  },
};

/** バッジ。順番はそのまま「トレーナーカード」の並び。 */
export const BADGES = [
  {
    id: 'denki',
    name: 'でんきバッジ',
    color: '#f0c020',
    from: 'トキワジム ／ マチス',
    effect: 'フレンドリィショップの しなものが ふえる',
  },
  {
    id: 'iwa',
    name: 'いわバッジ',
    color: '#a08050',
    from: 'ニビジム ／ イワオ',
    effect: 'メニューから そらを とべる（行ったことのある まちへ）',
  },
  {
    id: 'kusa',
    name: 'くさバッジ',
    color: '#48a058',
    from: 'ハナカゴジム ／ リンドウ',
    effect: 'やせいポケモンが つかまえやすくなる（捕獲率 ×1.2）',
  },
  {
    id: 'ghost',
    name: 'ゴーストバッジ',
    color: '#7860a8',
    from: 'ボレイジム ／ コトリ',
    effect: 'てにはいる けいけんちが ふえる（+10%）',
  },
];

export const getTrainer = (id) => TRAINERS[id] ?? null;

/** 倒したかどうかを覚えるフラグ名。マップ側と world.js で同じものを使う。 */
export const trainerFlag = (id) => `trainer_${id}`;
export const badgeFlag = (id) => `badge_${id}`;

/** 賞金。最後に出したポケモンのレベルで決まる（本家と同じ考えかた）。 */
export function prizeMoney(trainer) {
  const last = trainer.party[trainer.party.length - 1];
  return trainer.prize * (last?.lv ?? 1);
}
