import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { drawText, textWidth } from '../engine/font.js';
import { drawWindow, drawCursor, drawTypeTag, COL } from '../engine/ui.js';
import { TYPES, TYPE_COLOR, CHART } from '../data/types.js';

const W = Screen.W;
const H = Screen.H;
const ROWS = 8;

/**
 * タイプそうかん。18タイプの中から1つ選ぶと、そのタイプで「こうげきしたとき」
 * 相手にどれだけ効くかを ばつぐん／いまひとつ／こうかなし の3行で出す。
 * CHART は攻撃側タイプが軸なので、そのまま読むだけで作れる（A3）。
 */
export class TypeChartScene {
  constructor() {
    this.index = 0;
    this.scroll = 0;
  }

  enter() { Input.clearEdges(); }

  update() {
    if (Input.justPressed(BTN.B)) { Scenes.pop(); return; }
    if (Input.repeated(BTN.UP)) this.index = (this.index + TYPES.length - 1) % TYPES.length;
    if (Input.repeated(BTN.DOWN)) this.index = (this.index + 1) % TYPES.length;

    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + ROWS) this.scroll = this.index - ROWS + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, TYPES.length - ROWS));
  }

  render(ctx) {
    ctx.fillStyle = '#384868';
    ctx.fillRect(0, 0, W, H);

    // 左: タイプ一覧
    drawWindow(ctx, 4, 4, 78, 184);
    for (let i = 0; i < ROWS; i++) {
      const t = TYPES[this.scroll + i];
      if (!t) break;
      const y = 12 + i * 21;
      if (this.scroll + i === this.index) drawCursor(ctx, 8, y + 2, COL.select);
      ctx.fillStyle = TYPE_COLOR[t];
      ctx.fillRect(18, y - 1, 58, 13);
      drawText(ctx, t, 21, y, { color: '#ffffff' });
    }

    // 右: 選んだタイプで こうげき したときの相性
    const atk = TYPES[this.index];
    drawWindow(ctx, 86, 4, 166, 184);
    drawTypeTag(ctx, atk, TYPE_COLOR[atk], 94, 11);
    drawText(ctx, 'で こうげきしたとき', 94, 28, { color: COL.inkLight });

    const row = CHART[atk] ?? {};
    const great = TYPES.filter((t) => (row[t] ?? 1) > 1);
    const bad = TYPES.filter((t) => (row[t] ?? 1) > 0 && (row[t] ?? 1) < 1);
    const none = TYPES.filter((t) => (row[t] ?? 1) === 0);

    let y = 46;
    y = this.renderGroup(ctx, 'こうかは ばつぐん', great, '#e04030', y);
    y = this.renderGroup(ctx, 'こうかは いまひとつ', bad, '#4878b0', y);
    if (none.length) y = this.renderGroup(ctx, 'こうかが ない', none, '#707070', y);
    if (!great.length && !bad.length && !none.length) {
      drawText(ctx, 'すべて ふつうに ダメージが とおる。', 94, y, { color: COL.ink });
    }
  }

  /**
   * ラベル＋タイプ名の一覧を、折り返しつきで描く。次のブロックのy座標を返す。
   * wrapText は文字単位で折り返すため「ひこう」が「ひこ／う」のように割れてしまう。
   * ここではタイプ名を割らない語ぶん折り返しで詰める。
   */
  renderGroup(ctx, label, list, color, y) {
    drawText(ctx, label, 94, y, { color });
    if (!list.length) {
      drawText(ctx, 'なし', 106, y + 13, { color: COL.inkLight });
      return y + 32;
    }
    const maxW = 150;
    const lines = [];
    let line = '';
    let w = 0;
    for (const t of list) {
      const piece = line ? `　${t}` : t;
      const pw = textWidth(piece);
      if (line && w + pw > maxW) {
        lines.push(line);
        line = t;
        w = textWidth(t);
      } else {
        line += piece;
        w += pw;
      }
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => drawText(ctx, l, 106, y + 13 + i * 13, { color: COL.ink }));
    return y + 13 + lines.length * 13 + 6;
  }
}
