/**
 * 地形の描き分け（v0.10.5）。
 *
 * v0.10 まで、1マスは**1色の四角**だった。地形と通行可否から色を決め、
 * 通れないマスには枠線を引く ―― 規則としては正しいが、
 * **町も森も同じ大きさの四角が並ぶだけ**で、地面と物の区別がつかなかった。
 *
 * ここでやるのは1つだけ。
 *
 * > **隣を見る。**
 *
 * 同じ地形が隣にあるかどうかで、角・辺・内側を描き分ける（オートタイル）。
 * **データは1文字も変えていない** ―― `layers.ground` の凡例文字は v0.7 からあり、
 * それを「隣と同じか」に使うだけで、草地に縁ができ、木がまとまり、道が繋がる。
 *
 * 設計: docs/design/ui-flow.md §2.3・§2.4
 */

import type { TerrainId } from "@pkmn/core";
import { drawImage } from "./source.js";

/**
 * 凡例の文字ごとの色。**見た目のヒントにしか使わない。**
 *
 * 通行可否と地形は `collision` / `terrain` が持っていて、ここは一切関与しない。
 * 逆に、規則からだけ色を決めると「木の茂み」と「家の壁」が同じ緑になり、
 * 町が森に見えてしまう（v0.7 で一度そうなった）。
 */
export const TILE_HINT: Record<string, string> = {
  T: "#3c6b34", // 木
  H: "#b5674c", // 家の壁
  W: "#9a9086", // 屋内の壁
  B: "#7a6ba8", // ベッド
  C: "#5d6a7a", // パソコン
  M: "#5a6f7d", // 機械・棚
  P: "#c94f46", // ポケモンセンターの屋根（原作の赤）
  F: "#3f6fa8", // フレンドリィショップの屋根（原作の青）
  A: "#8a6fb0", // 大会会場の屋根（拠点）
  S: "#a98b5f", // カウンター
  X: "#8b8f98", // 石の壁（拠点）
  G: "#d8cba0", // ゲート前の敷石（拠点）
  D: "#8a5f33", // ドア
  I: "#cbbf9c", // 見えない壁（床と同じ色。v1.1-g）
};

/**
 * **見た目だけ別の文字として扱う**（v1.1-g）。
 *
 * 凡例は「見た目（文字）」と「規則（地形＋`!`）」が別物なので、
 * *通行不可のまま床として描く*ことができる ―― セキチクジムの見えない壁。
 *
 * `TILE_HINT` に色を足すだけでは足りなかった。オートタイルの縁は
 * **隣が同じ文字か**で決まるので、色だけ合わせても
 * 見えない壁の周りに縁が出て、**床の上に格子が浮かんで見える。**
 * 計画では「`TILE_HINT` に1行」と見積もっていたが、
 * 隣接の判定がもう1箇所あることを数え落としていた。
 */
export const TILE_ALIAS: Record<string, string> = {
  I: ".",
};

/** 地面の基本色。地形が優先で、無ければ凡例の文字、それも無ければ規則。 */
export function baseColor(terrain: TerrainId, blocked: boolean, hint: string | undefined): string {
  if (terrain === "water") return "#2f6fb5";
  if (terrain === "grass") return "#4f9b46";
  if (terrain === "ledge") return "#8a6a3d";
  if (terrain === "sand") return "#d8c48a";
  if (terrain === "cave") return blocked ? "#4a4642" : "#7b736b";
  const named = hint === undefined ? undefined : TILE_HINT[hint];
  if (named !== undefined) return named;
  return blocked ? "#3d5a3a" : "#cbbf9c";
}

/** 明るさを足し引きした色。オートタイルの縁と面に使う。 */
export function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  const r = mix((n >> 16) & 0xff);
  const g = mix((n >> 8) & 0xff);
  const b = mix(n & 0xff);
  return `rgb(${r},${g},${b})`;
}

/** 隣接の様子。呼び出し側がマップを見て埋める。 */
export type Neighbors = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export type TileView = {
  terrain: TerrainId;
  blocked: boolean;
  /** 凡例の文字（`layers.ground`）。 */
  hint: string | undefined;
  /** **同じ種類**が隣にあるか。種類の判定は呼び出し側（同じ文字 or 同じ地形）。 */
  same: Neighbors;
};

const CORNER = 5;

/**
 * 1マス描く。
 *
 * 順に「面 → 縁 → 地形ごとの模様」。
 * 縁を**内側に**描くので、隣り合う同種のマスの間には線が出ない ――
 * これが「1色の四角が並ぶ」感じを消す一番効く部分。
 */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  view: TileView,
  x: number,
  y: number,
  size: number,
): void {
  // 凡例の文字で1枚ずつ差してもよいし、地形名でまとめて1枚でもよい（source.ts）
  const names = view.hint === undefined
    ? [`tile-${view.terrain}`]
    : [`tile-${view.hint}`, `tile-${view.terrain}`];
  if (drawImage(ctx, names, x, y, size)) return;

  const base = baseColor(view.terrain, view.blocked, view.hint);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, size, size);

  // ── 縁 ──
  // 隣が違う種類の側だけ、内側に細い帯を引く。
  // 上辺は明るく、下辺は暗く ―― 光が上から来ているという1つの約束だけで、
  // 平らな四角が「面」に見えるようになる
  const edge = Math.max(2, Math.round(size / 9));
  const { same } = view;
  if (!same.up) {
    ctx.fillStyle = shade(base, 0.1);
    ctx.fillRect(x, y, size, edge);
  }
  if (!same.down) {
    ctx.fillStyle = shade(base, -0.12);
    ctx.fillRect(x, y + size - edge, size, edge);
  }
  if (!same.left) {
    ctx.fillStyle = shade(base, 0.05);
    ctx.fillRect(x, y, edge, size);
  }
  if (!same.right) {
    ctx.fillStyle = shade(base, -0.06);
    ctx.fillRect(x + size - edge, y, edge, size);
  }

  // ── 角 ──
  // 2辺が同時に外を向いているところだけ、少し丸く見せる
  ctx.fillStyle = shade(base, -0.18);
  const corners = [
    [!same.up && !same.left, x, y],
    [!same.up && !same.right, x + size - CORNER, y],
    [!same.down && !same.left, x, y + size - CORNER],
    [!same.down && !same.right, x + size - CORNER, y + size - CORNER],
  ] as const;
  for (const [on, cx, cy] of corners) {
    if (on) ctx.fillRect(cx, cy, CORNER, CORNER);
  }

  drawPattern(ctx, view, x, y, size);
}

/** 地形ごとの模様。草の葉・段差の落ち際・水面。 */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  view: TileView,
  x: number,
  y: number,
  size: number,
): void {
  const base = baseColor(view.terrain, view.blocked, view.hint);

  if (view.terrain === "grass") {
    // 草むらは「入ると野生が出る」印でもあるので、必ず見分けがつくようにする
    ctx.fillStyle = shade(base, -0.16);
    for (const [gx, gy] of [
      [0.2, 0.62],
      [0.47, 0.42],
      [0.72, 0.66],
    ] as const) {
      ctx.fillRect(x + size * gx, y + size * gy, Math.max(2, size / 10), Math.max(5, size / 4));
    }
    return;
  }

  if (view.terrain === "ledge") {
    // 段差は南にしか降りられない。**落ち際を下辺に描く**ことで向きを示す
    ctx.fillStyle = shade(base, -0.3);
    ctx.fillRect(x, y + size - Math.round(size / 4), size, Math.round(size / 4));
    ctx.fillStyle = shade(base, 0.12);
    ctx.fillRect(x, y + size - Math.round(size / 4), size, 2);
    return;
  }

  if (view.terrain === "water") {
    ctx.fillStyle = shade(base, 0.14);
    ctx.fillRect(x + size * 0.15, y + size * 0.35, size * 0.3, 2);
    ctx.fillRect(x + size * 0.55, y + size * 0.62, size * 0.28, 2);
    return;
  }

  // 木は幹を見せる。1マス1色だと「緑の四角」でしかない
  if (view.hint === "T") {
    ctx.fillStyle = shade(base, -0.3);
    ctx.fillRect(x + size / 2 - 2, y + size * 0.62, 4, size * 0.34);
    ctx.fillStyle = shade(base, 0.13);
    ctx.beginPath();
    ctx.arc(x + size * 0.36, y + size * 0.36, Math.max(2, size / 9), 0, Math.PI * 2);
    ctx.fill();
  }
}
