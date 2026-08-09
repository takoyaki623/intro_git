// メッセージ枠。1文字ずつ出して、A で送る。
//
// バトルもフィールドも会話もこれ1つで賄う。
// 「今のページを出し切ったか」「送り待ちか」を外から問い合わせられるようにして、
// バトルのジェネレータが yield したメッセージを待てるようにする。

import { drawText, wrapText, LINE_H } from './font.js';
import { drawWindow, drawArrowDown, COL } from './ui.js';
import { SE } from '../core/audio.js';

const PAD_X = 8;
const PAD_Y = 7;

export class TextBox {
  constructor(opt = {}) {
    this.x = opt.x ?? 4;
    this.y = opt.y ?? 148;
    this.w = opt.w ?? 248;
    this.h = opt.h ?? 40;
    this.lines = opt.lines ?? 2;
    this.speed = opt.speed ?? 2; // 何フレームで1文字

    this.pages = [];
    this.page = 0;
    this.shown = 0;   // 現在ページで表示済みの文字数
    this.timer = 0;
    this.blink = 0;
    this.waiting = false; // ページを出し切って送り待ち
    this.done = true;
    this.autoAdvance = false;
  }

  get innerW() { return this.w - PAD_X * 2; }

  /** 新しい文章をセットする。改行と折り返しを解決してページに割る。 */
  setText(text, opt = {}) {
    const all = wrapText(String(text), this.innerW);
    this.pages = [];
    for (let i = 0; i < all.length; i += this.lines) {
      this.pages.push(all.slice(i, i + this.lines));
    }
    if (!this.pages.length) this.pages = [['']];
    this.page = 0;
    this.shown = 0;
    this.timer = 0;
    this.waiting = false;
    this.done = false;
    this.autoAdvance = opt.autoAdvance ?? false;
    return this;
  }

  get currentPage() { return this.pages[this.page] ?? []; }

  get pageLength() {
    return this.currentPage.reduce((n, l) => n + l.length, 0);
  }

  /** 今のページを一気に出し切る */
  skip() {
    this.shown = this.pageLength;
  }

  /**
   * 1フレーム進める。
   * fast: A 押しっぱなしで倍速
   * 戻り値 true = このフレームで全ページ出し切った
   */
  update(fast = false) {
    this.blink = (this.blink + 1) % 60;
    if (this.done) return false;

    if (this.shown < this.pageLength) {
      this.timer++;
      const need = fast ? 1 : this.speed;
      if (this.timer >= need) {
        this.timer = 0;
        this.shown++;
        // 全文字で鳴らすとうるさいので間引く
        if (this.shown % 3 === 0) SE.text();
      }
      return false;
    }

    this.waiting = true;
    return false;
  }

  /** A が押されたときに呼ぶ。戻り値 true = もう次はない（会話終了） */
  advance() {
    if (this.done) return true;

    if (this.shown < this.pageLength) {
      this.skip();
      return false;
    }
    if (this.page < this.pages.length - 1) {
      this.page++;
      this.shown = 0;
      this.timer = 0;
      this.waiting = false;
      return false;
    }
    this.done = true;
    this.waiting = false;
    return true;
  }

  render(ctx, opt = {}) {
    const { frame = true } = opt;
    if (frame) drawWindow(ctx, this.x, this.y, this.w, this.h);

    let left = this.shown;
    const page = this.currentPage;
    for (let i = 0; i < page.length; i++) {
      const line = page[i];
      const n = Math.max(0, Math.min(line.length, left));
      if (n > 0) {
        drawText(ctx, line.slice(0, n), this.x + PAD_X, this.y + PAD_Y + i * LINE_H, { color: COL.ink });
      }
      left -= line.length;
      if (left <= 0) break;
    }

    // 送り待ちの▼（点滅）
    if (this.waiting && !this.done && this.blink < 34) {
      drawArrowDown(ctx, this.x + this.w - 14, this.y + this.h - 10, COL.ink);
    }
  }
}
