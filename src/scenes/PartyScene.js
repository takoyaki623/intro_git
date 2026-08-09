import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextRight } from '../engine/font.js';
import { drawWindow, drawBar, hpColor, drawCursor, COL } from '../engine/ui.js';
import { Menu } from '../engine/menu.js';
import { TextBox } from '../engine/textbox.js';
import { state } from '../game/state.js';
import { displayName, heal, fullHeal } from '../game/monster.js';
import { expRatio } from '../game/formulas.js';

const W = Screen.W;
const H = Screen.H;

/**
 * 手持ち画面。
 * mode:
 *   'view'        … メニューから開いた（つよさをみる／いれかえ）
 *   'switch'      … バトル中の交代（キャンセル可）
 *   'forceSwitch' … ひんし後の交代（キャンセル不可）
 *   'item'        … どうぐの使用対象を選ぶ
 *   'pick'        … 1匹えらんで index を返すだけ（交換・そだてや など）
 */
export class PartyScene {
  constructor({ mode = 'view', exclude = null, item = null, accept = null, reject = '' } = {}) {
    this.mode = mode;
    this.exclude = exclude;
    this.item = item;
    this.accept = accept;      // (mon) => boolean。えらべる相手を絞るとき
    this.reject = reject;      // 絞りに外れたときのセリフ
    this.index = 0;
    this.sub = null;         // 'action' | 'swap'
    this.actionMenu = null;
    this.swapFrom = null;
    this.box = null;
    this.t = 0;
  }

  enter() { Input.clearEdges(); }

  get party() { return state.party; }
  get current() { return this.party[this.index]; }

  close(result) {
    Scenes.pop(result);
  }

  update() {
    this.t++;

    if (this.box) {
      this.box.update(Input.isDown(BTN.A));
      if (Input.justPressed(BTN.A) && this.box.advance()) {
        this.box = null;
        if (this.pendingClose !== undefined) {
          const r = this.pendingClose;
          this.pendingClose = undefined;
          this.close(r);
        }
      }
      return;
    }

    if (this.sub === 'action') {
      const r = this.actionMenu.update();
      if (r?.type === 'cancel') { this.sub = null; return; }
      if (r?.type === 'select') this.runAction(r.item.id);
      return;
    }

    if (Input.repeated(BTN.UP)) this.index = (this.index + this.party.length - 1) % this.party.length;
    if (Input.repeated(BTN.DOWN)) this.index = (this.index + 1) % this.party.length;

    if (Input.justPressed(BTN.A)) this.onConfirm();
    if (Input.justPressed(BTN.B)) this.onCancel();
  }

  onConfirm() {
    const mon = this.current;

    if (this.mode === 'switch' || this.mode === 'forceSwitch') {
      if (mon.curHP <= 0) { this.say(`${displayName(mon)}は たたかえない！`); return; }
      if (mon === this.exclude) { this.say(`${displayName(mon)}は すでに たたかっている！`); return; }
      this.close(this.index);
      return;
    }

    if (this.mode === 'item') {
      this.useItem(mon);
      return;
    }

    if (this.mode === 'pick') {
      if (this.accept && !this.accept(mon)) { this.say(this.reject || 'それは えらべない。'); return; }
      this.close(this.index);
      return;
    }

    // view: 行動メニュー
    if (this.swapFrom !== null) {
      const a = this.swapFrom;
      const b = this.index;
      [this.party[a], this.party[b]] = [this.party[b], this.party[a]];
      this.swapFrom = null;
      return;
    }

    this.actionMenu = new Menu(
      [
        { label: 'つよさをみる', id: 'summary' },
        { label: 'いれかえる', id: 'swap' },
        { label: 'なまえ', id: 'nick' },
        { label: 'やめる', id: 'cancel' },
      ],
      { x: 150, y: 108, lineH: 16, colW: 96 },
    );
    this.sub = 'action';
  }

  onCancel() {
    if (this.swapFrom !== null) { this.swapFrom = null; return; }
    if (this.mode === 'forceSwitch') {
      this.say('ポケモンを えらばないと いけない！');
      return;
    }
    this.close(null);
  }

  async runAction(id) {
    this.sub = null;
    if (id === 'swap') { this.swapFrom = this.index; return; }
    if (id === 'summary') {
      const { SummaryScene } = await import('./SummaryScene.js');
      Scenes.push(new SummaryScene({ mon: this.current }));
      return;
    }
    if (id === 'nick') {
      const mon = this.current;
      const { NameScene } = await import('./NameScene.js');
      Scenes.push(new NameScene({
        title: `${mon.species.name}の なまえ`,
        initial: mon.nick ?? '',
        max: 5,
        sprite: mon.species.sprite,
        // 空で決めたら ニックネームを外して種族名に戻す
        onDone: (name) => { mon.nick = name; },
      }));
    }
  }

  /** どうぐを使う。使えたら { used:true } を返して閉じる。 */
  useItem(mon) {
    const it = this.item;
    if (!it?.use) { this.close(null); return; }
    const u = it.use;

    if (u.kind === 'heal') {
      if (mon.curHP <= 0) { this.say(`${displayName(mon)}は ひんしだ！`); return; }
      if (mon.curHP >= mon.stats.hp) { this.say('HPは まんたんだ！'); return; }
      const amount = u.amount === 'full' ? mon.stats.hp : u.amount;
      const got = heal(mon, amount);
      this.sayAndClose(`${displayName(mon)}の HPが ${got} かいふくした！`, { used: true, target: mon });
      return;
    }

    if (u.kind === 'cure') {
      const match = u.status === 'all' ? !!mon.status : mon.status === u.status;
      if (!match) { this.say('それを つかっても いみが なさそうだ。'); return; }
      mon.status = null;
      mon.statusTurns = 0;
      this.sayAndClose(`${displayName(mon)}の じょうたいが なおった！`, { used: true, target: mon });
      return;
    }

    if (u.kind === 'revive') {
      if (mon.curHP > 0) { this.say('それを つかっても いみが なさそうだ。'); return; }
      mon.curHP = Math.max(1, Math.floor(mon.stats.hp * (u.ratio ?? 0.5)));
      this.sayAndClose(`${displayName(mon)}は げんきを とりもどした！`, { used: true, target: mon });
      return;
    }

    if (u.kind === 'evoStone') {
      this.close({ used: false, stone: it, target: mon });
      return;
    }

    this.say('それを つかっても いみが なさそうだ。');
  }

  say(text) {
    this.box = new TextBox({ y: 148, h: 40 });
    this.box.setText(text);
  }

  sayAndClose(text, result) {
    this.say(text);
    this.pendingClose = result;
  }

  // ---- 描画 ----

  render(ctx) {
    ctx.fillStyle = '#384868';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 6) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, y, W, 2);
    }

    this.party.forEach((m, i) => this.renderSlot(ctx, m, i));

    if (this.sub === 'action') {
      drawWindow(ctx, 142, 110, 108, 62);
      this.actionMenu.render(ctx);
    } else if (this.box) {
      this.box.render(ctx);
    } else {
      drawWindow(ctx, 4, 172, 248, 18);
      drawText(ctx, this.hintText(), 12, 176, { color: COL.ink });
    }
  }

  hintText() {
    if (this.swapFrom !== null) return 'いれかえる あいてを えらんでね';
    if (this.mode === 'switch') return 'こうたいする ポケモンを えらんでね';
    if (this.mode === 'forceSwitch') return 'つぎの ポケモンを えらんでね';
    if (this.mode === 'item') return `${this.item?.name}を だれに つかう？`;
    return 'ポケモンを えらんでください';
  }

  /**
   * 先頭は左に大きく、それ以外は右に並べる（本家のレイアウト）。
   * カーソルは枠の外側に出すので、枠は画面端から 10px 空けてある。
   */
  renderSlot(ctx, mon, i) {
    const sel = i === this.index;
    const swapping = this.swapFrom === i;
    const first = i === 0;

    const x = first ? 10 : 88;
    const y = first ? 14 : 8 + (i - 1) * 32;
    const w = first ? 72 : 160;
    const h = first ? 96 : 30;

    drawWindow(ctx, x, y, w, h, {
      fill: swapping ? '#f8e8a0' : COL.paper,
      border: sel ? COL.select : COL.border,
    });

    if (first) {
      drawSprite(ctx, mon.species.sprite, x + 12, y + 4, { scale: 2 });
      drawText(ctx, displayName(mon), x + 6, y + 56, { color: COL.ink });
      drawText(ctx, `Lv${mon.level}`, x + 6, y + 70, { color: COL.ink });
      drawTextRight(ctx, `${mon.curHP}/${mon.stats.hp}`, x + 66, y + 70, { color: COL.ink });
      drawBar(ctx, x + 8, y + 86, 56, mon.curHP / mon.stats.hp, hpColor(mon.curHP, mon.stats.hp));
      if (mon.curHP <= 0) drawText(ctx, 'ひんし', x + 40, y + 56, { color: COL.select });
    } else {
      drawSprite(ctx, mon.species.sprite, x + 2, y + 3, { scale: 1 });
      drawText(ctx, displayName(mon), x + 28, y + 4, { color: COL.ink });
      drawText(ctx, `Lv${mon.level}`, x + 28, y + 17, { color: COL.ink });
      drawBar(ctx, x + 62, y + 21, 50, mon.curHP / mon.stats.hp, hpColor(mon.curHP, mon.stats.hp));
      drawTextRight(ctx, `${mon.curHP}/${mon.stats.hp}`, x + 154, y + 4, { color: COL.ink });
      const tag = mon.curHP <= 0 ? 'ひんし' : mon.status;
      if (tag) drawText(ctx, tag, x + 118, y + 17, { color: COL.select });
    }

    if (sel) drawCursor(ctx, x - 7, y + (first ? 42 : 10), COL.select);
  }
}
