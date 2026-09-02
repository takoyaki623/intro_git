/**
 * フィールドの人（v1.4-c）。
 *
 * v0.7 から、主人公も NPC も**1マスぶんの四角**だった。
 * 向きは目の位置を動かして示していたが、それは「四角に目が付いている」だけで、
 * 町に立っているのが人には見えない ―― FRLG との差で一番目立っていたのがここ。
 *
 * ## 四角に見える理由は、大きさのほう
 *
 * 原作の人は **1マスより背が高い**（16×32 のうち上へはみ出す）。
 * マスにぴったり収めると、どう塗っても「マス」に見える。
 * だから**上へはみ出して描く** ―― 足元をマスの下端に合わせ、頭は上のマスへ入る。
 *
 * ## 姿は「描く」のではなく「組む」（v0.12.5 と同じ）
 *
 * 髪・肌・服の3色と、向きと、歩きの駒だけを受け取って組み立てる。
 * 人ごとに絵を持たない ―― 持てば、人を1人足すたびに絵が1枚要る。
 * 素材が入ったときは `source.ts` の口から1枚絵に差し替わる（そちらが優先）。
 */

import type { Direction } from "@pkmn/core";
import { drawImage } from "./source.js";

/** 人の見た目。**役割ではなく色で持つ** ―― 役割を増やしても描き方は変わらない。 */
export type Person = {
  /** 服の色。ここまでは v0.7 の `OBJECT_COLOR` と同じ値を使う。 */
  shirt: string;
  hair: string;
  skin: string;
  /** 帽子（主人公とロケット団）。無ければ髪がそのまま出る。 */
  cap?: string;
  /** ズボン。**服の暗い版で代用しない**（下のコメント）。 */
  pants?: string;
};

export const SKIN = "#f0c9a0";
/** ズボンの既定。人ごとに指定しなくても足が見えるように。 */
const PANTS = "#3a4152";

/** 影。**足元に落ちていないと、地面の上ではなく空中に見える。** */
function shadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 1人描く。`x, y` は**マスの左上**で、足元がマスの下端に来るように上へ伸ばす。
 *
 * `step` は歩きの駒（0 = 揃える、1 = 開く）。止まっている人は 0 のまま。
 */
export function drawPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  facing: Direction,
  person: Person,
  step: 0 | 1,
  name?: string,
): void {
  // 素材があれば1枚絵。向きごとに分けたければ `-down` などを先に見る
  if (name !== undefined && drawImage(ctx, [`${name}-${facing}`, name], x, y - size * 0.4, size)) {
    return;
  }

  const px = size / 16; // 16px を1として組む（マスの大きさが変わっても比率で効く）
  const cx = x + size / 2;
  const foot = y + size - px; // 足の裏
  const put = (color: string, ox: number, oy: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(cx + ox * px), Math.round(foot + oy * px), Math.round(w * px), Math.round(h * px));
  };

  shadow(ctx, cx, foot, size * 0.3);

  const back = facing === "up";
  const side = facing === "left" || facing === "right";
  const dark = (c: string) => shadeHex(c, -0.22);

  // ── 靴 ──（歩いている駒では前後にずらす）
  const gap = step === 1 ? 1 : 0;
  const shoe = shadeHex(person.pants ?? PANTS, -0.12);
  put(shoe, -4, -2 + gap, 3, 2);
  put(shoe, 1, -2 - gap, 3, 2);

  // ── ズボン ──
  // **服と別の色にする。** 服の暗い版で描いていたら、裾から下が
  // 「服の影」にしか見えず、**立っているのに足が無い人**になった
  put(person.pants ?? PANTS, -4, -6, 8, 4);

  // ── 胴 ──（横向きは肩幅を1つ細く）
  const bodyW = side ? 7 : 9;
  put(person.shirt, -bodyW / 2, -11, bodyW, 5);
  // 腕。**服より暗くしておくと、胴と分かれて見える**
  put(dark(person.shirt), side ? -1.5 : -bodyW / 2 - 1, -11, 2, 4);
  if (!side) put(dark(person.shirt), bodyW / 2 - 1, -11, 2, 4);

  // ── 頭 ──（1マスより上へ出る所）
  put(person.skin, -5, -18, 10, 7);
  // 髪。後ろ向きは頭ぜんたい、横向きは後頭部まで、前向きは前髪だけ
  const hairTop = person.cap ?? person.hair;
  if (back) {
    put(person.hair, -5, -18, 10, 7);
    // **後ろ姿でも帽子は見える。** 髪で塗り潰すと、振り向いた瞬間に
    // 帽子が現れる人になる（原作では後ろからでも赤い帽子が見える）
    if (person.cap !== undefined) put(person.cap, -5, -18, 10, 4);
  } else if (side) {
    put(person.hair, facing === "left" ? 1 : -5, -18, 4, 6);
    put(hairTop, -5, -18, 10, 2);
  } else {
    put(hairTop, -5, -18, 10, 3);
  }
  // つばは前と横だけ。後ろから見ると、つばは頭の向こう側にある
  if (person.cap !== undefined && !back) put(person.cap, -6, -16, 12, 1);

  // ── 目 ──（後ろ向きには無い）
  if (!back) {
    if (side) put("#2a2a2a", facing === "left" ? -4 : 2, -14, 2, 2);
    else {
      put("#2a2a2a", -4, -14, 2, 2);
      put("#2a2a2a", 2, -14, 2, 2);
    }
  }
}

/** `tiles.ts` の `shade` と同じ計算。**色の足し引きは1か所に置きたい**が、
 * あちらは `rgb()` を返す（キャンバス向け）ので、そのまま使っている。 */
function shadeHex(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `rgb(${mix((n >> 16) & 0xff)},${mix((n >> 8) & 0xff)},${mix(n & 0xff)})`;
}
