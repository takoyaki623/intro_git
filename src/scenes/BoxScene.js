import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextRight } from '../engine/font.js';
import { drawWindow, drawBar, hpColor, COL } from '../engine/ui.js';
import { Menu } from '../engine/menu.js';
import { SE } from '../core/audio.js';
import { TextBox } from '../engine/textbox.js';
import { state, BOX_SIZE, PARTY_MAX, registerCaught } from '../game/state.js';
import { displayName, evolutionTarget, evolve, movesLearnedAt, MAX_MOVES } from '../game/monster.js';
import { getSpecies } from '../data/species.js';
import { getMove } from '../data/moves.js';

const W = Screen.W;
const H = Screen.H;
const COLS = 6;
const ROWS = 5;
const CELL_W = 20;   // マスの見た目の大きさ
const CELL_H = 20;
const STEP_X = 41;   // マスの間隔（6列が枠内に均等に収まる幅）
const STEP_Y = 21;
const GX = 15;
const GY = 46;

/**
 * ポケモンをあずけるボックス。
 * 上のグリッドがボックス、下の帯が手持ち。A でつかんで、A でおく。
 */
export class BoxScene {
  constructor({ onClose = null } = {}) {
    this.onClose = onClose;
    this.boxIndex = 0;
    this.area = 'box';     // 'box' | 'party'
    this.cursor = 0;
    this.held = null;      // { mon, from:{area, box, index} }
    this.box = null;
  }

  enter() { Input.clearEdges(); }
  exit() { this.onClose?.(); }

  get currentBox() { return state.boxes[this.boxIndex]; }

  /** 空きを詰めて、レベルの高い順にならべる */
  sortBox() {
    const box = this.currentBox;
    const mons = box.filter(Boolean).sort((a, b) => b.level - a.level || a.species.id - b.species.id);
    for (let i = 0; i < box.length; i++) box[i] = mons[i] ?? null;
    SE.select();
    this.say('ボックスを ならべかえた！');
  }

  /** にがす。手持ちの最後の1匹だけは にがせない。 */
  askRelease() {
    const mon = this.slotMon();
    if (!mon) return;
    if (this.area === 'party' && state.party.length <= 1) {
      this.say('さいごの 1ぴきは にがせない！');
      return;
    }
    this.pendingRelease = mon;
    this.confirm = new Menu(['いいえ', 'はい'], { x: 168, y: 120, lineH: 16, colW: 60 });
    this.say(`${displayName(mon)}を にがしますか？`);
  }

  doRelease() {
    const mon = this.pendingRelease;
    this.pendingRelease = null;
    if (this.area === 'box') this.currentBox[this.cursor] = null;
    else state.party.splice(this.cursor, 1);
    SE.cancel();
    this.say(`${displayName(mon)}を にがしてあげた…`);
  }

  update() {
    if (this.box) {
      this.box.update(Input.isDown(BTN.A));
      // にがす／しんかの確認だけは、本文を読み終えてから はい／いいえ を出す
      if (this.confirm && this.box.waiting) {
        const r = this.confirm.update();
        if (r?.type === 'select') {
          this.confirm = null;
          this.box = null;
          if (this.pendingEvolve) {
            if (r.index === 1) this.doEvolve();
            else this.declineEvolveForever();
          } else if (r.index === 1) this.doRelease();
          else this.pendingRelease = null;
        } else if (r?.type === 'cancel') {
          this.confirm = null;
          this.box = null;
          this.pendingRelease = null;
          this.pendingEvolve = null;
        }
        return;
      }
      if (Input.justPressed(BTN.A) && this.box.advance()) this.box = null;
      return;
    }

    if (Input.justPressed(BTN.B)) {
      if (this.held) { this.returnHeld(); return; }
      Scenes.pop();
      return;
    }

    // START でならべかえ。ボックスが飛び飛びになりやすいので、
    // 「詰める＋レベル順」を1操作でできるようにしておく。
    if (Input.justPressed(BTN.START) && !this.held) { this.sortBox(); return; }
    // RUN（Shift）で にがす。誤爆しないよう確認を挟む。
    if (Input.justPressed(BTN.RUN) && !this.held) { this.askRelease(); return; }

    this.moveCursor();

    if (Input.justPressed(BTN.A)) this.onConfirm();
  }

  moveCursor() {
    if (this.area === 'box') {
      if (Input.repeated(BTN.LEFT)) this.cursor = (this.cursor + BOX_SIZE - 1) % BOX_SIZE;
      if (Input.repeated(BTN.RIGHT)) this.cursor = (this.cursor + 1) % BOX_SIZE;
      if (Input.repeated(BTN.UP)) {
        if (this.cursor < COLS) { this.boxIndex = (this.boxIndex + state.boxes.length - 1) % state.boxes.length; }
        else this.cursor -= COLS;
      }
      if (Input.repeated(BTN.DOWN)) {
        if (this.cursor >= BOX_SIZE - COLS) { this.area = 'party'; this.cursor = 0; }
        else this.cursor += COLS;
      }
      return;
    }

    const n = Math.max(1, state.party.length);
    if (Input.repeated(BTN.LEFT)) this.cursor = (this.cursor + n - 1) % n;
    if (Input.repeated(BTN.RIGHT)) this.cursor = (this.cursor + 1) % n;
    if (Input.repeated(BTN.UP)) { this.area = 'box'; this.cursor = BOX_SIZE - COLS; }
  }

  slotMon() {
    if (this.area === 'box') return this.currentBox[this.cursor];
    return state.party[this.cursor] ?? null;
  }

  onConfirm() {
    if (!this.held) {
      const mon = this.slotMon();
      if (!mon) return;
      // かつて Bでキャンセルした進化が残っていれば、つかむより先にここで聞く（S-2）
      if (mon.evoDeclined && !mon.evoLocked && evolutionTarget(mon, 'level')) {
        this.askEvolve(mon);
        return;
      }
      // 手持ちが1匹だけのときは連れ出せない
      if (this.area === 'party' && state.party.length <= 1) {
        this.say('さいごの １ぴきは あずけられない！');
        return;
      }
      this.held = { mon, from: { area: this.area, box: this.boxIndex, index: this.cursor } };
      if (this.area === 'box') this.currentBox[this.cursor] = null;
      else state.party.splice(this.cursor, 1);
      return;
    }

    this.place();
  }

  /** 進化のやり直し（S-2）。ここで また断ると、もう二度と進化しなくなる。 */
  askEvolve(mon) {
    this.pendingEvolve = mon;
    this.confirm = new Menu(['いいえ', 'はい'], { x: 168, y: 120, lineH: 16, colW: 60 });
    this.say(`${displayName(mon)}を しんかさせますか？`);
  }

  doEvolve() {
    const mon = this.pendingEvolve;
    this.pendingEvolve = null;
    const toId = evolutionTarget(mon, 'level');
    const before = displayName(mon);
    const after = getSpecies(toId);
    if (!toId || !after) return;

    evolve(mon, toId);
    mon.evoDeclined = false;
    mon.evoLocked = false;
    registerCaught(toId);
    for (const name of movesLearnedAt(mon.species, mon.level)) {
      if (mon.moves.length >= MAX_MOVES) break;
      if (mon.moves.some((mv) => mv.id === name)) continue;
      const def = getMove(name);
      if (def) mon.moves.push({ id: name, pp: def.pp, maxPp: def.pp });
    }
    SE.select();
    this.say(`おめでとう！ ${before}は ${after.name}に しんかした！`);
  }

  declineEvolveForever() {
    const mon = this.pendingEvolve;
    this.pendingEvolve = null;
    mon.evoLocked = true;
    SE.cancel();
    this.say(`${displayName(mon)}は もう しんかしない ようだ…`);
  }

  place() {
    const { mon } = this.held;

    if (this.area === 'box') {
      const target = this.currentBox[this.cursor];
      this.currentBox[this.cursor] = mon;
      this.held = null;
      if (target) {
        // 入れ替え: どいた側をそのまま持ち直す
        this.held = { mon: target, from: { area: 'box', box: this.boxIndex, index: this.cursor } };
      }
      return;
    }

    if (state.party.length >= PARTY_MAX) {
      this.say('てもちが いっぱいだ！');
      return;
    }
    state.party.splice(Math.min(this.cursor, state.party.length), 0, mon);
    this.held = null;
  }

  /** 持っているのを元の場所へ戻す */
  returnHeld() {
    const { mon, from } = this.held;
    if (from.area === 'box') state.boxes[from.box][from.index] = mon;
    else state.party.splice(Math.min(from.index, state.party.length), 0, mon);
    this.held = null;
  }

  say(text) {
    this.box = new TextBox({ y: 148, h: 40 });
    this.box.setText(text);
  }

  // ---- 描画 ----

  render(ctx) {
    ctx.fillStyle = '#2c3c5c';
    ctx.fillRect(0, 0, W, H);

    // ヘッダー: 1行目にボックス名と残量、2行目に選択中の個体と操作ヒント
    drawWindow(ctx, 4, 4, 248, 36);
    drawText(ctx, `ボックス ${this.boxIndex + 1}`, 12, 8, { color: COL.ink });
    const used = this.currentBox.filter(Boolean).length;
    drawTextRight(ctx, `${used}/${BOX_SIZE}`, 244, 8, { color: COL.ink });

    const shown = this.held?.mon ?? this.slotMon();
    drawText(ctx, shown ? `${displayName(shown)}  Lv${shown.level}` : '', 12, 22, { color: COL.ink });
    drawTextRight(ctx, this.held ? 'A：おく  B：もどす' : 'A：つかむ  C：ならべる  Shift：にがす', 244, 22, {
      color: COL.inkLight,
    });

    // グリッド
    drawWindow(ctx, 4, 42, 248, 110);
    for (let i = 0; i < BOX_SIZE; i++) {
      const { x, y } = this.boxCell(i);
      const mon = this.currentBox[i];
      const sel = this.area === 'box' && this.cursor === i && !this.held;

      ctx.fillStyle = sel ? 'rgba(224,64,48,0.30)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, y, CELL_W, CELL_H);
      if (mon) drawSprite(ctx, mon.species.sprite, x - 2, y - 2, { scale: 1 });
    }

    // 手持ち
    drawWindow(ctx, 4, 154, 248, 34);
    for (let i = 0; i < PARTY_MAX; i++) {
      const { x, y } = this.partyCell(i);
      const mon = state.party[i];
      const sel = this.area === 'party' && this.cursor === i && !this.held;

      ctx.fillStyle = sel ? 'rgba(224,64,48,0.30)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, y, 34, 28);
      if (!mon) continue;
      drawSprite(ctx, mon.species.sprite, x + 5, y, { scale: 1 });
      drawBar(ctx, x + 5, y + 25, 24, mon.curHP / mon.stats.hp,
        hpColor(mon.curHP, mon.stats.hp), { h: 2, frame: false });
    }

    // 持っている個体はカーソルの上に浮かせる
    if (this.held) {
      const p = this.cursorPixel();
      ctx.fillStyle = 'rgba(224,64,48,0.45)';
      ctx.fillRect(p.x, p.y, CELL_W, CELL_H);
      drawSprite(ctx, this.held.mon.species.sprite, p.x - 2, p.y - 10, { scale: 1 });
    }

    if (this.box) this.box.render(ctx);
    if (this.confirm && this.box?.waiting) {
      drawWindow(ctx, 160, 112, 72, 46);
      this.confirm.render(ctx);
    }
  }

  boxCell(i) {
    return {
      x: GX + (i % COLS) * STEP_X,
      y: GY + Math.floor(i / COLS) * STEP_Y,
    };
  }

  partyCell(i) {
    return { x: 12 + i * 39, y: 158 };
  }

  cursorPixel() {
    return this.area === 'box' ? this.boxCell(this.cursor) : this.partyCell(this.cursor);
  }
}
