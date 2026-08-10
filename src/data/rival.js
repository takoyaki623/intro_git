// ライバル。
//
// 名前はプレイヤーが御三家を選んだ直後に決める（state.player.rivalName）。
// 御三家はプレイヤーの選択に対して有利なタイプを自動で取る。
// パーティは「御三家の現在の進化段階」を毎回レベルから computed するので、
// 静的な id をここに書く必要がない（進化条件が変わっても自動で追従する）。

import { getSpecies } from './species.js';

/** プレイヤーの御三家 → ライバルの御三家（くさ→ほのお→みず→くさ の三すくみ） */
export const RIVAL_STARTER = { 722: 4, 4: 258, 258: 722 };

/** そのレベルまでに自然に進化しているとしたときの、いまの姿の id */
function evolvedFor(baseId, lv) {
  let sp = getSpecies(baseId);
  while (sp?.evolution?.method === 'level' && lv >= sp.evolution.level) {
    sp = getSpecies(sp.evolution.to);
  }
  return sp?.id ?? baseId;
}

/** ライバル戦。1〜4戦目ぶん。5戦目（チャンピオン戦）はポケモンリーグ実装時に追加する。 */
export const RIVAL_BATTLES = {
  rival1: {
    class: 'ライバル', sprite: 'youngster', prize: 20, sight: 5, skill: 2,
    party: (starterId) => [{ id: evolvedFor(starterId, 5), lv: 5 }],
    intro: [
      'よお！ おまえも ポケモンを もらったのか。',
      'おれの ポケモンのほうが つよいって ところ、みせてやるよ！',
    ],
    defeat: ['くっ… まだまだだな。つぎは まけないぞ！'],
    after: ['１ばんどうろの くさむらで きたえておけよ。'],
  },
  rival3: {
    class: 'ライバル', sprite: 'youngster', prize: 26, sight: 5, skill: 2,
    party: (starterId) => [
      { id: evolvedFor(starterId, 13), lv: 13 },
      { id: 17, lv: 12 },
    ],
    intro: [
      'また あったな。すこしは つよくなったか？',
      'もりを ぬけるまえに しょうぶだ！',
    ],
    defeat: ['まだ おれのほうが うわてだと おもったのに…！'],
    after: ['きたには ２ばんどうろが つづいてる。おれは さきに いくぜ。'],
  },
  rival4: {
    class: 'ライバル', sprite: 'youngster', prize: 46, sight: 4, skill: 3,
    party: (starterId) => [
      { id: evolvedFor(starterId, 23), lv: 23 },
      { id: 75, lv: 22 },
      { id: 20, lv: 21 },
    ],
    intro: [
      'ジムバッジ、とったのか。おれも いま とったところだ。',
      'どっちが つよいか、はっきり させようぜ！',
    ],
    defeat: ['……つよく なったな、おまえ。みとめるよ。'],
    after: ['このさきも たびは つづく。またどこかで あおうぜ。'],
  },
};

/** 勝敗のセリフ切り替えに使う、トレーナーIDからのフラグ名（既存の trainerFlag と同じ規則）。 */
export const rivalWonFlag = (id) => `trainer_${id}`;
