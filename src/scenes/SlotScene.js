import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { SE } from '../core/audio.js';
import { drawText, drawTextRight, drawTextCentered } from '../engine/font.js';
import { drawWindow, drawCursor, COL } from '../engine/ui.js';
import * as Storage from '../core/storage.js';
import { SPECIES } from '../data/species.js';
import { MAPS } from '../data/maps/index.js';

const W = Screen.W;
const H = Screen.H;

const timeText = (ms) => {
  const t = Math.floor((ms ?? 0) / 1000);
  return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
};

/**
 * セーブ枠をえらぶ。
 * mode 'load' … 中身のある枠だけ選べる
 * mode 'save' … オート枠以外を選べる（オートはゲーム側が書く）
 * えらんだ枠番号を返し、やめたら null。
 */
export class SlotScene {
  constructor({ mode = 'load' } = {}) {
    this.mode = mode;
    this.slots = Storage.allSlots().filter((s) => mode === 'load' || s.slot !== 'auto');
    this.index = 0;
    if (mode === 'load') {
      const first = this.slots.findIndex((s) => s.data);
      if (first >= 0) this.index = first;
    }
  }

  enter() { Input.clearEdges(); }

  get current() { return this.slots[this.index]; }

  update() {
    if (Input.justPressed(BTN.B)) { Scenes.pop(null); return; }
    if (Input.repeated(BTN.UP)) { this.index = (this.index + this.slots.length - 1) % this.slots.length; SE.cursor(); }
    if (Input.repeated(BTN.DOWN)) { this.index = (this.index + 1) % this.slots.length; SE.cursor(); }

    if (!Input.justPressed(BTN.A)) return;
    const s = this.current;
    if (this.mode === 'load' && !s.data) { SE.cancel(); return; }
    SE.select();
    Scenes.pop(s.slot);
  }

  render(ctx) {
    ctx.fillStyle = '#2c3448';
    ctx.fillRect(0, 0, W, H);

    drawWindow(ctx, 4, 4, 248, 24);
    drawTextCentered(ctx, this.mode === 'load' ? 'どの レポートを よむ？' : 'どこに かきこむ？', W / 2, 9, { color: COL.ink });

    this.slots.forEach((s, i) => {
      const y = 34 + i * 40;
      drawWindow(ctx, 4, y, 248, 36);
      if (i === this.index) drawCursor(ctx, 8, y + 12, COL.select);

      const label = s.slot === 'auto' ? 'オート' : `レポート ${s.slot + 1}`;
      drawText(ctx, label, 20, y + 5, { color: COL.ink });

      if (!s.data) {
        drawText(ctx, 'からっぽ', 20, y + 19, { color: COL.inkLight });
        return;
      }
      const d = s.data;
      const lead = d.party?.[0];
      const mapName = MAPS[d.player?.pos?.map]?.name ?? '';
      drawTextRight(ctx, `${d.player?.name ?? ''}  ${timeText(d.playTimeMs)}`, 244, y + 5, { color: COL.ink });
      drawText(ctx, mapName, 20, y + 19, { color: COL.inkLight });
      if (lead) {
        const nm = SPECIES[lead.id]?.name ?? '？';
        drawTextRight(ctx, `${nm} Lv${lead.lv}  ずかん ${d.dex?.caught?.length ?? 0}`, 244, y + 19, { color: COL.ink });
      }
    });

    drawTextCentered(ctx, 'B ： やめる', W / 2, H - 12, { color: '#c8d0e0', shadow: '#202838' });
  }
}
