// カーソルで選ぶメニュー。縦1列でも格子でも使える。
// スクロールが要る長いリスト（バッグ・ボックス）もこれで賄う。

import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { SE } from '../core/audio.js';
import { drawText, LINE_H } from './font.js';
import { drawCursor, COL } from './ui.js';

export class Menu {
  /**
   * items : 文字列か { label, disabled?, ... } の配列
   * cols  : 列数（2 にすると 2x2 のコマンド枠になる）
   * rows  : 一度に見せる行数（超えるとスクロール）
   */
  constructor(items, opt = {}) {
    this.setItems(items);
    this.cols = opt.cols ?? 1;
    this.rows = opt.rows ?? Infinity;
    this.x = opt.x ?? 0;
    this.y = opt.y ?? 0;
    this.lineH = opt.lineH ?? LINE_H;
    this.colW = opt.colW ?? 64;
    this.wrap = opt.wrap ?? true;
    this.index = opt.index ?? 0;
    this.scroll = 0;
    this.onCancel = opt.onCancel ?? null;
  }

  setItems(items) {
    this.items = items.map((it) => (typeof it === 'string' ? { label: it } : it));
    this.index = 0;
    this.scroll = 0;
    return this;
  }

  get current() { return this.items[this.index]; }
  get rowCount() { return Math.ceil(this.items.length / this.cols); }
  get visibleRows() { return Math.min(this.rows, this.rowCount); }

  move(d) {
    const n = this.items.length;
    if (!n) return;
    let i = this.index + d;
    if (this.wrap) {
      i = ((i % n) + n) % n;
    } else {
      i = Math.max(0, Math.min(n - 1, i));
    }
    this.index = i;
    this.clampScroll();
  }

  clampScroll() {
    if (this.rows === Infinity) return;
    const row = Math.floor(this.index / this.cols);
    if (row < this.scroll) this.scroll = row;
    if (row >= this.scroll + this.rows) this.scroll = row - this.rows + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, this.rowCount - this.rows)));
  }

  /**
   * 入力を処理する。
   * 戻り値: { type:'select', index, item } / { type:'cancel' } / null
   */
  update() {
    const before = this.index;
    if (Input.repeated(BTN.UP)) this.move(-this.cols);
    if (Input.repeated(BTN.DOWN)) this.move(this.cols);
    if (this.cols > 1) {
      if (Input.repeated(BTN.LEFT)) this.move(-1);
      if (Input.repeated(BTN.RIGHT)) this.move(1);
    }
    if (this.index !== before) SE.cursor();

    if (Input.justPressed(BTN.A)) {
      const item = this.current;
      if (item && !item.disabled) {
        SE.select();
        return { type: 'select', index: this.index, item };
      }
      SE.cancel();
      return null;
    }
    if (Input.justPressed(BTN.B)) {
      SE.cancel();
      return { type: 'cancel' };
    }
    return null;
  }

  render(ctx, opt = {}) {
    const { color = COL.ink, disabledColor = COL.inkLight, cursor = true } = opt;
    const start = this.scroll * this.cols;
    const end = Math.min(this.items.length, start + this.visibleRows * this.cols);

    for (let i = start; i < end; i++) {
      const it = this.items[i];
      const r = Math.floor(i / this.cols) - this.scroll;
      const c = i % this.cols;
      const px = this.x + c * this.colW;
      const py = this.y + r * this.lineH;

      if (cursor && i === this.index) drawCursor(ctx, px, py + 2, COL.ink);
      drawText(ctx, it.label, px + 9, py, { color: it.disabled ? disabledColor : color });
      it.render?.(ctx, px, py, i === this.index);
    }

    // スクロールが残っていることを示す小さな▲▼
    if (this.rows !== Infinity && this.rowCount > this.rows) {
      const rx = this.x + this.cols * this.colW - 6;
      ctx.fillStyle = COL.ink;
      if (this.scroll > 0) {
        for (let i = 0; i < 3; i++) ctx.fillRect(rx + 2 - i, this.y - 4 + i, 1 + i * 2, 1);
      }
      if (this.scroll + this.rows < this.rowCount) {
        const by = this.y + this.visibleRows * this.lineH + 1;
        for (let i = 0; i < 3; i++) ctx.fillRect(rx + i, by + i, 5 - i * 2, 1);
      }
    }
  }
}
