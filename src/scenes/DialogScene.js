import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { TextBox } from '../engine/textbox.js';
import { Menu } from '../engine/menu.js';
import { drawWindow } from '../engine/ui.js';
import { state, getFlag, setFlag, addItem, healParty, addMonster, registerCaught } from '../game/state.js';
import { createMonster } from '../game/monster.js';
import { rng } from '../core/rng.js';
import { SE } from '../core/audio.js';

/**
 * 会話。lines は文字列かコマンドオブジェクトの配列。
 *
 *   'ふつうの セリフ'
 *   { if:'gotStarter', then:[...], else:[...] }
 *   { ask:true, yes:[...], no:[...] }
 *   { heal:true }
 *   { give:'モンスターボール', n:5 }
 *   { flag:'gotStarter' }
 *   { chooseStarter:[1,4,7] }
 *
 * パーサを書かずに済むよう、素の JS の値をそのまま解釈する。
 */
export class DialogScene {
  constructor({ lines, npc = null, onClose = null }) {
    this.transparent = true;
    this.queue = [...(Array.isArray(lines) ? lines : [lines])];
    this.npc = npc;
    this.onClose = onClose;
    this.box = new TextBox();
    this.menu = null;
    this.mode = 'text';
  }

  enter() {
    Input.clearEdges();
    this.next();
  }

  exit() {
    this.onClose?.();
  }

  close() {
    Scenes.pop();
  }

  /** キューの先頭を処理する */
  next() {
    while (this.queue.length) {
      const cmd = this.queue.shift();

      if (typeof cmd === 'string') {
        this.box.setText(cmd);
        this.mode = 'text';
        return;
      }
      if (!cmd || typeof cmd !== 'object') continue;

      if (cmd.if !== undefined) {
        const branch = getFlag(cmd.if) ? cmd.then : cmd.else;
        this.queue.unshift(...(branch ?? []));
        continue;
      }
      if (cmd.ask) {
        this.pendingAsk = cmd;
        this.menu = new Menu(['はい', 'いいえ'], { x: 186, y: 108, lineH: 16, colW: 60 });
        this.mode = 'ask';
        return;
      }
      if (cmd.heal) {
        healParty();
        SE.heal();
        continue;
      }
      if (cmd.give) {
        addItem(cmd.give, cmd.n ?? 1);
        this.queue.unshift(`${state.player.name}は ${cmd.give}を ${cmd.n ?? 1}こ てにいれた！`);
        continue;
      }
      if (cmd.flag) {
        setFlag(cmd.flag, cmd.value ?? true);
        continue;
      }
      if (cmd.chooseStarter) {
        this.startStarterChoice(cmd.chooseStarter);
        return;
      }
    }
    this.close();
  }

  // ---- 御三家えらび ----

  async startStarterChoice(ids) {
    const { StarterScene } = await import('./StarterScene.js');
    Scenes.push(new StarterScene({
      ids,
      onPick: (id) => {
        const mon = createMonster(id, 5, { rng, metMap: state.player.pos.map });
        addMonster(mon);
        registerCaught(id);
        setFlag('gotStarter');
        addItem('モンスターボール', 5);
        addItem('きずぐすり', 3);
        this.queue.unshift(
          `${mon.species.name}を てにいれた！`,
          'それから モンスターボールを ５こ もらった。',
          'きたの １ばんどうろで くさむらに はいって みなさい。',
          'やせいの ポケモンが とびだしてくるぞ！',
        );
      },
    }));
  }

  /** サブシーンから戻ってきた */
  resume() {
    Input.clearEdges();
    this.next();
  }

  update() {
    if (this.mode === 'ask') {
      const r = this.menu.update();
      if (!r) return;
      const cmd = this.pendingAsk;
      const branch = r.type === 'select' && r.index === 0 ? cmd.yes : cmd.no;
      this.pendingAsk = null;
      this.menu = null;
      this.queue.unshift(...(branch ?? []));
      this.next();
      return;
    }

    this.box.update(Input.isDown(BTN.A));
    if (Input.justPressed(BTN.A)) {
      if (this.box.advance()) this.next();
    }
  }

  render(ctx) {
    if (this.mode === 'ask') {
      drawWindow(ctx, 178, 100, 72, 46);
      this.menu.render(ctx);
    }
    this.box.render(ctx);
  }
}
