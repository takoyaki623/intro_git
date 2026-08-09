// 基準解像度と、それを画面に合わせる処理。
//
// PC は整数倍だけを使う。等倍が 1 デバイスピクセルに対応するので、
// 半端な倍率にすると 1ドットの幅が場所によって変わってドット絵が濁る。
//
// スマホは事情が違う。256 の整数倍は 256/512 しかなく、幅 390px の端末では
// 1倍（画面の 66%）に落ちてしまい、まったく遊べる大きさにならない。
// ただしスマホは devicePixelRatio が 2〜3 あるので、半端な倍率でも
// 1ドットあたりの誤差はデバイスピクセル 0.5 未満 ―― 肉眼では見えない。
// そこでタッチ端末では箱いっぱいまで引き伸ばす。

export const W = 256;
export const H = 192;
export const TILE = 16;

let canvas = null;
let stage = null;
let ctx = null;
let scale = 1;

export function init(el) {
  canvas = el;
  stage = el.parentElement ?? document.body;
  canvas.width = W;
  canvas.height = H;
  ctx = canvas.getContext('2d', { alpha: false });

  // タッチ端末かどうかでレイアウトが変わる。CSS 側の分岐もこのクラスで行う。
  const coarse = matchMedia('(pointer: coarse)');
  applyTouchClass(coarse.matches);
  coarse.addEventListener?.('change', (e) => { applyTouchClass(e.matches); resize(); });

  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 100));
  // アドレスバーの出入りは resize が飛ばないことがある
  visualViewport?.addEventListener('resize', resize);
  return ctx;
}

function applyTouchClass(on) {
  document.body.classList.toggle('touch', on);
  const t = document.getElementById('touch');
  if (t) t.hidden = !on;
}

export const isTouch = () => document.body.classList.contains('touch');

export function getContext() {
  return ctx;
}

export function getScale() {
  return scale;
}

function resize() {
  // #stage の実寸を測る。操作パッドのぶんはすでに CSS で除いてある。
  const box = stage.getBoundingClientRect();
  const availW = Math.max(1, box.width);
  const availH = Math.max(1, box.height);
  const fit = Math.min(availW / W, availH / H);

  // タッチ端末は箱いっぱい、PC は整数倍
  scale = isTouch() ? fit : Math.max(1, Math.floor(fit));

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
