import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { drawText, drawTextRight, wrapText } from '../engine/font.js';
import { drawWindow, drawCursor, COL } from '../engine/ui.js';
import { Menu } from '../engine/menu.js';
import { TextBox } from '../engine/textbox.js';
import { POCKETS } from '../data/items.js';
import { state, bagPocket, removeItem } from '../game/state.js';
import { evolutionTarget } from '../game/monster.js';

const W = Screen.W;
const H = Screen.H;

/**
 * バッグ。
 * mode 'field'  … フィールドから。使用時は手持ち画面へ。閉じるとき null。
 * mode 'battle' … バトルから。選んだら { item, target } を返す。
 */
export class BagScene {
  constructor({ mode = 'field' } = {}) {
    this.mode = mode;
    this.pocket = 0;
    this.menu = null;
    this.box = null;
    this.pendingItem = null;
    this.buildMenu();
  }

  enter() { Input.clearAll(); }

  buildMenu() {
    const entries = bagPocket(POCKETS[this.pocket]);
    const items = entries.map((e) => ({
      label: e.item.name,
      item: e.item,
      n: e.n,
    }));
    items.push({ label: 'とじる', close: true });
    this.menu = new Menu(items, { x: 12, y: 46, lineH: 15, rows: 7, colW: 232 });
  }

  close(result) { Scenes.pop(result); }

  update() {
    if (this.box) {
      this.box.update(Input.isDown(BTN.A));
      if (Input.justPressed(BTN.A) && this.box.advance()) this.box = null;
      return;
    }

    // ポケット切り替え
    if (Input.repeated(BTN.LEFT)) {
      this.pocket = (this.pocket + POCKETS.length - 1) % POCKETS.length;
      this.buildMenu();
      return;
    }
    if (Input.repeated(BTN.RIGHT)) {
      this.pocket = (this.pocket + 1) % POCKETS.length;
      this.buildMenu();
      return;
    }

    const r = this.menu.update();
    if (r?.type === 'cancel') { this.close(null); return; }
    if (r?.type !== 'select') return;

    if (r.item.close) { this.close(null); return; }
    this.choose(r.item.item);
  }

  async choose(item) {
    const where = this.mode === 'battle' ? 'battle' : 'field';

    if (!item.usableIn.includes(where) && item.pocket !== 'ボール') {
      this.say('いまは つかえない。');
      return;
    }

    // バトル中のボールは対象を選ばずそのまま返す
    if (item.pocket === 'ボール') {
      if (this.mode !== 'battle') { this.say('やせいの ポケモンが いないと つかえない。'); return; }
      this.close({ item, target: null });
      return;
    }

    // 対象を選ぶ
    this.pendingItem = item;
    const { PartyScene } = await import('./PartyScene.js');
    Scenes.push(new PartyScene({ mode: 'item', item }));
  }

  /** PartyScene から戻ってきた */
  resume(result) {
    Input.clearAll();
    const item = this.pendingItem;
    this.pendingItem = null;
    if (!result) return;

    if (result.stone) {
      this.useStone(result.stone, result.target);
      return;
    }

    if (result.used) {
      removeItem(item.name, 1);
      this.buildMenu();
      if (this.mode === 'battle') this.close({ item, target: result.target });
    }
  }

  async useStone(stone, mon) {
    const toId = evolutionTarget(mon, 'stone', stone.name);
    if (!toId) {
      this.say('しかし なにも おこらなかった！');
      return;
    }
    removeItem(stone.name, 1);
    this.buildMenu();

    const { EvolveScene } = await import('./EvolveScene.js');
    Scenes.push(new EvolveScene({ mon, toId }));
  }

  say(text) {
    this.box = new TextBox({ y: 148, h: 40 });
    this.box.setText(text);
  }

  render(ctx) {
    ctx.fillStyle = '#4a5a78';
    ctx.fillRect(0, 0, W, H);

    // ポケットのタブ
    drawWindow(ctx, 4, 4, 248, 30);
    POCKETS.forEach((p, i) => {
      const x = 12 + i * 78;
      const on = i === this.pocket;
      if (on) {
        ctx.fillStyle = COL.select;
        ctx.fillRect(x - 4, 10, 74, 16);
      }
      drawText(ctx, p, x, 13, { color: on ? '#ffffff' : COL.inkLight });
    });
    drawText(ctx, '← →', 214, 13, { color: COL.inkLight });

    // 一覧
    drawWindow(ctx, 4, 38, 248, 112);
    this.menu.render(ctx);

    // 個数
    const start = this.menu.scroll;
    for (let i = 0; i < this.menu.visibleRows; i++) {
      const it = this.menu.items[start + i];
      if (!it || it.close) continue;
      drawTextRight(ctx, `×${it.n}`, 240, 46 + i * 15, { color: COL.ink });
    }

    // 説明 or メッセージ
    if (this.box) {
      this.box.render(ctx);
      return;
    }
    drawWindow(ctx, 4, 152, 248, 36);
    const cur = this.menu.current;
    const desc = cur?.item?.desc ?? 'バッグを とじる。';
    wrapText(desc, 232).slice(0, 2).forEach((l, i) => {
      drawText(ctx, l, 12, 158 + i * 14, { color: COL.ink });
    });
  }
}
