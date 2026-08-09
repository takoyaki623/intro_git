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
        { label: 'レポート', id: 'save' },
        { label: 'せってい', id: 'settings' },
        { label: 'とじる', id: 'close' },
      ],
      { x: 164, y: 12, lineH: 17, colW: 84 },
    );
  }

  enter() { Input.clearEdges(); }
  exit() { this.onClose?.(); }

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
      this.trySave();
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
    if (id === 'settings') {
      const { SettingsScene } = await import('./SettingsScene.js');
      Scenes.push(new SettingsScene());
    }
  }

  trySave() {
    const ok = save();
    if (ok) SE.save();
    this.box = new TextBox();
    this.box.setText(ok
      ? `${state.player.name}は レポートを かきおわった！`
      : 'レポートを かけませんでした… ブラウザの せっていを かくにんしてね。');
    this.closeAfterBox = ok;
  }

  resume() { Input.clearEdges(); }

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
