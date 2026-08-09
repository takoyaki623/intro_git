import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { drawText, drawTextRight, wrapText } from '../engine/font.js';
import { drawWindow, drawTypeTag, COL } from '../engine/ui.js';
import { Menu } from '../engine/menu.js';
import { getMove } from '../data/moves.js';
import { TYPE_COLOR } from '../data/types.js';
import { displayName } from '../game/monster.js';

const W = Screen.W;
const H = Screen.H;

/** 4つ埋まっているときに忘れる技を選ぶ画面。B で「覚えない」。 */
export class ForgetScene {
  constructor({ mon, newMove }) {
    this.mon = mon;
    this.newMove = newMove;

    const items = mon.moves.map((mv, i) => ({ label: mv.id, mv, def: getMove(mv.id), slot: i }));
    items.push({ label: `やめる（${newMove}を おぼえない）`, cancel: true });
    this.menu = new Menu(items, { x: 14, y: 60, lineH: 17, colW: 220 });
  }

  enter() { Input.clearEdges(); }

  update() {
    const r = this.menu.update();
    if (r?.type === 'cancel') { Scenes.pop(null); return; }
    if (r?.type !== 'select') return;
    if (r.item.cancel) { Scenes.pop(null); return; }
    Scenes.pop(r.item.slot);
  }

  render(ctx) {
    ctx.fillStyle = '#384868';
    ctx.fillRect(0, 0, W, H);

    drawWindow(ctx, 4, 4, 248, 44);
    drawText(ctx, `${displayName(this.mon)}は`, 12, 10, { color: COL.ink });
    drawText(ctx, `${this.newMove}を おぼえたい！`, 12, 26, { color: COL.ink });

    drawWindow(ctx, 4, 52, 248, 92);
    this.menu.render(ctx);

    // 選択中の技の PP を右端に
    this.menu.items.forEach((it, i) => {
      if (!it.mv) return;
      drawTextRight(ctx, `PP ${it.mv.pp}/${it.mv.maxPp}`, 244, 60 + i * 17, { color: COL.ink });
    });

    drawWindow(ctx, 4, 148, 248, 40);
    const cur = this.menu.current;
    const def = cur?.def ?? getMove(this.newMove);
    if (def) {
      let x = 12;
      x += drawTypeTag(ctx, def.type, TYPE_COLOR[def.type], x, 154) + 6;
      drawText(ctx, def.category, x, 154, { color: COL.ink });
      drawTextRight(ctx, def.power ? `いりょく ${def.power}` : 'へんか', 244, 154, { color: COL.ink });
      const d = wrapText(def.desc ?? '', 232)[0] ?? '';
      drawText(ctx, d, 12, 170, { color: COL.ink });
    }
  }
}
