import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN, DEFAULT_MAP, keysFor } from '../core/input.js';
import { SE } from '../core/audio.js';
import { drawText, drawTextRight, drawTextCentered } from '../engine/font.js';
import { drawWindow, drawCursor, COL } from '../engine/ui.js';
import { settings, set } from '../core/settings.js';

const W = Screen.W;
const H = Screen.H;

const ROWS = [
  { btn: BTN.A, label: 'けってい (A)' },
  { btn: BTN.B, label: 'キャンセル (B)' },
  { btn: BTN.START, label: 'メニュー' },
  { btn: BTN.RUN, label: 'ダッシュ' },
];

/** キーコードを見やすくする（KeyZ → Z、ArrowUp → ↑）。 */
function keyLabel(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Enter: 'Enter', Space: 'Space', Escape: 'Esc', Backspace: 'BS', Tab: 'Tab',
    ShiftLeft: 'Shift', ShiftRight: 'Shift' }[code] ?? code;
}

/**
 * キーの割り当て。
 * 方向キーは変えられない ―― 変えている途中でカーソルを動かせなくなるため。
 */
export class KeyConfigScene {
  constructor() {
    this.index = 0;
    this.waiting = false;   // 次に押されたキーを待っている
  }

  enter() {
    Input.clearEdges();
    // 生の keydown を直接ひろう。論理ボタンに変換される前の情報が要る。
    this.onKey = (e) => {
      if (!this.waiting) return;
      e.preventDefault();
      this.assign(e.code);
    };
    addEventListener('keydown', this.onKey, { capture: true });
  }

  exit() { removeEventListener('keydown', this.onKey, { capture: true }); }

  assign(code) {
    // 方向キーを奪われると詰むので、割り当て先から外しておく
    if ([BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT].includes(DEFAULT_MAP[code])) {
      SE.cancel();
      this.waiting = false;
      this.error = 'ほうこうキーは わりあてられません';
      return;
    }
    const keys = { ...settings.keys };
    // 同じキーを別のボタンに使い回さない
    for (const k of Object.keys(keys)) if (k === code) delete keys[k];
    keys[code] = ROWS[this.index].btn;
    set('keys', keys);
    SE.select();
    this.waiting = false;
    this.error = null;
  }

  update() {
    if (this.waiting) return;   // キー待ちのあいだは通常の入力を受けない

    if (Input.justPressed(BTN.B)) { Scenes.pop(); return; }
    if (Input.repeated(BTN.UP)) { this.index = (this.index + ROWS.length - 1) % ROWS.length; SE.cursor(); this.error = null; }
    if (Input.repeated(BTN.DOWN)) { this.index = (this.index + 1) % ROWS.length; SE.cursor(); this.error = null; }
    if (Input.justPressed(BTN.START)) { set('keys', {}); SE.cancel(); this.error = 'もとに もどしました'; return; }
    if (Input.justPressed(BTN.A)) { this.waiting = true; this.error = null; }
  }

  render(ctx) {
    ctx.fillStyle = '#3c4a68';
    ctx.fillRect(0, 0, W, H);

    drawWindow(ctx, 4, 4, 248, 26);
    drawText(ctx, 'キーの わりあて', 12, 9, { color: COL.ink });
    drawTextRight(ctx, 'メニューキー ： もとに もどす', 244, 10, { color: COL.inkLight });

    drawWindow(ctx, 4, 34, 248, 100);
    ROWS.forEach((r, i) => {
      const y = 44 + i * 22;
      if (i === this.index) drawCursor(ctx, 10, y + 2, COL.select);
      drawText(ctx, r.label, 22, y, { color: COL.ink });
      const keys = keysFor(r.btn).map(keyLabel).join(' / ');
      drawTextRight(ctx, this.waiting && i === this.index ? 'キーを おして…' : keys, 240, y, {
        color: this.waiting && i === this.index ? COL.select : COL.ink,
      });
    });

    drawWindow(ctx, 4, 138, 248, 50);
    drawText(ctx, this.error ?? 'Ａ を おしてから、あてたい キーを おします。', 12, 144, { color: COL.ink });
    drawText(ctx, 'ほうこうキーは かえられません。', 12, 158, { color: COL.inkLight });
    drawTextCentered(ctx, 'Ｂ ： とじる', W / 2, 172, { color: COL.inkLight });
  }
}
