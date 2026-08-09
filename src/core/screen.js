// 基準解像度と、それを整数倍で画面に合わせる処理。
// 半端な拡大率はドット絵をにじませるので、必ず整数倍にする。

export const W = 256;
export const H = 192;
export const TILE = 16;

let canvas = null;
let ctx = null;
let scale = 1;

export function init(el) {
  canvas = el;
  canvas.width = W;
  canvas.height = H;
  ctx = canvas.getContext('2d', { alpha: false });
  resize();
  addEventListener('resize', resize);
  return ctx;
}

export function getContext() {
  return ctx;
}

export function getScale() {
  return scale;
}

function resize() {
  // 画面に収まる最大の整数倍。最低でも2倍は確保する（1倍だと日本語が読めない）。
  const fit = Math.min(innerWidth / W, innerHeight / H);
  scale = Math.max(1, Math.floor(fit));
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
  // imageSmoothingEnabled はコンテキストの状態がリセットされると戻るので都度張り直す
  ctx.imageSmoothingEnabled = false;
}

/** 画面全体を1色で塗る */
export function clear(color = '#000') {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
}
