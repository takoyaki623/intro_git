// 入力。ゲーム側は物理キーやタッチではなく論理ボタン（A/B/UP…）だけを見る。
// 押しっぱなし判定・押した瞬間判定・メニュー用のリピートを提供する。

import * as Screen from './screen.js';

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
    // キーを叩いたということは、この人はいまキーボードで遊んでいる
    Screen.setTouchMode(false);
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

  // 画面を指で触ったらタッチ操作モードへ。
  // タッチ対応のノートPCは pointer:coarse にならないので、これが無いと
  // 指で触れるのにパッドが出てこない。
  addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && Screen.hasTouch()) Screen.setTouchMode(true);
  }, { capture: true });

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

/**
 * 「押した瞬間」だけを捨てる。シーン切り替え直後の誤爆防止に使う。
 *
 * 押しっぱなしの状態（held）は残す。ここで held まで消すと、
 * 方向キーを押したままドアを通ったときに歩行が止まってしまう
 * ―― キーは物理的に押されたままなので、次の keydown が飛んでこない。
 */
export function clearEdges() {
  pressed.clear();
  released.clear();
  queuedDown.clear();
  queuedUp.clear();
}

/** 入力状態を完全に落とす。ゲームを最初から始めるときなど。 */
export function clearAll() {
  clearEdges();
  held.clear();
  heldFrames.clear();
  for (const el of document.querySelectorAll('#touch .on')) el.classList.remove('on');
}

// ---- タッチ操作 ----
// DOM から同じ論理ボタンを叩くだけ。ゲーム側はタッチを意識しない。
// 表示・非表示は screen.js が body.touch で管理する。

/** 十字キーの中心付近は無反応にする（0..1、半径の割合） */
const DPAD_DEADZONE = 0.26;

function initTouch() {
  const root = document.getElementById('touch');
  if (!root) return;

  root.addEventListener('contextmenu', (e) => e.preventDefault());
  initDpad(document.getElementById('dpad'));

  for (const el of root.querySelectorAll('.rb')) {
    initButton(el, MAP[el.dataset.key]);
  }
}

/** A/B ボタン。指を離す前にボタンの外へ出ても押しっぱなしにならないよう捕捉する。 */
function initButton(el, btn) {
  if (!btn) return;

  const press = (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    queuedDown.add(btn);
    el.classList.add('on');
  };
  const release = (e) => {
    e.preventDefault();
    queuedUp.add(btn);
    el.classList.remove('on');
  };

  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
}

/**
 * 十字キー。
 *
 * 方向ごとに独立した button にすると、↑ から ← へ指を滑らせても
 * pointerdown が飛ばないので反応しない ―― 指は下りたままだからだ。
 * そこで十字キー全体をひとつの判定領域にして、指の「位置」から方向を決める。
 * こうすると滑らせるだけで方向を変えられる。
 */
function initDpad(pad) {
  if (!pad) return;

  const visuals = {
    up: pad.querySelector('.up'),
    down: pad.querySelector('.down'),
    left: pad.querySelector('.left'),
    right: pad.querySelector('.right'),
  };
  const DIR_BTN = { up: BTN.UP, down: BTN.DOWN, left: BTN.LEFT, right: BTN.RIGHT };

  let active = null;      // 今押していることになっている方向
  let pointerId = null;

  const dirAt = (e) => {
    const r = pad.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    if (Math.abs(dx) < DPAD_DEADZONE && Math.abs(dy) < DPAD_DEADZONE) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  };

  const setDir = (dir) => {
    if (dir === active) return;
    if (active) {
      queuedUp.add(DIR_BTN[active]);
      visuals[active]?.classList.remove('on');
    }
    active = dir;
    if (active) {
      queuedDown.add(DIR_BTN[active]);
      visuals[active]?.classList.add('on');
    }
  };

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointerId = e.pointerId;
    pad.setPointerCapture?.(e.pointerId);
    setDir(dirAt(e));
  });

  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    setDir(dirAt(e));
  });

  const end = (e) => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    pointerId = null;
    setDir(null);
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
}
