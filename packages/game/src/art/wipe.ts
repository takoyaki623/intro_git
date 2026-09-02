/**
 * 画面の切り替わり（v1.3-g）。
 *
 * 原作は、場面が変わるときに**必ず何かを挟む**。扉をくぐれば暗転し、
 * 野生が出れば縞が閉じ、トレーナーに見つかれば光ってから閉じる。
 * こちらは v1.3-a で 240×160 の器を作ったのに、**中身が瞬間で入れ替わっていた**
 * ―― 一瞬で別の絵になるので、どこへ移ったのかが目で追えない。
 *
 * ## 覆いを「画面の外」に置いている理由
 *
 * 「操作するものは画面の外、見せるものは画面の中」がこの版の線なので、
 * 演出は本来 `.screen` の中に置くべきもの。**ここだけ例外**にしてある。
 *
 * 覆いの役目は**マップの画面とバトルの画面の入れ替わりを隠すこと**で、
 * その2枚は別々の `.screen` として存在し、片方が消えて片方が出る。
 * 中に置くと、入れ替えの瞬間に覆いごと消えて**そこだけ素が見える。**
 * だから覆いは1枚だけ外に持ち、**そのとき見えている `.screen` に重ねる。**
 *
 * ## 結果に触れない
 *
 * `art/effects.ts` と同じ約束で、演出は結果を1つも変えない。
 * `motionOn()` が偽（高速モード・ログのみ・`prefers-reduced-motion`）なら
 * **覆いを1枚も描かずに入れ替えだけ済ませる。**
 */

import { motionOn } from "./effects.js";

/** 画面の論理サイズ（`screen.ts` の 240×160）。 */
const W = 240;
const H = 160;

/** 切り替わりの種類。**どこから来たかではなく、何が起きたかで選ぶ。** */
export type Wipe = "door" | "wild" | "trainer";

/** 閉じるのにかける時間。開くのはその半分 ―― 原作も戻りのほうが速い。 */
const CLOSING: Record<Wipe, number> = { door: 260, wild: 620, trainer: 760 };

/** トレーナー戦で、光っている区間の割合。残りが閉じる区間。 */
const FLASH_PART = 0.4;

let cover: HTMLCanvasElement | null = null;
let covered = false;

function canvas(): HTMLCanvasElement {
  if (cover !== null) return cover;
  const el = document.createElement("canvas");
  el.id = "screen-wipe";
  el.width = W;
  el.height = H;
  // **CSS には書かない。** 位置は毎フレーム測って入れるので、
  // 見た目の決め所が2箇所に分かれると片方だけ直した跡が残る
  Object.assign(el.style, {
    position: "fixed",
    zIndex: "60",
    pointerEvents: "none",
    imageRendering: "pixelated",
    display: "none",
  });
  document.body.append(el);
  cover = el;
  return el;
}

/**
 * いま見えている画面。**「最初の `.screen`」ではない。**
 *
 * マップとバトルで2枚あり、隠れているほうは大きさが 0 になる
 * （`display: none` の親の中にいるため）。それで見分ける。
 */
function visibleScreen(): DOMRect | null {
  for (const el of document.querySelectorAll<HTMLElement>(".screen")) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
}

/** 見えている画面にぴったり重ねる。画面が入れ替わると位置も大きさも変わる。 */
function stick(): boolean {
  const rect = visibleScreen();
  const el = canvas();
  if (rect === null) {
    el.style.display = "none";
    return false;
  }
  Object.assign(el.style, {
    display: "block",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  return true;
}

/** 進み具合 `p`（0 = 素通し、1 = 覆い切り）を1枚描く。 */
function paint(kind: Wipe, p: number): void {
  const ctx = canvas().getContext("2d");
  if (ctx === null) return;
  ctx.clearRect(0, 0, W, H);

  if (kind === "door") {
    // 扉は暗転。**縞や光を使わない** ―― 建物の出入りは1日に何十回もある
    ctx.fillStyle = `rgba(0,0,0,${p})`;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  if (kind === "wild") {
    // 横縞が左右から交互に閉じる。1段おきに向きを変えると、
    // **まっすぐ落ちてくる幕には見えず**、草むらから何か来た感じになる
    const rows = 8;
    const h = H / rows;
    const w = W * p;
    ctx.fillStyle = "#000";
    for (let i = 0; i < rows; i += 1) {
      if (i % 2 === 0) ctx.fillRect(0, i * h, w, h);
      else ctx.fillRect(W - w, i * h, w, h);
    }
    return;
  }

  // トレーナーは**光ってから閉じる。** 見つかった側の驚きが先に来る
  if (p < FLASH_PART) {
    const step = Math.floor(p / (FLASH_PART / 6));
    if (step % 2 === 0) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
    }
    return;
  }
  const q = (p - FLASH_PART) / (1 - FLASH_PART);
  const h = Math.ceil((H / 2) * q);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, h);
  ctx.fillRect(0, H - h, W, h);
}

/**
 * 開くときの進み具合。**閉じたのと同じ形を逆に辿る。**
 *
 * トレーナーだけは光の区間を飛ばす ―― 戻ってきたところで光っても、
 * 何が起きたのか分からない。
 */
const revealAt = (kind: Wipe, t: number): number =>
  kind === "trainer" ? FLASH_PART + (1 - t) * (1 - FLASH_PART) : 1 - t;

function animate(ms: number, at: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      stick();
      at(t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

/**
 * 画面を覆い、その裏で入れ替え、また開ける。
 *
 * **入り口を1つにしてある。** 閉じると開けるを別々に呼べるようにすると、
 * 片方だけ呼んだ道が必ず出て、**黒いままの画面**が残る。
 * ここを通れば、`swap` が投げても `finally` で必ず開く。
 */
export async function wipeThrough(kind: Wipe, swap: () => void | Promise<void>): Promise<void> {
  if (!motionOn() || !stick()) {
    await swap();
    return;
  }
  covered = true;
  try {
    await animate(CLOSING[kind], (t) => paint(kind, t));
    await swap();
    // 入れ替えで画面が変わっているので、開ける前に貼り直す
    stick();
    paint(kind, 1);
    await animate(CLOSING[kind] / 2, (t) => paint(kind, revealAt(kind, t)));
  } finally {
    covered = false;
    canvas().style.display = "none";
  }
}

/**
 * 覆ったままにする（バトルへの入り）。
 *
 * バトルは `runBattle` の中で画面が出るので、`wipeThrough` の形に収まらない。
 * **閉じるのはここ、開けるのは画面が出た側**（`reveal`）に分かれる。
 * 分かれている以上、開け忘れが起こりうる ―― `reveal` を呼ぶ側ではなく、
 * ここが**時間で保険を掛ける**（真っ黒のまま操作不能になるほうが重い）。
 */
export async function wipeShut(kind: Wipe): Promise<void> {
  if (!motionOn() || !stick()) return;
  covered = true;
  await animate(CLOSING[kind], (t) => paint(kind, t));
  const mine = kind;
  setTimeout(() => {
    if (covered) void reveal(mine);
  }, 4000);
}

/**
 * 覆っていたら開ける。**覆っていなければ何もしない。**
 *
 * フリーバトルやカップは覆わずに画面を出すので、そこでは素通りする ――
 * 呼ぶ側が「今どちらか」を知らなくてよいのが要点。
 */
export async function reveal(kind: Wipe = "door"): Promise<void> {
  if (!covered) return;
  covered = false;
  stick();
  paint(kind, 1);
  await animate(CLOSING[kind] / 2, (t) => paint(kind, revealAt(kind, t)));
  canvas().style.display = "none";
}
