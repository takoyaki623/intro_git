// 「いま なにを すべきか」を1行で表すヒント（めもちょう）。
// state を読むだけの純関数。副作用なし、フラグの分岐だけで決まるので
// テストで全分岐をそのまま検査できる。

import { SPECIES } from '../data/species.js';

const DEX_TOTAL = Object.keys(SPECIES).length;

export function objective(state) {
  const f = state.flags;
  if (!f.gotStarter) return 'はかせから さいしょの ポケモンを もらおう。';
  if (!f.badge_denki) return 'トキワジムに いどんで でんきバッジを めざそう。';
  if (!f.badge_iwa) return 'ニビジムに いどんで いわバッジを めざそう。';
  if (!f.badge_kusa) return 'なみのりで おつきみやまの ちていこの さきへ すすみ、くさバッジを めざそう。';
  if (!f.badge_ghost) return 'ボレイどうくつの おくの ゴーストジムで バッジを めざそう。';
  if (!f.hallOfFame) return 'ポケモンリーグに いどんで チャンピオンを たおそう。';
  if (!f.trade_fushigidane || !f.trade_zenigame || !f.trade_b_done || !f.trade_d_done) {
    return 'ポケモンセンターで カントー御三家を あつめよう。';
  }
  if (state.dex.caught.length < DEX_TOTAL) return 'ずかんを うめて はかせに とどけよう。';
  return 'そだてやや つりざおで、じっくり ポケモンを そだてよう。';
}
