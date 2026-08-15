// じっせき（B3）。state.stats など既存の記録から達成状況を一覧表示するだけの、
// 読み取り専用の画面。報酬は無い ―― 一覧で分かることそのものが目的。

import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { drawText, wrapText } from '../engine/font.js';
import { drawWindow, drawCursor, COL } from '../engine/ui.js';
import { state } from '../game/state.js';
import { achievementStatus } from '../game/achievements.js';

const W = Screen.W;
const H = Screen.H;
const ROWS = 6;

export class AchievementScene {
  constructor() {
    this.list = achievementStatus(state);
    this.index = 0;
    this.scroll = 0;
  }

  enter() { Input.clearEdges(); }

  update() {
    if (Input.justPressed(BTN.B)) { Scenes.pop(); return; }
    if (!this.list.length) return;
    if (Input.repeated(BTN.UP)) this.index = (this.index + this.list.length - 1) % this.list.length;
    if (Input.repeated(BTN.DOWN)) this.index = (this.index + 1) % this.list.length;

    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + ROWS) this.scroll = this.index - ROWS + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, this.list.length - ROWS)));
  }

  render(ctx) {
    ctx.fillStyle = '#384868';
    ctx.fillRect(0, 0, W, H);

    const gotN = this.list.filter((a) => a.got).length;
    drawWindow(ctx, 4, 4, 248, 22);
    drawText(ctx, 'じっせき', 12, 10, { color: COL.ink });
    drawText(ctx, `${gotN} / ${this.list.length}`, 200, 10, { color: COL.inkLight });

    drawWindow(ctx, 4, 30, 248, 118);
    for (let i = 0; i < ROWS; i++) {
      const a = this.list[this.scroll + i];
      if (!a) break;
      const y = 38 + i * 18;
      if (this.scroll + i === this.index) drawCursor(ctx, 8, y + 2, COL.select);
      ctx.fillStyle = a.got ? '#e0c030' : '#586888';
      ctx.fillRect(20, y + 1, 8, 8);
      drawText(ctx, a.name, 34, y, { color: a.got ? COL.ink : COL.inkLight });
    }

    const cur = this.list[this.index];
    drawWindow(ctx, 4, 152, 248, 36);
    if (cur) {
      wrapText(cur.desc, 232).slice(0, 2).forEach((l, i) => {
        drawText(ctx, l, 12, 158 + i * 13, { color: COL.ink });
      });
    }
  }
}
