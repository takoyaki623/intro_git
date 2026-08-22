/**
 * バトルの演出（v0.11.5）。
 *
 * ## `core` は1行も触らない
 *
 * 演出は `BattleEvent` を**消費する側**の仕事、というのが v0.1 からの分担。
 * ここでやることは全部「イベントを見て CSS クラスを足す」だけなので、
 * **高速モードで飛ばしても結果は1ビットも変わらない。**
 * それを守っているのはテストではなく、この分担そのもの。
 *
 * ## v0.11 まで演出が「付けられなかった」理由
 *
 * バトル画面は `#field` の innerHTML を**イベントごとに全部作り直していた。**
 * DOM が毎回別物になるので、
 *
 *   - HPバーの `transition: width .3s`（v0.3 から CSS にあった）は一度も動かず、
 *     幅は常に「新しい要素の初期値」として即座に確定していた
 *   - 揺れも点滅も、始まった瞬間に要素ごと消えていた
 *
 * **作り直しをやめない限り、どんな演出も原理的に効かない。**
 * v0.10.5 の「1マス1色である限り色を増やしても密度が上がるだけ」と同じ形で、
 * 足すべきものより先に、足せない造りの方を直す必要があった。
 *
 * 設計: docs/design/ui-flow.md §4
 */

import type { Effectiveness, SideIndex } from "@pkmn/core";

/**
 * 動かしてよいか。
 *
 * 2つの理由で止まる。
 *   1. **高速モード／ログのみ** … 周回のための機能なので、演出は邪魔でしかない
 *   2. **`prefers-reduced-motion`** … 閲覧環境の設定。こちらが上書きしない
 */
let allowed = true;

export function allowMotion(on: boolean): void {
  allowed = on;
}

const reduced = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const motionOn = (): boolean => allowed && !reduced();

/**
 * クラスを足して、少ししてから外す。
 *
 * `animationend` を待たない ―― **待つと、要素が途中で作り直されたときに
 * 二度と外れない。** 時間で外す方が、取りこぼしても次の演出が動く。
 */
function flash(el: Element | null, className: string, ms: number): void {
  if (el === null || !motionOn()) return;
  el.classList.remove(className);
  // 同じクラスを連続で足しても再生されるよう、レイアウトを1回確定させる
  void (el as HTMLElement).offsetWidth;
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), ms);
}

/** 技を出した側が前に出る。 */
export function lunge(el: Element | null, side: SideIndex): void {
  flash(el, side === 0 ? "lunge-up" : "lunge-down", 380);
}

/**
 * 被弾。**効果と急所で強さを変える。**
 *
 * 「こうかは ばつぐんだ」はログにも出るが、
 * ログは読まないと分からない ―― 見て分かる差を1つ足しておく。
 */
export function hit(el: Element | null, effectiveness: Effectiveness, critical: boolean): void {
  if (effectiveness === 0) return; // 効かなかったものは揺らさない
  const strong = effectiveness > 1 || critical;
  flash(el, strong ? "hit-strong" : effectiveness < 1 ? "hit-weak" : "hit", strong ? 460 : 340);
}

/** 状態異常・毒ダメージなど、技以外で減ったとき。 */
export const tick = (el: Element | null): void => flash(el, "tick", 300);

/** 回復。 */
export const heal = (el: Element | null): void => flash(el, "healed", 520);

/** ひんし。**外さない** ―― 倒れたものは次の交代まで倒れたまま。 */
export function faint(el: Element | null): void {
  if (el === null || !motionOn()) return;
  el.classList.add("fainted");
}

/** 場に出る。 */
export const enter = (el: Element | null): void => flash(el, "entering", 420);

/** 技のタイプで場を1瞬だけ染める。技の色は既に `TYPE_COLOR` が持っている。 */
export function tint(field: Element | null, color: string): void {
  if (field === null || !motionOn()) return;
  const el = field as HTMLElement;
  el.style.setProperty("--tint", color);
  flash(el, "tinted", 300);
}
