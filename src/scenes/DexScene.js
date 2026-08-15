import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextRight, wrapText } from '../engine/font.js';
import { drawWindow, drawCursor, drawTypeTag, COL } from '../engine/ui.js';
import { speciesList } from '../data/species.js';
import { TYPE_COLOR, TYPES } from '../data/types.js';
import { MAPS } from '../data/maps/index.js';
import { state } from '../game/state.js';

const W = Screen.W;
const H = Screen.H;
const ROWS = 7;
const STATUS_LABEL = ['すべて', 'みつけた', 'つかまえた'];

/** ずかん。みつけた／つかまえた の状態で表示を変える。 */
export class DexScene {
  constructor() {
    this.all = [...speciesList].sort((a, b) => a.id - b.id);
    this.filter = 0;          // 0 = すべて、1.. は TYPES の番号+1
    this.status = 0;          // 0 = すべて、1 = みつけた、2 = つかまえた
    this.index = 0;
    this.scroll = 0;
    this.rebuild();
  }

  /** タイプ・状態で絞り込む。空になる絞り込みでも一覧は空のまま出す（嘘をつかない）。 */
  rebuild() {
    const t = this.filter === 0 ? null : TYPES[this.filter - 1];
    let list = t ? this.all.filter((s) => s.types.includes(t)) : this.all;
    if (this.status === 1) list = list.filter((s) => this.seen(s));
    else if (this.status === 2) list = list.filter((s) => this.caught(s));
    this.list = list;
    this.index = Math.min(this.index, Math.max(0, this.list.length - 1));
    this.scroll = 0;
  }

  enter() { Input.clearEdges(); }

  get current() { return this.list[this.index]; }
  seen(sp) { return state.dex.seen.includes(sp.id); }
  caught(sp) { return state.dex.caught.includes(sp.id); }

  update() {
    if (Input.justPressed(BTN.B)) { Scenes.pop(); return; }
    if (Input.repeated(BTN.LEFT)) { this.filter = (this.filter + TYPES.length) % (TYPES.length + 1); this.rebuild(); }
    if (Input.repeated(BTN.RIGHT)) { this.filter = (this.filter + 1) % (TYPES.length + 1); this.rebuild(); }
    if (Input.justPressed(BTN.START)) { this.status = (this.status + 1) % STATUS_LABEL.length; this.rebuild(); }
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

    // 一覧
    drawWindow(ctx, 4, 4, 128, 184);
    this.renderFilter(ctx);
    if (!this.list.length) {
      drawText(ctx, 'いません', 20, 90, { color: COL.inkLight });
    }
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
    if (!sp) { this.renderCounts(ctx); return; }
    const seen = this.seen(sp);
    drawWindow(ctx, 136, 4, 116, 184);

    if (!seen) {
      drawText(ctx, 'まだ みつけていない', 144, 90, { color: COL.inkLight });
      this.renderCounts(ctx);
      return;
    }

    drawSprite(ctx, sp.sprite, 170, 12, { scale: 2 });
    const gotShiny = (state.dex.shiny ?? []).includes(sp.id);
    drawText(ctx, gotShiny ? `☆${sp.name}` : sp.name, 144, 64, { color: COL.ink });
    let tx = 144;
    for (const t of sp.types) tx += drawTypeTag(ctx, t, TYPE_COLOR[t], tx, 80) + 3;

    drawText(ctx, `たかさ ${sp.height}m`, 144, 96, { color: COL.ink });
    drawText(ctx, `おもさ ${sp.weight}kg`, 144, 109, { color: COL.ink });
    drawText(ctx, `とくせい ${sp.ability}`, 144, 122, { color: COL.ink });

    if (this.caught(sp)) {
      const where = MAPS[state.dex.where[sp.id]]?.name;
      let dexY = 149;
      if (where) {
        const whereLines = wrapText(`であった ${where}`, 100);
        whereLines.forEach((l, i) => drawText(ctx, l, 144, 135 + i * 13, { color: COL.inkLight }));
        dexY = 135 + whereLines.length * 13 + 1;
      }
      // 下の「みつけた/つかまえた」表示(y=168)にぶつからない範囲だけ出す。
      const maxDexLines = Math.max(1, Math.floor((157 - dexY) / 13) + 1);
      wrapText(sp.dex, 100).slice(0, maxDexLines).forEach((l, i) => {
        drawText(ctx, l, 144, dexY + i * 13, { color: COL.ink });
      });
    } else {
      drawText(ctx, 'つかまえると', 144, 139, { color: COL.inkLight });
      drawText(ctx, 'せつめいが よめる', 144, 152, { color: COL.inkLight });
    }
    this.renderCounts(ctx);
  }

  renderCounts(ctx) {
    drawTextRight(ctx, `みつけた ${state.dex.seen.length}`, 244, 168, { color: COL.ink });
    drawTextRight(ctx, `つかまえた ${state.dex.caught.length}`, 244, 178, { color: COL.ink });
  }

  /** 左下に絞り込みの状態を2段で。← → がタイプ、STARTが みつけた／つかまえた。 */
  renderFilter(ctx) {
    const t = this.filter === 0 ? null : TYPES[this.filter - 1];
    ctx.fillStyle = t ? TYPE_COLOR[t] : '#6a6a78';
    ctx.fillRect(6, 154, 122, 13);
    drawText(ctx, `← ${t ?? 'すべて'} →`, 12, 156, { color: '#ffffff' });

    ctx.fillStyle = this.status === 0 ? '#6a6a78' : (this.status === 1 ? '#4878b0' : '#c05838');
    ctx.fillRect(6, 169, 122, 13);
    drawText(ctx, `STARTで ${STATUS_LABEL[this.status]}`, 12, 171, { color: '#ffffff' });
  }
}
