import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { SE } from '../core/audio.js';
import { drawText, drawTextRight, wrapText } from '../engine/font.js';
import { drawWindow, COL } from '../engine/ui.js';
import { Menu } from '../engine/menu.js';
import { TextBox } from '../engine/textbox.js';
import { getItem } from '../data/items.js';
import { state, addItem, removeItem } from '../game/state.js';

const W = Screen.W;
const H = Screen.H;

/**
 * 売値は買値の半額（本家と同じ）。買い戻しで無限に増やせないようにするため。
 * わざマシンは使っても減らないので、売れると無限にお金が湧く。売らせない。
 */
const sellPrice = (item) =>
  (item.pocket === 'わざマシン' ? 0 : Math.floor((item.price ?? 0) / 2));

/**
 * ショップ。
 * stock は売っている道具の名前の配列で、マップの NPC 定義から渡される。
 */
export class ShopScene {
  constructor({ stock = [], onClose = null } = {}) {
    this.stock = stock.map(getItem).filter(Boolean);
    this.onClose = onClose;
    this.mode = 'top';        // top | buy | sell | count | msg
    this.box = null;
    this.pending = null;      // { item, price, kind }
    this.qty = 1;

    this.topMenu = new Menu(
      [{ label: 'かう', id: 'buy' }, { label: 'うる', id: 'sell' }, { label: 'やめる', id: 'quit' }],
      { x: 158, y: 26, lineH: 18, colW: 84 },
    );
  }

  enter() {
    Input.clearEdges();
    this.say('いらっしゃいませ！ なにか おさがしですか？');
  }

  exit() { this.onClose?.(); }

  /**
   * メッセージを出す。読み終わるまで操作を止めたいので、mode もここで msg にする。
   * 呼び出し側に任せると、書き忘れた場所でメッセージの裏のメニューが動いてしまう。
   */
  say(text, after = null) {
    this.box = new TextBox();
    this.box.setText(text);
    this.afterMsg = after;
    this.mode = 'msg';
  }

  buildBuy() {
    const items = this.stock.map((it) => ({ label: it.name, item: it, price: it.price ?? 0 }));
    items.push({ label: 'やめる', close: true });
    this.menu = new Menu(items, { x: 12, y: 40, lineH: 15, rows: 6, colW: 232 });
    this.mode = 'buy';
  }

  buildSell() {
    const items = Object.entries(state.bag)
      .map(([name, n]) => ({ item: getItem(name), n }))
      .filter((e) => e.item && sellPrice(e.item) > 0)
      .map((e) => ({ label: e.item.name, item: e.item, n: e.n, price: sellPrice(e.item) }));

    if (!items.length) {
      this.say('うれる ものを おもちでは ないようです。', () => { this.mode = 'top'; });
      return;
    }
    items.push({ label: 'やめる', close: true });
    this.menu = new Menu(items, { x: 12, y: 40, lineH: 15, rows: 6, colW: 232 });
    this.mode = 'sell';
  }

  /** 個数を選ぶ。買えない・売れない数は選べないようにする。 */
  startCount(kind, entry) {
    const max = kind === 'buy'
      ? Math.max(1, Math.min(99, Math.floor(state.player.money / Math.max(1, entry.price))))
      : entry.n;

    if (kind === 'buy' && state.player.money < entry.price) {
      this.say('おかねが たりないようです。', () => { this.mode = kind; });
      return;
    }
    this.pending = { kind, entry, max };
    this.qty = 1;
    this.mode = 'count';
  }

  confirm() {
    const { kind, entry } = this.pending;
    const total = entry.price * this.qty;

    if (kind === 'buy') {
      state.player.money -= total;
      addItem(entry.item.name, this.qty);
      SE.select();
      this.say(`${entry.item.name}を ${this.qty}こ おかいあげ ありがとうございます！`,
        () => { this.buildBuy(); });
    } else {
      removeItem(entry.item.name, this.qty);
      state.player.money += total;
      SE.select();
      this.say(`${entry.item.name}を ${this.qty}こ おうりいただき ありがとうございます！`,
        () => { this.buildSell(); });
    }
    this.pending = null;
  }

  update() {
    if (this.mode === 'msg') {
      this.box.update(Input.isDown(BTN.A));
      if (Input.justPressed(BTN.A) && this.box.advance()) {
        this.box = null;
        const after = this.afterMsg;
        this.afterMsg = null;
        if (after) after();
        else this.mode = 'top';
      }
      return;
    }

    if (this.mode === 'top') {
      const r = this.topMenu.update();
      if (r?.type === 'cancel') { this.close(); return; }
      if (r?.type !== 'select') return;
      if (r.item.id === 'buy') this.buildBuy();
      else if (r.item.id === 'sell') this.buildSell();
      else this.close();
      return;
    }

    if (this.mode === 'count') {
      const { max } = this.pending;
      if (Input.repeated(BTN.UP)) { this.qty = Math.min(max, this.qty + 1); SE.cursor(); }
      if (Input.repeated(BTN.DOWN)) { this.qty = Math.max(1, this.qty - 1); SE.cursor(); }
      if (Input.repeated(BTN.RIGHT)) { this.qty = Math.min(max, this.qty + 10); SE.cursor(); }
      if (Input.repeated(BTN.LEFT)) { this.qty = Math.max(1, this.qty - 10); SE.cursor(); }
      if (Input.justPressed(BTN.A)) this.confirm();
      if (Input.justPressed(BTN.B)) { this.mode = this.pending.kind; this.pending = null; SE.cancel(); }
      return;
    }

    // buy / sell の一覧
    const r = this.menu.update();
    if (r?.type === 'cancel') { this.mode = 'top'; return; }
    if (r?.type !== 'select') return;
    if (r.item.close) { this.mode = 'top'; return; }
    this.startCount(this.mode, r.item);
  }

  close() {
    this.say('またの おこしを おまちしております！', () => Scenes.pop());
  }

  render(ctx) {
    ctx.fillStyle = '#3c5068';
    ctx.fillRect(0, 0, W, H);

    // 所持金は常に出す。買い物中に一番見たい数字なので。
    drawWindow(ctx, 4, 4, 110, 22);
    drawText(ctx, 'おかね', 12, 8, { color: COL.inkLight });
    drawTextRight(ctx, `${state.player.money}`, 106, 8, { color: COL.ink });

    if (this.mode === 'top') {
      drawWindow(ctx, 150, 18, 100, 62);
      this.topMenu.render(ctx);
    }

    if (this.mode === 'buy' || this.mode === 'sell' || this.mode === 'count') {
      const list = this.mode === 'count' ? this.pending.kind : this.mode;
      drawWindow(ctx, 4, 32, 248, 108);
      this.menu.render(ctx);

      // 値段（買値 or 売値）
      const start = this.menu.scroll;
      for (let i = 0; i < this.menu.visibleRows; i++) {
        const it = this.menu.items[start + i];
        if (!it || it.close) continue;
        const label = list === 'sell' ? `×${it.n}  ${it.price}` : `${it.price}`;
        drawTextRight(ctx, label, 242, 40 + i * 15, { color: COL.ink });
      }

      // 説明
      drawWindow(ctx, 4, 144, 248, 44);
      const cur = this.menu.current;
      wrapText(cur?.item?.desc ?? 'とじる。', 232).slice(0, 2).forEach((l, i) => {
        drawText(ctx, l, 12, 150 + i * 14, { color: COL.ink });
      });
    }

    if (this.mode === 'count') {
      const { entry, kind } = this.pending;
      const total = entry.price * this.qty;
      // 説明枠(y=144)にかからないよう、下端を140で止める
      drawWindow(ctx, 112, 86, 140, 54);
      drawText(ctx, entry.item.name, 120, 92, { color: COL.ink });
      drawText(ctx, `× ${this.qty}`, 120, 107, { color: COL.ink });
      drawTextRight(ctx, `${total}`, 244, 107, { color: kind === 'buy' ? COL.select : COL.ink });
      drawText(ctx, '↑↓±1  ←→±10', 120, 123, { color: COL.inkLight });
    }

    if (this.box) this.box.render(ctx);
  }
}
