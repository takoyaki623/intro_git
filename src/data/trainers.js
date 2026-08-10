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
    party: [{ id: 12, lv: 6 }, { id: 10, lv: 7 }],
    intro: ['やあ！ ぼくと しょうぶ しようよ！'],
    defeat: ['うわーっ つよいなあ！'],
    after: ['くさむらで レベルを あげてから また やろうね。'],
  },
  lass1: {
    class: 'ミニスカート', name: 'あやか', skill: 1, sprite: 'lass', prize: 40, sight: 3,
    party: [{ id: 10, lv: 5 }],
    intro: ['あら！ めが あったわね。しょうぶよ！'],
    defeat: ['まけちゃった…'],
    after: ['ポッポは そらを とぶのが とくいなの。'],
  },

  // ---- トキワのもり ----
  bugcatcher1: {
    class: 'むしとりしょうねん', name: 'ケンタ', skill: 1, sprite: 'bugcatcher', prize: 30, sight: 4,
    party: [{ id: 14, lv: 10 }, { id: 15, lv: 11 }],
    intro: ['むしポケモンは さいこうだぜ！ しょうぶだ！'],
    defeat: ['ぼくの むしポケモンが…'],
    after: ['トランセルは かたいけど こうげきは にがてなんだ。'],
  },
  bugcatcher2: {
    class: 'むしとりしょうねん', name: 'ヒロシ', skill: 1, sprite: 'bugcatcher', prize: 30, sight: 5,
    party: [{ id: 14, lv: 11 }, { id: 15, lv: 13 }],
    intro: ['もりの おくには つよい やつが いるらしいぜ！'],
    defeat: ['まだまだ だったか…'],
    after: ['むしポケモンは そだつのが はやいんだ。'],
  },

  // ---- ジム ----
  gymboy1: {
    class: 'ジムトレーナー', name: 'たけし', skill: 2, sprite: 'youngster', prize: 60, sight: 5,
    party: [{ id: 17, lv: 9 }],
    intro: ['ジムリーダーに あいたければ ぼくを たおしてから だ！'],
    defeat: ['ぐぬぬ… やるな！'],
    after: ['でんきタイプは じめんタイプに ぜんぜん ダメージが とおらないぞ。'],
  },
  gymboy2: {
    class: 'ジムトレーナー', name: 'みつる', skill: 2, sprite: 'bugcatcher', prize: 60, sight: 4,
    party: [{ id: 17, lv: 7 }, { id: 12, lv: 8 }],
    intro: ['この さきは とおさないよ！'],
    defeat: ['まいったなあ。'],
    after: ['まひすると すばやさが はんぶんに なって うごけないことも あるんだ。'],
  },
  leaderDenki: {
    class: 'ジムリーダー', name: 'マチス', skill: 3, sprite: 'leader', prize: 120, sight: 0,
    badge: 'denki',
    party: [{ id: 17, lv: 9 }, { id: 26, lv: 11 }],
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
    party: [{ id: 12, lv: 13 }, { id: 74, lv: 14 }],
    intro: ['ニビシティへ いくのかい？ そのまえに しょうぶだ！'],
    defeat: ['やるなあ！'],
    after: ['きたの ニビシティには ジムが あるぞ。'],
  },
  lass2: {
    class: 'ミニスカート', name: 'みさき', skill: 1, sprite: 'lass', prize: 45, sight: 4,
    party: [{ id: 10, lv: 13 }, { id: 41, lv: 14 }],
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
