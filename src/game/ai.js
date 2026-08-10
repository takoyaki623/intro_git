// 相手の行動選択。
//
// 野生は「わりと素直に強い技を選ぶが、たまに外す」くらいが遊んでいて気持ちいい。
// 完全ランダムだと手応えがなく、完全最適だと理不尽になる。
//
// トレーナーは skill で賢さを変える。ジムリーダーは気まぐれを起こさず、
// 変化技も状況を見て使ってくる。

import { getMove } from '../data/moves.js';
import { effectiveness } from '../data/types.js';
import { damage } from './formulas.js';

/** 期待ダメージ（乱数と急所を平均で固定して評価する） */
function expectedDamage(user, target, def) {
  const avg = { chance: () => false, int: (a, b) => Math.floor((a + b) / 2) };
  const { dmg } = damage(user, target, def, avg);
  return dmg;
}

/**
 * 変化技の値ぶみ。
 * 「効かない場面で撃たない」ことのほうが、賢い一手を選ぶことより効く。
 * 状態異常が入っている相手にもう一度ねむりごなを撃つ、が一番しらける。
 */
function statusScore(user, target, e, hpRatio) {
  if (!e) return 4;

  switch (e.kind) {
    case 'status':
      if (target.status) return 0;                      // すでに掛かっている
      // 相手が元気なうちほど効く。削り切れる相手には撃たない。
      return hpRatio > 0.5 ? 26 : 8;

    case 'stat': {
      const self = e.target === 'self';
      const victim = self ? user : target;
      const cur = victim.stages[e.stat] ?? 0;
      const next = Math.max(-6, Math.min(6, cur + e.stages));
      if (next === cur) return 0;                       // もう限界
      // 序盤に積むほど元が取れる。終盤の積み技は無駄。
      return hpRatio > 0.6 ? 22 : 6;
    }

    case 'confuse':
      return target.volatile.confusion > 0 ? 0 : (hpRatio > 0.5 ? 24 : 8);

    case 'heal': {
      const own = user.curHP / user.stats.hp;
      if (own > 0.75) return 0;                         // 満タン近くで回復しない
      return own < 0.35 ? 40 : 14;
    }

    default:
      return 4;
  }
}

/** その技のよさ。数字はダメージ換算のつもり。 */
function score(user, target, move) {
  const def = getMove(move.id);
  if (!def) return 0;

  const hpRatio = target.curHP / target.stats.hp;

  if (def.category === '変化') {
    return statusScore(user, target, def.effect, hpRatio);
  }

  const eff = effectiveness(def.type, target.types);
  if (eff === 0) return 0;

  const dmg = expectedDamage(user, target, def);
  // 倒しきれる技は強く優先する
  if (dmg >= target.curHP) return dmg * 3 + 50;
  // 命中の低い技はそのぶん割り引く
  return dmg * ((def.accuracy ?? 100) / 100);
}

/**
 * 1手えらぶ。
 * skill 0..3。0 は野生（気まぐれ多め）、3 はジムリーダー。
 */
export function chooseAction(user, target, rng, skill = 0) {
  const usable = user.moves.filter((m) => m.pp > 0);
  if (!usable.length) return { type: 'struggle', user };

  const pickMove = (m) => ({ type: 'move', user, move: getMove(m.id), slot: user.moves.indexOf(m) });

  // 賢いほど気まぐれを起こさない
  const whim = [0.18, 0.12, 0.06, 0][Math.min(3, skill)];
  if (rng.chance(whim)) return pickMove(rng.pick(usable));

  const scored = usable.map((m) => ({ m, s: score(user, target, m) }));
  scored.sort((a, b) => b.s - a.s);

  // 弱いトレーナーは2番目に良い手をつかむことがある。
  // 「たまに手を抜く」ほうが、乱数で全然ちがう技を撃つより自然に見える。
  if (skill <= 1 && scored.length > 1 && rng.chance(0.25)) return pickMove(scored[1].m);

  return pickMove(scored[0].m);
}
