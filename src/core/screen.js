// 基準解像度と、それを画面に合わせる処理。
//
// 拡大率は「整数倍」が基本。等倍が 1 デバイスピクセルに対応する画面では、
// 半端な倍率にすると 1ドットの幅が場所によって変わり、ドット絵が濁る。
//
// ただし整数倍を貫くと 256 の倍数は 256/512 しかなく、幅 390px の端末では
// 1倍＝画面の 66% という豆粒サイズに落ちてしまう。
// そこで「整数倍にすると大きく余る」かつ「高精細な画面」のときだけ、
// 箱いっぱいまで引き伸ばす。devicePixelRatio が 2 以上あれば
// 1ドットあたりの誤差はデバイスピクセル 0.5 未満で、肉眼では見えない。
//
// 判断の材料は画面そのものであって、操作方法ではない。
// スマホにキーボードを繋いで操作パッドが消えても、画面の小ささは変わらない。

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

  // タッチ操作モードかどうかでレイアウトが変わる。CSS 側の分岐もこのクラスで行う。
  const coarse = matchMedia('(pointer: coarse)');
  setTouchMode(coarse.matches);
  coarse.addEventListener?.('change', (e) => setTouchMode(e.matches));

  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 100));
  // アドレスバーの出入りは resize が飛ばないことがある
  visualViewport?.addEventListener('resize', resize);
  return ctx;
}

/** この端末がそもそも指で触れるか */
export const hasTouch = () =>
  navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;

export const isTouch = () => document.body.classList.contains('touch');

/**
 * 操作パッドの表示を切り替える。
 *
 * 端末の種類ではなく「直前に何で操作したか」で決める。
 * タッチ対応のノートPCは pointer:coarse にならないのでパッドが出ないし、
 * スマホにキーボードを繋ぐと逆にパッドが邪魔になる。
 * 画面を触ったら出す、キーを叩いたら引っ込める ―― これなら両方に付いていける。
 */
export function setTouchMode(on) {
  if (on === isTouch()) return;         // 変化がないときは触らない（レイアウトの揺れ防止）
  document.body.classList.toggle('touch', on);
  const t = document.getElementById('touch');
  if (t) t.hidden = !on;
  resize();
}

export function getContext() {
  return ctx;
}

export function getScale() {
  return scale;
}

/** 整数倍がこの割合以上を埋められるなら、整数倍を優先する */
const INTEGER_EFFICIENCY = 0.8;

function resize() {
  // #stage の実寸を測る。操作パッドのぶんはすでに CSS で除いてある。
  const box = stage.getBoundingClientRect();
  const availW = Math.max(1, box.width);
  const availH = Math.max(1, box.height);
  const fit = Math.min(availW / W, availH / H);

  const integer = Math.max(1, Math.floor(fit));
  // 低精細な画面では半端な倍率が目に見えて汚いので、常に整数倍
  const canStretch = devicePixelRatio >= 2;
  // 整数倍にすると 2割以上を余らせてしまうときだけ引き伸ばす
  const wasteful = integer / fit < INTEGER_EFFICIENCY;
  scale = canStretch && wasteful ? fit : integer;

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
