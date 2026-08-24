/**
 * 捕獲（v0.8）。
 *
 * `core` が返すのは **「捕まえたか」と「何回揺れたか」だけ。**
 * 揺れる演出も、失敗したときの文言も UI の仕事 ――
 * バトルが `BattleEvent[]` を返すのと同じ考え方（capture.md §2）。
 *
 * 設計: docs/design/capture.md §2・§3
 */

import type { GameData } from "./gamedata.js";
import type { Rng } from "./rng.js";
import type { Ball, BattlePokemon, ItemId, StatusId } from "./types.js";

/** 状態異常による捕まえやすさ（capture.md §2）。 */
const STATUS_BONUS: Record<StatusId, number> = {
  sleep: 2.5,
  freeze: 2.5,
  paralysis: 1.5,
  poison: 1.5,
  toxic: 1.5,
  burn: 1.5,
};

/** 揺れの回数。4回そろって捕獲。 */
export const SHAKES = 4;

/** 判定に効く「今の状況」。ボールの条件付き補正が読む。 */
export type CaptureContext = {
  /** 今のターン数。クイックボール・タイマーボール。 */
  turn: number;
  /** 今いる地形。ダークボール。 */
  terrain?: string;
  /** その種を図鑑で捕獲済みか。リピートボール。 */
  alreadyCaught?: boolean;
  /**
   * サファリの段階（v1.1-h）。**イシで上がり、エサで下がる。**
   *
   * サファリでは技が使えないので、**HP を削る代わりがこれ**になる ――
   * 捕獲値の式は同じまま、`hpTerm` の代わりに段階が効く。
   * 逃げやすさは反対に動く（イシで逃げやすく、エサで居座る）ので、
   * 「当てやすくすると逃げられる」という択になる。
   *
   * **道具にはしない。** バッグに入れるとサファリの外へ持ち出せてしまい、
   * 「その場所だけの規則」という前提が崩れる（`MapData.rules` の意味が消える）。
   */
  safari?: { rocks: number; baits: number };
};

/**
 * サファリの段階の効き方（v1.1-h）。調整項目。
 *
 * 原作は「怒り」と「食事」の2つの状態を別々に持つが、
 * **1本の軸にまとめた** ―― 2つ持つと「怒りながら食べている」が表現でき、
 * その意味を決めないといけなくなる。軸1本なら決めなくてよい。
 */
export const SAFARI = {
  /** 1段階あたりの捕獲補正。イシ1つで倍、エサ1つで半分。 */
  perStage: 2,
  /** 段階の上限・下限。 */
  maxStage: 3,
  /** 逃げる基本確率と、1段階あたりの増減。 */
  fleeBase: 0.1,
  fleePerStage: 0.08,
};

const stageOf = (context: CaptureContext): number => {
  const s = context.safari;
  if (s === undefined) return 0;
  return Math.max(-SAFARI.maxStage, Math.min(SAFARI.maxStage, s.rocks - s.baits));
};

/** サファリの段階による捕獲補正。サファリの外では 1。 */
export const safariBonus = (context: CaptureContext): number =>
  context.safari === undefined ? 1 : SAFARI.perStage ** stageOf(context);

/**
 * その場から逃げる確率（v1.1-h）。**サファリの外では 0。**
 *
 * イシを投げるほど逃げやすく、エサをやるほど居座る ――
 * 捕獲補正と逆に動くので、「当てやすくすると逃げられる」という択になる。
 */
export const safariFleeChance = (context: CaptureContext): number =>
  context.safari === undefined
    ? 0
    : Math.max(0, Math.min(1, SAFARI.fleeBase + SAFARI.fleePerStage * stageOf(context)));

/** ボールの補正倍率。**条件の種類だけがコードで、ボールはデータ。** */
export function ballBonus(ball: Ball, target: BattlePokemon, context: CaptureContext): number {
  const bonus = ball.bonus;
  switch (bonus.kind) {
    case "flat":
      return bonus.value;
    case "guaranteed":
      return Number.POSITIVE_INFINITY;
    case "type":
      return target.types.some((t) => bonus.types.includes(t)) ? bonus.value : bonus.fallback;
    case "turnAtMost":
      return context.turn <= bonus.turns ? bonus.value : bonus.fallback;
    case "turnAtLeast":
      return context.turn >= bonus.turns ? bonus.value : bonus.fallback;
    case "terrain":
      return context.terrain === bonus.terrain ? bonus.value : bonus.fallback;
    case "alreadyCaught":
      return context.alreadyCaught === true ? bonus.value : bonus.fallback;
  }
}

/**
 * 捕獲値 a（第5世代以降準拠）。
 *
 *   a = (3×最大HP − 2×現在HP) / (3×最大HP) × 種族の捕獲率 × ボール補正 × 状態異常補正
 *
 * HP を削るほど、状態異常にするほど上がる。**255 以上なら確定。**
 */
export function catchValue(
  data: GameData,
  target: BattlePokemon,
  ball: Ball,
  context: CaptureContext,
): number {
  const bonus = ballBonus(ball, target, context);
  if (!Number.isFinite(bonus)) return Number.POSITIVE_INFINITY;

  const rate = data.species(target.species).catchRate;
  const hpTerm = (3 * target.maxHp - 2 * Math.max(1, target.currentHp)) / (3 * target.maxHp);
  const status = target.status === null ? 1 : STATUS_BONUS[target.status];
  // サファリの段階（v1.1-h）。**式は変えず、係数を1つ足すだけ** ――
  // 技が使えないぶん、`hpTerm` が動かない代わりにここが動く
  return hpTerm * rate * bonus * status * safariBonus(context);
}

export type CaptureResult = {
  caught: boolean;
  /** 何回揺れたか（0〜4）。**そのまま演出の回数になる。** */
  shakes: number;
  /** 確定捕獲だったか。演出を短くするのに使う。 */
  guaranteed: boolean;
};

/**
 * ボールを投げる。
 *
 * 揺れ判定を4回行い、全て成功で捕獲。
 * 途中で失敗したらそこまでの回数を返す ―― 3回揺れて出てくるのが「惜しい」演出になる。
 */
export function attemptCapture(
  data: GameData,
  target: BattlePokemon,
  ball: Ball,
  context: CaptureContext,
  rng: Rng,
): CaptureResult {
  const a = catchValue(data, target, ball, context);
  if (a >= 255) return { caught: true, shakes: SHAKES, guaranteed: true };

  // b = 65536 / (255 / a)^0.1875
  const b = 65536 / (255 / a) ** 0.1875;
  for (let shake = 0; shake < SHAKES; shake += 1) {
    if (rng.int(65536) >= b) return { caught: false, shakes: shake, guaranteed: false };
  }
  return { caught: true, shakes: SHAKES, guaranteed: false };
}

/** 捕獲率の目安（0〜1）。UI で「捕まえやすさ」を出すときに使う。 */
export function captureChance(
  data: GameData,
  target: BattlePokemon,
  ball: Ball,
  context: CaptureContext,
): number {
  const a = catchValue(data, target, ball, context);
  if (a >= 255) return 1;
  const b = 65536 / (255 / a) ** 0.1875;
  return Math.min(1, b / 65536) ** SHAKES;
}

/** ボールかどうか。バッグの中から投げられるものを選ぶのに使う。 */
export const isBall = (data: GameData, item: ItemId): boolean =>
  data.item(item).category === "ball";
