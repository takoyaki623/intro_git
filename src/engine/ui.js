// ウィンドウ枠・HPバー・EXPバーなど、画面共通の部品。

import { drawText, drawTextRight, textWidth } from './font.js';

export const COL = {
  ink: '#303030',
  inkLight: '#707070',
  paper: '#f8f8f0',
  shadow: '#a8a8a0',
  border: '#404058',
  hpHigh: '#4ad14a',
  hpMid: '#f0c02a',
  hpLow: '#e04030',
  exp: '#3aa0f0',
  barBack: '#484858',
  select: '#e04030',
};

/**
 * 本家風のウィンドウ枠。
 * 外に濃い枠、内側に白、右下に影。角は1px落として丸く見せる。
 */
export function drawWindow(ctx, x, y, w, h, opt = {}) {
  const { fill = COL.paper, border = COL.border, shadow = true } = opt;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);

  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 2, y + 2, w, h);
  }

  ctx.fillStyle = border;
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);

  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 1, w - 4, h - 2);
  ctx.fillRect(x + 1, y + 2, w - 2, h - 4);
}

/** 選択中の項目を指すカーソル（▶）。点滅はしない。 */
export function drawCursor(ctx, x, y, color = COL.ink) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = color;
  // 縦7px の三角形を1列ずつ細くしていく
  for (let i = 0; i < 4; i++) ctx.fillRect(x + i, y + i, 1, 7 - i * 2);
}

/** メッセージ送りの▼。呼ぶ側で点滅を制御する。 */
export function drawArrowDown(ctx, x, y, color = COL.ink) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = color;
  for (let i = 0; i < 4; i++) ctx.fillRect(x + i, y + i, 7 - i * 2, 1);
}

export function hpColor(cur, max) {
  const r = max > 0 ? cur / max : 0;
  if (r > 0.5) return COL.hpHigh;
  if (r > 0.2) return COL.hpMid;
  return COL.hpLow;
}

/**
 * HPバー。ratio は 0..1。
 * 残量が 1px 未満でも 0 でなければ 1px 残す（「まだ生きている」を見せるため）。
 */
export function drawBar(ctx, x, y, w, ratio, color, opt = {}) {
  const { h = 3, back = COL.barBack, frame = true } = opt;
  x = Math.round(x); y = Math.round(y);

  if (frame) {
    ctx.fillStyle = COL.ink;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  }
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);

  const fill = ratio <= 0 ? 0 : Math.max(1, Math.round(w * Math.min(1, ratio)));
  ctx.fillStyle = color;
  ctx.fillRect(x, y, fill, h);
}

/** 「HP」ラベル付きのバー */
export function drawHpBar(ctx, x, y, cur, max) {
  drawText(ctx, 'HP', x, y - 4, { color: '#f0a020' });
  drawBar(ctx, x + 16, y, 48, max > 0 ? cur / max : 0, hpColor(cur, max));
}

/** 数値の HP 表示（右揃え・「 21/ 34」の形） */
export function drawHpText(ctx, right, y, cur, max) {
  const s = `${String(Math.max(0, Math.round(cur))).padStart(3, ' ')}/${String(max).padStart(3, ' ')}`;
  drawTextRight(ctx, s, right, y, { color: COL.ink });
}

/** ラベル付きの一行（左にラベル、右に値） */
export function drawRow(ctx, label, value, x, y, w, opt = {}) {
  drawText(ctx, label, x, y, opt);
  drawTextRight(ctx, String(value), x + w, y, opt);
}

/** 画面全体を色で覆う（フェード用） */
export function fillScreen(ctx, color, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** タイプ名の小さなラベル */
export function drawTypeTag(ctx, type, color, x, y) {
  const w = textWidth(type) + 6;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y) - 1, w, 11);
  drawText(ctx, type, x + 3, y, { color: '#ffffff', shadow: 'rgba(0,0,0,0.45)' });
  return w;
}
