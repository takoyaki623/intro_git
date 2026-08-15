// 「いま なにを すべきか」を1行で表すヒント（めもちょう）。
// state を読むだけの純関数。副作用なし、フラグの分岐だけで決まるので
// テストで全分岐をそのまま検査できる。

import { SPECIES } from '../data/species.js';
import { TOWER_TRAINERS } from '../data/tower.js';

const DEX_TOTAL = Object.keys(SPECIES).length;
const TOWER_MAX = TOWER_TRAINERS.length;

export function objective(state) {
  const f = state.flags;
  if (!f.gotStarter) return 'はかせから さいしょの ポケモンを もらおう。';
  if (!f.badge_denki) return 'トキワジムに いどんで でんきバッジを めざそう。';
  if (!f.badge_iwa) return 'ニビジムに いどんで いわバッジを めざそう。';
  if (!f.badge_mizu) return 'なみのりで おつきみやまの ちていこの さきへ すすみ、みずバッジを めざそう。';
  if (!f.badge_kusa) return 'ハナカゴジムに いどんで くさバッジを めざそう。';
  if (!f.badge_ghost) return 'ボレイどうくつの おくの ゴーストジムで バッジを めざそう。';
  if (!f.hallOfFame) return 'ポケモンリーグに いどんで チャンピオンを たおそう。';
  // 殿堂入り後にだけ出る導線。towerBest が 0 のうちは「そんな場所がある」ことを知らせ、
  // 一度でも挑んだあとは全勝という具体的な目標に切り替える。
  const best = state.stats?.towerBest ?? 0;
  if (best === 0) return 'リーグうけつけの タワーずかいに れんせんタワーを きこう。';
  if (!f.trade_fushigidane || !f.trade_zenigame || !f.trade_b_done || !f.trade_d_done) {
    return 'ポケモンセンターで カントー御三家を あつめよう。';
  }
  if (state.dex.caught.length < DEX_TOTAL) return 'ずかんを うめて はかせに とどけよう。';
  if (best < TOWER_MAX) return `れんせんタワーの ${TOWER_MAX}れんしょうを めざそう。`;
  return 'そだてやや つりざおで、じっくり ポケモンを そだてよう。';
}
