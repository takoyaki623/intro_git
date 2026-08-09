// キー入力。ゲーム側は物理キーではなく論理ボタン（A/B/UP…）だけを見る。
// 押しっぱなし判定・押した瞬間判定・メニュー用のリピートを提供する。

export const BTN = {
  UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT',
  A: 'A', B: 'B', START: 'START', RUN: 'RUN',
};

const MAP = {
  ArrowUp: BTN.UP, KeyW: BTN.UP,
  ArrowDown: BTN.DOWN, KeyS: BTN.DOWN,
  ArrowLeft: BTN.LEFT, KeyA: BTN.LEFT,
  ArrowRight: BTN.RIGHT, KeyD: BTN.RIGHT,
  KeyZ: BTN.A, Enter: BTN.A, Space: BTN.A,
  KeyX: BTN.B, Backspace: BTN.B, Escape: BTN.B,
  KeyC: BTN.START, Tab: BTN.START,
  ShiftLeft: BTN.RUN, ShiftRight: BTN.RUN,
};

// メニューのカーソル移動用リピート（本家と同じく最初だけ長めに待つ）
const REPEAT_DELAY = 16;
const REPEAT_RATE = 6;

const held = new Set();
const pressed = new Set();   // このフレームで押された
const released = new Set();  // このフレームで離された
const heldFrames = new Map();

let queuedDown = new Set();
let queuedUp = new Set();

export function init() {
  addEventListener('keydown', (e) => {
    const b = MAP[e.code];
    if (!b) return;
    e.preventDefault();
    if (!e.repeat) queuedDown.add(b);
  });

  addEventListener('keyup', (e) => {
    const b = MAP[e.code];
    if (!b) return;
    e.preventDefault();
    queuedUp.add(b);
  });

  // ウィンドウのフォーカスが外れたら全部離す（押しっぱなし事故の防止）
  addEventListener('blur', () => {
    for (const b of held) queuedUp.add(b);
  });

  initTouch();
}

/** ループの update 冒頭で1回だけ呼ぶ */
export function update() {
  pressed.clear();
  released.clear();

  for (const b of queuedDown) {
    if (!held.has(b)) {
      held.add(b);
      pressed.add(b);
      heldFrames.set(b, 0);
    }
  }
  for (const b of queuedUp) {
    if (held.has(b)) {
      held.delete(b);
      released.add(b);
      heldFrames.delete(b);
    }
  }
  queuedDown.clear();
  queuedUp.clear();

  for (const b of held) heldFrames.set(b, heldFrames.get(b) + 1);
}

export const isDown = (b) => held.has(b);
export const justPressed = (b) => pressed.has(b);
export const justReleased = (b) => released.has(b);

/** 押した瞬間 + 長押し中の一定間隔で true。メニューのカーソル用。 */
export function repeated(b) {
  if (pressed.has(b)) return true;
  const f = heldFrames.get(b);
  if (f === undefined || f < REPEAT_DELAY) return false;
  return (f - REPEAT_DELAY) % REPEAT_RATE === 0;
}

/** 今押されている方向をひとつ返す（同時押しは上下優先） */
export function heldDir() {
  if (held.has(BTN.UP)) return 'up';
  if (held.has(BTN.DOWN)) return 'down';
  if (held.has(BTN.LEFT)) return 'left';
  if (held.has(BTN.RIGHT)) return 'right';
  return null;
}

/** 入力状態を全部落とす。シーン切り替え直後の誤爆防止に使う。 */
export function clearAll() {
  held.clear();
  pressed.clear();
  released.clear();
  heldFrames.clear();
  queuedDown.clear();
  queuedUp.clear();
  for (const el of document.querySelectorAll('#touch button.on')) el.classList.remove('on');
}

// ---- タッチ操作 ----
// DOM のボタンから同じ論理ボタンを叩くだけ。ゲーム側はタッチを意識しない。
function initTouch() {
  const root = document.getElementById('touch');
  if (!root) return;

  const coarse = matchMedia('(pointer: coarse)').matches;
  if (!coarse) return;
  root.hidden = false;

  for (const el of root.querySelectorAll('button')) {
    const b = MAP[el.dataset.key];
    if (!b) continue;

    const down = (e) => { e.preventDefault(); queuedDown.add(b); el.classList.add('on'); };
    const up = (e) => { e.preventDefault(); queuedUp.add(b); el.classList.remove('on'); };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
