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

// 12列 × 7行。全部の かな が1画面に収まる並びにしてある。
// 半端な空きは全角スペースで埋めて、行の長さを揃える（描画も入力もこれで単純になる）。
const PAGES = {
  かな: [
    'あいうえおかきくけこさし',
    'すせそたちつてとなにぬね',
    'のはひふへほまみむめもや',
    'ゆよらりるれろわをんーっ',
    'がぎぐげござじずぜぞだぢ',
    'づでどばびぶべぼぱぴぷぺ',
    'ぽゃゅょぁぃぅぇぉ　　　',
  ],
  カナ: [
    'アイウエオカキクケコサシ',
    'スセソタチツテトナニヌネ',
    'ノハヒフヘホマミムメモヤ',
    'ユヨラリルレロワヲンーッ',
    'ガギグゲゴザジズゼゾダヂ',
    'ヅデドバビブベボパピプペ',
    'ポャュョァィゥェォ・　　',
  ],
  英数: [
    'ＡＢＣＤＥＦＧＨＩＪＫＬ',
    'ＭＮＯＰＱＲＳＴＵＶＷＸ',
    'ＹＺ　　　　　　　　　　',
    'ａｂｃｄｅｆｇｈｉｊｋｌ',
    'ｍｎｏｐｑｒｓｔｕｖｗｘ',
    'ｙｚ　　　　　　　　　　',
    '０１２３４５６７８９！？',
  ],
};

const PAGE_NAMES = Object.keys(PAGES);
const COLS = 12;
const ROWS = 7;
const CELL_W = 19;
const CELL_H = 15;
const GRID_X = 14;
const GRID_Y = 46;

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
    const ch = this.chars[row]?.[col] ?? '　';
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
    drawWindow(ctx, 4, 4, 248, 38);
    drawText(ctx, this.title, 12, 9, { color: COL.ink });

    // ドット絵は見出しとぶつからないよう右端に置く（等倍以外はドットが濁る）
    if (this.sprite) drawSprite(ctx, this.sprite, 220, 9, { scale: 1 });
    const x = 12;
    for (let i = 0; i < this.max; i++) {
      const ch = this.text[i];
      const cx = x + i * 16;
      ctx.fillStyle = COL.inkLight;
      ctx.fillRect(cx, 36, 12, 1);                    // 下線でマス目を示す
      if (ch) drawText(ctx, ch, cx, 23, { color: COL.ink });
    }
    // 次に入る位置でカーソルを点滅させる
    if (this.text.length < this.max && this.blink % 40 < 22) {
      ctx.fillStyle = COL.select;
      ctx.fillRect(x + this.text.length * 16, 34, 12, 2);
    }

    // 文字の表
    drawWindow(ctx, 4, GRID_Y - 6, 248, ROWS * CELL_H + 12);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = this.charAt(r, c);
        if (!ch) continue;
        drawText(ctx, ch, GRID_X + c * CELL_W + 5, GRID_Y + r * CELL_H, { color: COL.ink });
      }
    }
    if (!this.onButtons) {
      drawCursor(ctx, GRID_X + this.col * CELL_W - 1, GRID_Y + this.row * CELL_H + 2, COL.select);
    }

    // ボタン列
    const by = GRID_Y + ROWS * CELL_H + 10;
    drawWindow(ctx, 4, by, 248, 26);
    const labels = [PAGE_NAMES[(this.page + 1) % PAGE_NAMES.length], 'けす', 'おわり'];
    labels.forEach((label, i) => {
      const cx = 4 + 248 / 6 + i * (248 / 3);
      const on = this.onButtons && this.col === i;
      drawTextCentered(ctx, label, cx, by + 6, { color: on ? COL.select : COL.ink });
      if (on) drawCursor(ctx, cx - 34, by + 8, COL.select);
    });
  }
}
