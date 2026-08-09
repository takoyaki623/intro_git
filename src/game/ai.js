// 相手の行動選択。
//
// 野生は「わりと素直に強い技を選ぶが、たまに外す」くらいが遊んでいて気持ちいい。
// 完全ランダムだと手応えがなく、完全最適だと理不尽になる。

import { getMove } from '../data/moves.js';
import { effectiveness } from '../data/types.js';
import { damage } from './formulas.js';

/** その技のおおよその期待ダメージ（乱数を平均で固定して評価） */
function score(user, target, move) {
  const def = getMove(move.id);
  if (!def) return 0;

  if (def.category === '変化') {
    // 変化技は相手が万全なときだけ少し価値がある
    const fresh = target.curHP / target.stats.hp > 0.7 && !target.status;
    return fresh ? 12 : 3;
  }

  const eff = effectiveness(def.type, target.types);
  if (eff === 0) return 0;

  const avg = { chance: () => false, int: (a, b) => Math.floor((a + b) / 2) };
  const { dmg } = damage(user, target, def, avg);
  // 倒しきれる技は強く優先する
  return dmg >= target.curHP ? dmg * 3 : dmg;
}

export function chooseAction(user, target, rng) {
  const usable = user.moves.filter((m) => m.pp > 0);
  if (!usable.length) {
    return { type: 'struggle', user };
  }

  // 1割で気まぐれ。読み切られない程度のゆらぎ。
  if (rng.chance(0.1)) {
    return { type: 'move', user, move: getMove(rng.pick(usable).id), slot: user.moves.indexOf(rng.pick(usable)) };
  }

  let best = null;
  let bestScore = -1;
  for (const m of usable) {
    const s = score(user, target, m);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  const chosen = best ?? usable[0];
  return { type: 'move', user, move: getMove(chosen.id), slot: user.moves.indexOf(chosen) };
}
