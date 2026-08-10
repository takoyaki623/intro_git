import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextRight } from '../engine/font.js';
import { drawWindow, drawBar, hpColor, drawCursor, COL } from '../engine/ui.js';
import { Menu } from '../engine/menu.js';
import { TextBox } from '../engine/textbox.js';
import { state, bagPocket, addItem, removeItem } from '../game/state.js';
import {
  displayName, fullHeal, knowsMove, learnMove, replaceMove, MAX_MOVES,
  itemUseError, applyItemUse,
} from '../game/monster.js';
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
 *   'giveHold'    … バッグから「もたせる」相手を選ぶ（フィールドのみ）
 *   'pick'        … 1匹えらんで index を返すだけ（交換・そだてや など）
 *
 * selectOnly: true のとき、'item' は対象を選ぶだけで効果を適用しない
 * （バトル中の1手として battle.js 側で適用するため。HPバーの表示ズレを防ぐ）。
 */
export class PartyScene {
  constructor({
    mode = 'view', exclude = null, item = null, accept = null, reject = '', selectOnly = false,
  } = {}) {
    this.mode = mode;
    this.exclude = exclude;
    this.item = item;
    this.selectOnly = selectOnly;
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

    if (this.sub === 'hold') {
      const r = this.holdMenu.update();
      if (r?.type === 'cancel') { this.sub = null; return; }
      if (r?.type === 'select') this.applyHold(r.item.id);
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

    if (this.mode === 'giveHold') {
      if (mon.curHP <= 0 && !this.item.hold) { this.say(`${displayName(mon)}は たたかえない！`); return; }
      const it = this.item;
      if (mon.held) addItem(mon.held, 1);
      removeItem(it.name, 1);
      mon.held = it.name;
      this.sayAndClose(`${displayName(mon)}に ${it.name}を もたせた！`, { held: true });
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
        { label: 'どうぐ', id: 'hold' },
        { label: 'なまえ', id: 'nick' },
        { label: 'やめる', id: 'cancel' },
      ],
      { x: 150, y: 100, lineH: 15, colW: 96 },
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
    if (id === 'hold') { this.openHoldMenu(); return; }
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

  /** もちものメニューを開く。手持ちの もちもの＋（持っていれば）はずす、を並べる。 */
  openHoldMenu() {
    const mon = this.current;
    const options = bagPocket('もちもの').map((e) => ({ label: `${e.item.name} ×${e.n}`, id: e.item.name }));
    if (mon.held) options.unshift({ label: `はずす（${mon.held}）`, id: '__take' });
    if (!options.length) { this.say('もたせられる どうぐが ない。'); return; }
    options.push({ label: 'やめる', id: '__cancel' });
    const rows = Math.min(4, options.length);
    this.holdMenu = new Menu(options, { x: 16, y: 132, lineH: 15, rows, colW: 224 });
    this.sub = 'hold';
  }

  applyHold(id) {
    this.sub = null;
    if (id === '__cancel') return;
    const mon = this.current;
    if (id === '__take') {
      if (mon.held) {
        addItem(mon.held, 1);
        this.say(`${displayName(mon)}は ${mon.held}を あずけた。`);
        mon.held = null;
      }
      return;
    }
    if (mon.held) addItem(mon.held, 1);
    removeItem(id, 1);
    mon.held = id;
    this.say(`${displayName(mon)}に ${id}を もたせた！`);
  }

  /** どうぐを使う。使えたら { used:true } を返して閉じる。 */
  useItem(mon) {
    const it = this.item;
    if (!it?.use) { this.close(null); return; }
    const u = it.use;

    if (u.kind === 'tm') {
      this.teachMove(mon, u.move);
      return;
    }

    if (u.kind === 'evoStone') {
      this.close({ used: false, stone: it, target: mon });
      return;
    }

    // バトル中は対象を選ぶだけ。効果の適用はターンの実行時に battle.js が行う。
    if (this.selectOnly) {
      const err = itemUseError(mon, u);
      if (err) { this.say(err); return; }
      this.close({ used: true, target: mon });
      return;
    }

    const r = applyItemUse(mon, u);
    if (!r.ok) { this.say(r.message); return; }
    this.sayAndClose(r.message, { used: true, target: mon });
  }

  /** わざマシン。使っても無くならないので used は返さない。 */
  async teachMove(mon, move) {
    if (!(mon.species.tm ?? []).includes(move)) {
      this.say(`${displayName(mon)}には あわないようだ。`);
      return;
    }
    if (knowsMove(mon, move)) {
      this.say(`${displayName(mon)}は すでに ${move}を おぼえている！`);
      return;
    }
    if (mon.moves.length < MAX_MOVES) {
      learnMove(mon, move);
      this.say(`${displayName(mon)}は ${move}を おぼえた！`);
      return;
    }

    // 4つ埋まっている。忘れる技を選ばせる。
    this.pendingTm = { mon, move };
    const { ForgetScene } = await import('./ForgetScene.js');
    Scenes.push(new ForgetScene({ mon, newMove: move }));
  }

  /** サブ画面から戻ってきた（いまのところ わざマシンの技えらびだけ） */
  resume(result) {
    Input.clearEdges();
    const tm = this.pendingTm;
    this.pendingTm = null;
    if (!tm) return;

    if (result === null || result === undefined) {
      this.say(`${displayName(tm.mon)}は ${tm.move}を おぼえられなかった！`);
      return;
    }
    const old = tm.mon.moves[result].id;
    replaceMove(tm.mon, result, tm.move);
    this.say(`${displayName(tm.mon)}は ${old}を わすれて ${tm.move}を おぼえた！`);
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
      drawWindow(ctx, 142, 92, 108, 84);
      this.actionMenu.render(ctx);
    } else if (this.sub === 'hold') {
      drawWindow(ctx, 8, 126, 240, this.holdMenu.visibleRows * 15 + 12);
      this.holdMenu.render(ctx);
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
    if (this.mode === 'giveHold') return `${this.item?.name}を だれに もたせる？`;
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
