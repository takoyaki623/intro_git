/**
 * AI `basic`（v0.5）― 期待ダメージとタイプ相性だけを見る1ターン先読みの貪欲法。
 *
 * 確定数計算をしないので軽い。一般トレーナーと施設の低段位はこれで十分。
 * `smart`（確定数・積みの価値評価・交代の価値評価）は v1.1。
 *
 * 難易度は policy ではなく mistakeRate で刻む。
 * 「最強を作ってから確率で劣化させる」の逆向き（basic を土台に積む）だが、
 * mistakeRate の意味は同じ ―― 明らかな悪手は打たないが詰めが甘い。
 *
 * 設計: docs/design/ai.md §4・§6・§8
 */

import { calcDamage } from "../damage.js";
import { DEFAULT_FRIENDSHIP } from "../normalize.js";
import type { GameData } from "../gamedata.js";
import type { Rng } from "../rng.js";
import { calcAllStats, MAX_IVS, ZERO_STATS } from "../stats.js";
import { effectivenessAgainst } from "../typechart.js";
import type { Action, BattlePokemon, Move, ScreenId, StatId, WeatherId } from "../types.js";
import { EMPTY_STAGES, freshVolatile } from "../types.js";
import type { AiConfig, AiView } from "./view.js";

export type ScoredAction = {
  action: Action;
  score: number;
  /** AI が不可解な行動をしたときに原因を追うための記録。UI には出さない。 */
  reason: string;
};

/** ダメージ乱数の期待値。85〜100 の中央。 */
const AVERAGE_ROLL = 92;

/**
 * 相手の実数値を推定する。
 *
 * AI に相手の実数値は見えない（AiView）。
 * 種族値・レベル・性格補正なし・個体値31・努力値0 を仮定して組み立てる。
 * 実際より低く出ることが多いが、`basic` の判断には十分な精度になる。
 */
function estimateFoe(data: GameData, view: AiView): BattlePokemon {
  const species = data.species(view.foe.species);
  const stats = calcAllStats(data, species, view.foe.level, MAX_IVS, ZERO_STATS, undefined);
  return {
    species: species.id,
    name: species.name,
    level: view.foe.level,
    types: view.foe.types,
    stats,
    maxHp: stats.hp,
    currentHp: Math.max(1, Math.round(stats.hp * view.foe.hpRatio)),
    moves: [],
    // 相手の特性・持ち物は見えない。推定に混ぜない
    ability: null,
    innateAbility: null,
    item: null,
    itemConsumed: false,
    status: view.foe.status,
    statusCounter: 0,
    statStages: { ...view.foe.statStages },
    friendship: DEFAULT_FRIENDSHIP,
    gender: null,
    volatile: freshVolatile(),
  };
}

/** 乱数を消費しない期待ダメージ。AI の思考でバトルの乱数列を動かさないため。 */
function expectedDamage(
  data: GameData,
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  rng: Rng,
  weather: WeatherId | null,
  screens: readonly ScreenId[],
): { damage: number; effectiveness: number } {
  const result = calcDamage(data, attacker, defender, move, rng, {
    forceCritical: false,
    forceRandom: AVERAGE_ROLL,
    weather,
    screens,
  });
  return { damage: result.damage, effectiveness: result.effectiveness };
}

/** 自分がその相手に対して有利かどうか（交代の判断に使う単純な指標）。 */
function matchupIsBad(data: GameData, view: AiView, mon: BattlePokemon): boolean {
  const incoming = Math.max(
    ...view.foe.types.map((t) => effectivenessAgainst(data.typeChart, t, mon.types)),
  );
  return incoming >= 2;
}

function scoreMove(
  data: GameData,
  view: AiView,
  foe: BattlePokemon,
  move: Move,
  rng: Rng,
): { score: number; reason: string } {
  const self = view.own.active;
  const ownHpRatio = self.maxHp === 0 ? 0 : self.currentHp / self.maxHp;

  if (move.category !== "status") {
    const { damage, effectiveness } = expectedDamage(data, self, foe, move, rng, view.weather, view.foe.screens);
    if (effectiveness === 0) return { score: -100, reason: "こうかがない" };
    const ratio = damage / Math.max(1, foe.currentHp);
    if (ratio >= 1) return { score: 300 + damage, reason: "確実に倒せる" };
    return { score: Math.min(1, ratio) * 100, reason: `期待ダメージ ${damage}（${ratio.toFixed(2)}）` };
  }

  // ── 変化技 ──
  const effect = move.effect;
  if (effect === undefined) return { score: -50, reason: "効果がない" };

  switch (effect.kind) {
    case "heal":
      return ownHpRatio > 0.6
        ? { score: -20, reason: "HPが減っていない" }
        : { score: 40 + (1 - ownHpRatio) * 60, reason: "HPが減っている" };
    case "status":
      return view.foe.status !== null
        ? { score: -30, reason: "相手はすでに状態異常" }
        : { score: 45, reason: "状態異常をいれる" };
    case "confuse":
      return { score: 30, reason: "混乱をいれる" };
    case "weather":
      return view.weather === effect.weather
        ? { score: -30, reason: "同じ天気がもう出ている" }
        : { score: 35, reason: "天気を変える" };
    case "screen":
      return view.own.screens.includes(effect.screen)
        ? { score: -30, reason: "同じ壁がもう張ってある" }
        : { score: 45, reason: "壁を張る" };
    case "statChange": {
      // 積み技は序盤かつ余裕があるときだけ。終盤に積んでも間に合わない
      const early = view.turn <= 4;
      if (effect.target === "self") {
        return early && ownHpRatio > 0.6
          ? { score: 55, reason: "序盤に積む" }
          : { score: 5, reason: "積むには遅い" };
      }
      return early ? { score: 35, reason: "相手を弱める" } : { score: 10, reason: "弱化は遅い" };
    }
    default:
      return { score: 10, reason: "その他の変化技" };
  }
}

export function scoreActions(
  data: GameData,
  view: AiView,
  rng: Rng,
): ScoredAction[] {
  const foe = estimateFoe(data, view);
  const self = view.own.active;
  const ownHpRatio = self.maxHp === 0 ? 0 : self.currentHp / self.maxHp;
  const badMatchup = matchupIsBad(data, view, self);

  return view.legal.map((action) => {
    if (action.kind === "move") {
      const slot = self.moves[action.moveIndex];
      if (slot === undefined) return { action, score: 0, reason: "わるあがき" };
      const { score, reason } = scoreMove(data, view, foe, data.move(slot.id), rng);
      return { action, score, reason };
    }
    if (action.kind === "switch") {
      const target = view.own.party[action.partyIndex]!;
      // basic の交代条件は「相性が悪い かつ HPが減っている」だけ。
      // 交代の価値評価（受けるダメージとの引き算）は smart から。
      if (!badMatchup || ownHpRatio > 0.5) {
        return { action, score: -10, reason: "交代する理由がない" };
      }
      const better = !matchupIsBad(data, view, target);
      return {
        action,
        score: better ? 60 : 0,
        reason: better ? "不利な対面から逃げる" : "交代先も不利",
      };
    }
    return { action, score: -100, reason: "未実装の行動" };
  });
}

export function chooseBasicAction(
  data: GameData,
  view: AiView,
  config: AiConfig,
  rng: Rng,
): Action {
  const scored = scoreActions(data, view, rng);
  if (scored.length === 0) throw new Error("no legal action");

  const sorted = [...scored].sort((a, b) => b.score - a.score);

  // mistakeRate は「完全ランダム」ではなく「上位から選び損ねる」。
  // 明らかな悪手は打たないまま、詰めだけが甘くなる。
  if (config.mistakeRate > 0 && rng.chance(config.mistakeRate)) {
    return rng.pick(sorted.slice(0, Math.min(3, sorted.length))).action;
  }
  return sorted[0]!.action;
}
