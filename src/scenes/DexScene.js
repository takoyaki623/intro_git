import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextRight, wrapText } from '../engine/font.js';
import { drawWindow, drawCursor, drawTypeTag, COL } from '../engine/ui.js';
import { speciesList } from '../data/species.js';
import { TYPE_COLOR } from '../data/types.js';
import { state } from '../game/state.js';

const W = Screen.W;
const H = Screen.H;
const ROWS = 8;

/** ずかん。みつけた／つかまえた の状態で表示を変える。 */
export class DexScene {
  constructor() {
    this.list = [...speciesList].sort((a, b) => a.id - b.id);
    this.index = 0;
    this.scroll = 0;
  }

  enter() { Input.clearAll(); }

  get current() { return this.list[this.index]; }
  seen(sp) { return state.dex.seen.includes(sp.id); }
  caught(sp) { return state.dex.caught.includes(sp.id); }

  update() {
    if (Input.justPressed(BTN.B)) { Scenes.pop(); return; }
    if (Input.repeated(BTN.UP)) this.index = (this.index + this.list.length - 1) % this.list.length;
    if (Input.repeated(BTN.DOWN)) this.index = (this.index + 1) % this.list.length;

    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + ROWS) this.scroll = this.index - ROWS + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, this.list.length - ROWS)));
  }

  render(ctx) {
    ctx.fillStyle = '#384868';
    ctx.fillRect(0, 0, W, H);

    // 一覧
    drawWindow(ctx, 4, 4, 128, 184);
    for (let i = 0; i < ROWS; i++) {
      const sp = this.list[this.scroll + i];
      if (!sp) break;
      const y = 12 + i * 21;
      const seen = this.seen(sp);
      if (this.scroll + i === this.index) drawCursor(ctx, 8, y + 2, COL.select);
      drawText(ctx, String(sp.id).padStart(3, '0'), 18, y, { color: COL.inkLight });
      drawText(ctx, seen ? sp.name : '― ― ― ―', 48, y, {
        color: seen ? COL.ink : COL.inkLight,
      });
      if (this.caught(sp)) {
        ctx.fillStyle = '#e04030';
        ctx.fillRect(40, y + 3, 5, 5);
      }
    }

    // 詳細
    const sp = this.current;
    const seen = this.seen(sp);
    drawWindow(ctx, 136, 4, 116, 184);

    if (!seen) {
      drawText(ctx, 'まだ みつけていない', 144, 90, { color: COL.inkLight });
      this.renderCounts(ctx);
      return;
    }

    drawSprite(ctx, sp.sprite, 170, 12, { scale: 2 });
    drawText(ctx, sp.name, 144, 64, { color: COL.ink });
    let tx = 144;
    for (const t of sp.types) tx += drawTypeTag(ctx, t, TYPE_COLOR[t], tx, 80) + 3;

    drawText(ctx, `たかさ ${sp.height}m`, 144, 96, { color: COL.ink });
    drawText(ctx, `おもさ ${sp.weight}kg`, 144, 109, { color: COL.ink });

    if (this.caught(sp)) {
      wrapText(sp.dex, 100).slice(0, 4).forEach((l, i) => {
        drawText(ctx, l, 144, 126 + i * 13, { color: COL.ink });
      });
    } else {
      drawText(ctx, 'つかまえると', 144, 126, { color: COL.inkLight });
      drawText(ctx, 'せつめいが よめる', 144, 139, { color: COL.inkLight });
    }
    this.renderCounts(ctx);
  }

  renderCounts(ctx) {
    drawTextRight(ctx, `みつけた ${state.dex.seen.length}`, 244, 168, { color: COL.ink });
    drawTextRight(ctx, `つかまえた ${state.dex.caught.length}`, 244, 178, { color: COL.ink });
  }
}
