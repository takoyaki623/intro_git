// じっせき一覧（B3）。state.stats（Phase Z-1）などの既存の記録だけを読む純関数。
// 新しい計測は足さない ―― ここで判定できないものは対象にしない。

import { SPECIES } from '../data/species.js';
import { BADGES, badgeFlag } from '../data/trainers.js';
import { TOWER_TRAINERS } from '../data/tower.js';
import { MAX_LEVEL } from '../data/growth.js';
import { PARTY_MAX } from './state.js';

const DEX_TOTAL = Object.keys(SPECIES).length;
const TOWER_MAX = TOWER_TRAINERS.length;

function allMons(state) {
  return [...state.party, ...state.boxes.flat()].filter(Boolean);
}

export const ACHIEVEMENTS = [
  { id: 'step1', name: 'はじめの いっぽ', desc: 'いちど でも あるく。', test: (s) => (s.stats?.steps ?? 0) >= 1 },
  { id: 'step1000', name: 'まめに あるく', desc: '1000ほ あるく。', test: (s) => (s.stats?.steps ?? 0) >= 1000 },
  { id: 'step10000', name: 'きたえた あしどり', desc: '10000ほ あるく。', test: (s) => (s.stats?.steps ?? 0) >= 10000 },
  { id: 'step50000', name: 'だいぼうけん', desc: '50000ほ あるく。', test: (s) => (s.stats?.steps ?? 0) >= 50000 },

  { id: 'battle1', name: 'はじめての しょうぶ', desc: 'いちど でも たたかう。', test: (s) => (s.stats?.battles ?? 0) >= 1 },
  { id: 'battle50', name: 'れんせんの つわもの', desc: '50かい たたかう。', test: (s) => (s.stats?.battles ?? 0) >= 50 },
  { id: 'battle100', name: 'ひゃくせんれんま', desc: '100かい たたかう。', test: (s) => (s.stats?.battles ?? 0) >= 100 },

  { id: 'catch1', name: 'さいしょの なかま', desc: 'いっぴき つかまえる。', test: (s) => (s.stats?.caught ?? 0) >= 1 },
  { id: 'catch10', name: 'あつめる たのしみ', desc: '10ひき つかまえる。', test: (s) => (s.stats?.caught ?? 0) >= 10 },
  { id: 'catch30', name: 'ポケモンはかせ', desc: '30ひき つかまえる。', test: (s) => (s.stats?.caught ?? 0) >= 30 },

  { id: 'dexAll', name: 'ずかん コンプリート', desc: `ぜんこく${DEX_TOTAL}しゅを ずかんに のせる。`, test: (s) => (s.dex?.caught?.length ?? 0) >= DEX_TOTAL },
  { id: 'dexHalf', name: 'はんぶん みたよ', desc: `${Math.ceil(DEX_TOTAL / 2)}しゅを みる。`, test: (s) => (s.dex?.seen?.length ?? 0) >= Math.ceil(DEX_TOTAL / 2) },
  { id: 'shiny1', name: 'いろちがい はっけん', desc: 'いろちがいの ポケモンを 1ぴき のせる。', test: (s) => (s.dex?.shiny?.length ?? 0) >= 1 },

  { id: 'fled10', name: 'にげあし', desc: '10かい にげる。', test: (s) => (s.stats?.fled ?? 0) >= 10 },
  { id: 'balls20', name: 'ボールを たくさん', desc: 'ボールを 20こ つかう。', test: (s) => (s.stats?.ballsUsed ?? 0) >= 20 },

  { id: 'towerTry', name: 'れんせんタワー ちょうせん', desc: 'れんせんタワーに いちど いどむ。', test: (s) => (s.stats?.towerBest ?? 0) >= 1 },
  { id: 'towerClear', name: 'れんせんタワー せいは', desc: `れんせんタワーで ${TOWER_MAX}れんしょうする。`, test: (s) => (s.stats?.towerBest ?? 0) >= TOWER_MAX },

  { id: 'allBadges', name: 'よんバッジ', desc: `${BADGES.length}つの バッジを あつめる。`, test: (s) => BADGES.every((b) => !!s.flags?.[badgeFlag(b.id)]) },
  { id: 'hof1', name: 'でんどうにゅうり', desc: 'チャンピオンに かつ。', test: (s) => (s.hallOfFameCount ?? 0) >= 1 },
  { id: 'hof5', name: 'なんども でんどう', desc: 'でんどうにゅうりを 5かい する。', test: (s) => (s.hallOfFameCount ?? 0) >= 5 },
  { id: 'traders', name: 'こうかんずき', desc: 'カントーの ごさんけを すべて こうかんする。',
    test: (s) => !!(s.flags?.trade_fushigidane && s.flags?.trade_zenigame && s.flags?.trade_b_done && s.flags?.trade_d_done) },

  { id: 'rich', name: 'だいふごう', desc: 'おかねを 100000円 もつ。', test: (s) => (s.player?.money ?? 0) >= 100000 },
  { id: 'fullParty', name: 'ろっぴき そろえた', desc: 'てもちを 6ぴきに する。', test: (s) => (s.party?.length ?? 0) >= PARTY_MAX },
  { id: 'level100', name: 'さいきょうの なかま', desc: `Lv${MAX_LEVEL}まで そだてる。`, test: (s) => allMons(s).some((m) => m.level >= MAX_LEVEL) },
];

/** 各じっせきに { got } を添えて返す。順序は ACHIEVEMENTS のまま。 */
export function achievementStatus(state) {
  return ACHIEVEMENTS.map((a) => ({ ...a, got: !!a.test(state) }));
}
