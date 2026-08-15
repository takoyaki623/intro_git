import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextCentered } from '../engine/font.js';
import { drawWindow, drawTypeTag, COL, fillScreen } from '../engine/ui.js';
import { getSpecies } from '../data/species.js';
import { TYPE_COLOR } from '../data/types.js';

const W = Screen.W;
const H = Screen.H;

/** 最初の1匹を選ぶ画面。左右で選び、A で決定、B で「まだ まよっている」。 */
export class StarterScene {
  constructor({ ids, onPick }) {
    this.ids = ids;
    this.onPick = onPick;
    this.index = 1; // ヒトカゲが真ん中に来る
    this.t = 0;
    this.confirm = false;
  }

  enter() { Input.clearEdges(); }

  get species() { return getSpecies(this.ids[this.index]); }

  update() {
    this.t++;

    if (this.confirm) {
      if (Input.justPressed(BTN.A)) {
        this.onPick(this.ids[this.index]);
        Scenes.pop();
        return;
      }
      if (Input.justPressed(BTN.B)) this.confirm = false;
      return;
    }

    if (Input.repeated(BTN.LEFT)) this.index = (this.index + this.ids.length - 1) % this.ids.length;
    if (Input.repeated(BTN.RIGHT)) this.index = (this.index + 1) % this.ids.length;
    if (Input.justPressed(BTN.A)) this.confirm = true;
  }

  render(ctx) {
    ctx.fillStyle = '#182038';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 4) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, y, W, 1);
    }

    drawTextCentered(ctx, 'すきな ポケモンを えらんでね', W / 2, 12, {
      color: '#ffffff', shadow: '#303050',
    });

    // 3体を横に並べ、選択中だけ大きく手前に描く
    const slots = [40, 128, 216];
    for (let i = 0; i < this.ids.length; i++) {
      const sp = getSpecies(this.ids[i]);
      const sel = i === this.index;
      const scale = sel ? 2 : 1;
      const size = 24 * scale;
      const cx = slots[i];
      const bob = sel ? Math.round(Math.sin(this.t / 14) * 2) : 0;
      const y = 84 - size + bob;

      // 台座
      ctx.fillStyle = sel ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.ellipse(cx, 88, size * 0.55, size * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      drawSprite(ctx, sp.sprite, cx - size / 2, y, { scale });

      if (sel) {
        drawTextCentered(ctx, sp.name, cx, 94, { color: '#ffffff', shadow: '#303050' });
      }
    }

    // 説明
    const sp = this.species;
    drawWindow(ctx, 8, 110, 240, 74);
    let tx = 16;
    for (const t of sp.types) tx += drawTypeTag(ctx, t, TYPE_COLOR[t], tx, 118) + 4;
    drawText(ctx, `たかさ ${sp.height}m  おもさ ${sp.weight}kg`, 130, 118, { color: COL.inkLight });

    const lines = sp.dex.match(/.{1,19}/g) ?? [sp.dex];
    lines.slice(0, 3).forEach((l, i) => drawText(ctx, l, 16, 136 + i * 14, { color: COL.ink }));

    if (this.confirm) {
      fillScreen(ctx, '#000000', 0.5);
      drawWindow(ctx, 30, 70, 196, 54);
      drawTextCentered(ctx, `${sp.name}で いいんだね？`, W / 2, 82, { color: COL.ink });
      drawTextCentered(ctx, 'A ： けってい    B ： やめる', W / 2, 100, { color: COL.inkLight });
    } else if (this.t % 60 < 36) {
      drawTextCentered(ctx, '← →  で えらぶ', W / 2, 26, { color: '#ffe14a', shadow: '#303050' });
    }
  }
}
