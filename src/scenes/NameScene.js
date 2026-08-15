import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { SE } from '../core/audio.js';
import { drawText, drawTextCentered, preload } from '../engine/font.js';
import { drawWindow, drawCursor, COL } from '../engine/ui.js';
import { draw as drawSprite } from '../engine/pixelArt.js';

const W = Screen.W;
const H = Screen.H;

// 10列 × 8行。5文字ずつ2かたまりに割って、あ行・か行… の区切りが目で追える並びにする。
// 12列に流し込むと「あいうえおかきくけこさし」のように行の途中で行が変わってしまい、
// 探すのに毎回 端から読む羽目になる。
// 半端な空きは全角スペースで埋めて、行の長さを揃える（描画も入力もこれで単純になる）。
const PAGES = {
  かな: [
    'あいうえお　かきくけこ',
    'さしすせそ　たちつてと',
    'なにぬねの　はひふへほ',
    'まみむめも　や　ゆ　よ',
    'らりるれろ　わをん　　',
    'がぎぐげご　ざじずぜぞ',
    'だぢづでど　ばびぶべぼ',
    'ぱぴぷぺぽ　ゃゅょっー',
  ],
  カナ: [
    'アイウエオ　カキクケコ',
    'サシスセソ　タチツテト',
    'ナニヌネノ　ハヒフヘホ',
    'マミムメモ　ヤ　ユ　ヨ',
    'ラリルレロ　ワヲン　　',
    'ガギグゲゴ　ザジズゼゾ',
    'ダヂヅデド　バビブベボ',
    'パピプペポ　ャュョッー',
  ],
  英数: [
    'ＡＢＣＤＥ　ＦＧＨＩＪ',
    'ＫＬＭＮＯ　ＰＱＲＳＴ',
    'ＵＶＷＸＹ　Ｚ　　　　',
    'ａｂｃｄｅ　ｆｇｈｉｊ',
    'ｋｌｍｎｏ　ｐｑｒｓｔ',
    'ｕｖｗｘｙ　ｚ　　　　',
    '０１２３４　５６７８９',
    '！？・ー　　　　　　　',
  ],
};

const PAGE_NAMES = Object.keys(PAGES);
const COLS = 10;
const ROWS = 8;
const CELL_W = 21;
const CELL_H = 15;
const GROUP_GAP = 14;  // 5文字ごとに空ける幅。かたまりが目で見えるようにする。
const GRID_X = 12;
const GRID_Y = 44;
const BUTTON_Y = 170;

/** 列の描画位置。5列目から先はひとかたまりぶん右へずらす。 */
const colX = (c) => GRID_X + c * CELL_W + (c >= 5 ? GROUP_GAP : 0);

/** 列番号 → 文字列の添え字。5列目と6列目のあいだに区切りの1文字が入っている。 */
const srcIndex = (c) => (c < 5 ? c : c + 1);

/**
 * なまえを つける画面。
 *
 *   new NameScene({ title:'あなたの なまえは？', initial:'サトシ', max:5,
 *                   sprite: <ドット絵>, onDone(name) })
 *
 * B は1文字消す（キャンセルではない）。やめるときは「やめる」を選ぶ。
 * 決まった名前は onDone に渡し、キャンセルなら null を渡す。
 */
export class NameScene {
  constructor({ title = 'なまえを いれてね', initial = '', max = 5, sprite = null, onDone = null } = {}) {
    this.title = title;
    this.max = max;
    this.sprite = sprite;
    this.onDone = onDone;
    this.text = String(initial).slice(0, max);
    this.page = 0;
    this.row = 0;
    this.col = 0;
    this.blink = 0;

    // この画面でしか出てこない字がある。先に焼いておかないと1フレーム欠ける。
    preload(Object.values(PAGES).flat().join(''));
  }

  enter() { Input.clearEdges(); }

  get chars() { return PAGES[PAGE_NAMES[this.page]]; }
  /** row === ROWS のときは下のボタン列にいる */
  get onButtons() { return this.row === ROWS; }

  charAt(row, col) {
    const ch = this.chars[row]?.[srcIndex(col)] ?? '　';
    return ch === '　' ? null : ch;
  }

  update() {
    this.blink++;

    if (Input.repeated(BTN.UP)) this.move(0, -1);
    if (Input.repeated(BTN.DOWN)) this.move(0, 1);
    if (Input.repeated(BTN.LEFT)) this.move(-1, 0);
    if (Input.repeated(BTN.RIGHT)) this.move(1, 0);

    if (Input.justPressed(BTN.B)) { this.backspace(); return; }
    if (Input.justPressed(BTN.START)) { this.finish(); return; }
    if (Input.justPressed(BTN.A)) this.press();
  }

  move(dx, dy) {
    const before = `${this.row},${this.col}`;

    if (dy) {
      this.row += dy;
      if (this.row < 0) this.row = ROWS;
      if (this.row > ROWS) this.row = 0;
      // ボタン列は3つしかないので、列位置を畳んでおく
      if (this.onButtons) this.col = Math.min(2, Math.floor(this.col / 4));
      else if (before.startsWith(String(ROWS))) this.col = Math.min(COLS - 1, this.col * 4 + 1);
    }
    if (dx) {
      const n = this.onButtons ? 3 : COLS;
      this.col = (this.col + dx + n) % n;
    }
    if (`${this.row},${this.col}` !== before) SE.cursor();
  }

  press() {
    if (this.onButtons) {
      if (this.col === 0) {
        this.page = (this.page + 1) % PAGE_NAMES.length;
        SE.select();
        return;
      }
      if (this.col === 1) { this.backspace(); return; }
      this.finish();
      return;
    }

    const ch = this.charAt(this.row, this.col);
    if (!ch) { SE.cancel(); return; }
    if (this.text.length >= this.max) { SE.cancel(); return; }
    this.text += ch;
    SE.select();
  }

  backspace() {
    if (!this.text.length) { SE.cancel(); return; }
    this.text = this.text.slice(0, -1);
    SE.cancel();
  }

  finish() {
    // 空のまま決定されたら、名無しを作らずキャンセル扱いにする
    const name = this.text.trim() || null;
    SE.select();
    // 呼び出し側は resume(name) でも onDone でも受け取れる。
    // どちらか片方だけを使うこと（両方だと二重に進む）。
    Scenes.pop(name);
    this.onDone?.(name);
  }

  render(ctx) {
    ctx.fillStyle = '#3c4a68';
    ctx.fillRect(0, 0, W, H);

    // 見出しと、いま入力されている名前
    drawWindow(ctx, 4, 4, 248, 32);
    drawText(ctx, this.title, 12, 7, { color: COL.ink });

    // ドット絵は見出しとぶつからないよう右端に置く（等倍以外はドットが濁る）
    if (this.sprite) drawSprite(ctx, this.sprite, 222, 6, { scale: 1 });
    const x = 12;
    for (let i = 0; i < this.max; i++) {
      const ch = this.text[i];
      const cx = x + i * 16;
      ctx.fillStyle = COL.inkLight;
      ctx.fillRect(cx, 31, 12, 1);                    // 下線でマス目を示す
      if (ch) drawText(ctx, ch, cx, 19, { color: COL.ink });
    }
    // 次に入る位置でカーソルを点滅させる
    if (this.text.length < this.max && this.blink % 40 < 22) {
      ctx.fillStyle = COL.select;
      ctx.fillRect(x + this.text.length * 16, 29, 12, 2);
    }

    // 文字の表
    drawWindow(ctx, 4, GRID_Y - 6, 248, ROWS * CELL_H + 10);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = this.charAt(r, c);
        if (!ch) continue;
        drawText(ctx, ch, colX(c) + 5, GRID_Y + r * CELL_H, { color: COL.ink });
      }
    }
    if (!this.onButtons) {
      drawCursor(ctx, colX(this.col) - 1, GRID_Y + this.row * CELL_H + 2, COL.select);
    }

    // ボタン列
    const by = BUTTON_Y;
    drawWindow(ctx, 4, by, 248, 20);
    const labels = [PAGE_NAMES[(this.page + 1) % PAGE_NAMES.length], 'けす', 'おわり'];
    labels.forEach((label, i) => {
      const cx = 4 + 248 / 6 + i * (248 / 3);
      const on = this.onButtons && this.col === i;
      drawTextCentered(ctx, label, cx, by + 3, { color: on ? COL.select : COL.ink });
      if (on) drawCursor(ctx, cx - 34, by + 5, COL.select);
    });
  }
}
