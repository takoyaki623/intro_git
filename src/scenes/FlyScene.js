import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { SE } from '../core/audio.js';
import { drawText, drawTextCentered } from '../engine/font.js';
import { drawWindow, COL } from '../engine/ui.js';
import { Menu } from '../engine/menu.js';
import { MAPS } from '../data/maps/index.js';
import { state, getFlag } from '../game/state.js';

const W = Screen.W;
const H = Screen.H;

/** 一度でも行ったことのある町 */
export function flyDestinations() {
  return Object.entries(MAPS)
    .filter(([id, m]) => m.fly && getFlag(`been_${id}`))
    .map(([id, m]) => ({ id, ...m.fly }));
}

/**
 * そらをとぶ。行ったことのある町だけを並べる。
 * えらんだら { map, x, y } を返し、いまいる町を選んだときは null。
 */
export class FlyScene {
  constructor({ onClose = null } = {}) {
    this.onClose = onClose;
    const here = state.player.pos.map;
    const list = flyDestinations();
    this.menu = new Menu(
      [
        ...list.map((d) => ({
          label: d.label,
          dest: d,
          // いまいる町へは飛べない（飛んでも何も起きないので選べなくする）
          disabled: d.id === here,
        })),
        { label: 'やめる', close: true },
      ],
      { x: 28, y: 60, lineH: 18, colW: 200 },
    );
  }

  enter() { Input.clearEdges(); }
  exit() { this.onClose?.(); }

  update() {
    const r = this.menu.update();
    if (r?.type === 'cancel') { Scenes.pop(null); return; }
    if (r?.type !== 'select') return;
    if (r.item.close) { Scenes.pop(null); return; }
    SE.heal();
    Scenes.pop({ map: r.item.dest.id, x: r.item.dest.x, y: r.item.dest.y });
  }

  render(ctx) {
    ctx.fillStyle = '#2a3a58';
    ctx.fillRect(0, 0, W, H);
    // 空を飛ぶ気分になるよう、うすい雲の帯を敷く
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.03)';
      ctx.fillRect(0, 18 + i * 34, W, 14);
    }

    drawWindow(ctx, 4, 4, 248, 26);
    drawTextCentered(ctx, 'どこへ そらを とぶ？', W / 2, 10, { color: COL.ink });

    drawWindow(ctx, 20, 50, 216, 100);
    this.menu.render(ctx);

    drawWindow(ctx, 4, 158, 248, 30);
    drawText(ctx, 'いちど 行った まちへ もどれます。', 12, 165, { color: COL.ink });
  }
}
