// でんどうのま（Phase Z-2）。殿堂入りした回の記録を見返す。
// 何回目にどんなパーティで勝ったかだけを残しているので、1回ぶんを1画面に出し、
// 上下キーで別の回へめくる。

import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextCentered } from '../engine/font.js';
import { drawWindow, COL } from '../engine/ui.js';
import { state } from '../game/state.js';
import { getSpecies } from '../data/species.js';

const W = Screen.W;
const H = Screen.H;

export class HallOfFameRecordScene {
  constructor() {
    // 新しい記録から見せる
    this.records = [...(state.hallOfFame ?? [])].reverse();
    this.index = 0;
  }

  enter() { Input.clearEdges(); }

  update() {
    if (Input.justPressed(BTN.B) || Input.justPressed(BTN.A)) { Scenes.pop(); return; }
    if (!this.records.length) return;
    if (Input.justPressed(BTN.UP) || Input.justPressed(BTN.LEFT)) {
      this.index = (this.index - 1 + this.records.length) % this.records.length;
    }
    if (Input.justPressed(BTN.DOWN) || Input.justPressed(BTN.RIGHT)) {
      this.index = (this.index + 1) % this.records.length;
    }
  }

  render(ctx) {
    drawWindow(ctx, 8, 8, W - 16, H - 16);
    drawTextCentered(ctx, 'でんどうのま', W / 2, 18, { color: COL.ink });

    if (!this.records.length) {
      drawTextCentered(ctx, 'まだ でんどういりの きろくが ない。', W / 2, 90, { color: COL.inkLight });
      return;
    }

    const total = this.records.length;
    const rec = this.records[this.index];
    const num = total - this.index; // 何回目か（古い順の通し番号）
    drawTextCentered(ctx, `${num}かいめ の でんどうにゅうり`, W / 2, 36, { color: COL.ink });

    const cols = 3;
    const cellW = 76, cellH = 60;
    const startX = (W - cellW * cols) / 2;
    const startY = 52;
    rec.party.forEach((m, i) => {
      const sp = getSpecies(m.speciesId);
      const x = startX + (i % cols) * cellW;
      const y = startY + Math.floor(i / cols) * cellH;
      if (sp) drawSprite(ctx, sp.sprite, x + cellW / 2 - 16, y, { scale: 2 });
      drawTextCentered(ctx, `${m.nick ?? m.name}${m.shiny ? ' ☆' : ''}`, x + cellW / 2, y + 36, { color: COL.ink });
      drawTextCentered(ctx, `Lv${m.level}`, x + cellW / 2, y + 48, { color: COL.inkLight });
    });

    drawTextCentered(ctx, `◀ ${total - this.index} / ${total} ▶`, W / 2, H - 20, { color: COL.inkLight });
  }
}
