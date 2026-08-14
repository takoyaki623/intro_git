import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { SE } from '../core/audio.js';
import { drawText } from '../engine/font.js';
import { drawWindow, COL } from '../engine/ui.js';
import { Menu } from '../engine/menu.js';
import { TextBox } from '../engine/textbox.js';
import { state, save, playTimeText, getFlag } from '../game/state.js';
import { BADGES, badgeFlag } from '../data/trainers.js';
import { objective } from '../game/objective.js';

const W = Screen.W;
const H = Screen.H;

/** フィールドのメインメニュー。 */
export class MenuScene {
  constructor({ onClose = null } = {}) {
    this.transparent = true;
    this.onClose = onClose;
    this.box = null;
    this.menu = new Menu(
      [
        { label: 'ポケモン', id: 'party', disabled: state.party.length === 0 },
        { label: 'バッグ', id: 'bag' },
        { label: 'ずかん', id: 'dex' },
        { label: 'カード', id: 'card' },
        { label: 'めもちょう', id: 'note' },
        // いわバッジを取るまでは並べない（取れば増える、が分かりやすい）
        ...(getFlag(badgeFlag('iwa')) ? [{ label: 'そらをとぶ', id: 'fly' }] : []),
        // 殿堂入りしたことがあるときだけ出す（Phase Z-2）
        ...(getFlag('hallOfFame') ? [{ label: 'でんどうのま', id: 'hof' }] : []),
        { label: 'レポート', id: 'save' },
        { label: 'せってい', id: 'settings' },
        { label: 'とじる', id: 'close' },
      ],
      { x: 164, y: 12, lineH: 15, colW: 84, rows: 7 },
    );
  }

  enter() { Input.clearEdges(); }
  exit() { this.onClose?.(this.flyTo ?? null, this.escapeRope ?? false); }

  update() {
    if (this.box) {
      this.box.update(Input.isDown(BTN.A));
      if (Input.justPressed(BTN.A) && this.box.advance()) {
        this.box = null;
        if (this.closeAfterBox) Scenes.pop();
      }
      return;
    }

    const r = this.menu.update();
    if (r?.type === 'cancel') { Scenes.pop(); return; }
    if (r?.type === 'select') this.choose(r.item.id);
  }

  async choose(id) {
    if (id === 'close') { Scenes.pop(); return; }

    if (id === 'save') {
      const { SlotScene } = await import('./SlotScene.js');
      this.pendingSave = true;
      Scenes.push(new SlotScene({ mode: 'save' }));
      return;
    }
    if (id === 'party') {
      const { PartyScene } = await import('./PartyScene.js');
      Scenes.push(new PartyScene({ mode: 'view' }));
      return;
    }
    if (id === 'bag') {
      const { BagScene } = await import('./BagScene.js');
      Scenes.push(new BagScene({ mode: 'field' }));
      return;
    }
    if (id === 'dex') {
      const { DexScene } = await import('./DexScene.js');
      Scenes.push(new DexScene());
      return;
    }
    if (id === 'card') {
      const { TrainerCardScene } = await import('./TrainerCardScene.js');
      Scenes.push(new TrainerCardScene());
      return;
    }
    if (id === 'hof') {
      const { HallOfFameRecordScene } = await import('./HallOfFameRecordScene.js');
      Scenes.push(new HallOfFameRecordScene());
      return;
    }
    if (id === 'note') {
      this.box = new TextBox();
      this.box.setText(objective(state));
      return;
    }
    if (id === 'fly') {
      const { FlyScene } = await import('./FlyScene.js');
      Scenes.push(new FlyScene());
      return;
    }
    if (id === 'settings') {
      const { SettingsScene } = await import('./SettingsScene.js');
      Scenes.push(new SettingsScene());
    }
  }

  trySave(slot) {
    const ok = save(slot);
    if (ok) SE.save();
    this.box = new TextBox();
    this.box.setText(ok
      ? `${state.player.name}は レポートを かきおわった！`
      : 'レポートを かけませんでした… ブラウザの せっていを かくにんしてね。');
    this.closeAfterBox = ok;
  }

  /** そらをとぶ から戻ってきたら、行き先を持って自分も閉じる */
  resume(result) {
    Input.clearEdges();
    if (this.pendingSave) {
      this.pendingSave = false;
      if (result !== null && result !== undefined) this.trySave(result);
      return;
    }
    if (result?.map) {
      this.flyTo = result;
      Scenes.pop();
      return;
    }
    if (result?.escape) {
      this.escapeRope = true;
      Scenes.pop();
    }
  }

  render(ctx) {
    // 右上に小さく情報、右にメニュー
    drawWindow(ctx, 158, 8, 92, 108);
    this.menu.render(ctx);

    drawWindow(ctx, 158, 120, 92, 62);
    drawText(ctx, state.player.name, 166, 125, { color: COL.ink });
    drawText(ctx, `おかね ${state.player.money}`, 166, 138, { color: COL.ink });
    drawText(ctx, `じかん ${playTimeText()}`, 166, 151, { color: COL.ink });
    drawText(ctx, 'バッジ', 166, 165, { color: COL.inkLight });
    this.renderBadges(ctx, 206, 165);

    if (this.box) this.box.render(ctx);
  }

  /** 集めたバッジ。未取得は枠だけにして「あと何個あるか」も見えるようにする。 */
  renderBadges(ctx, x, y) {
    BADGES.forEach((b, i) => {
      const bx = x + i * 12;
      const got = getFlag(badgeFlag(b.id));
      ctx.fillStyle = COL.ink;
      ctx.fillRect(bx, y, 10, 10);
      ctx.fillStyle = got ? b.color : COL.paper;
      ctx.fillRect(bx + 1, y + 1, 8, 8);
      if (got) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx + 3, y + 3, 2, 2);
      }
    });
  }
}
