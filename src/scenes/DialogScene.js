import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { TextBox } from '../engine/textbox.js';
import { Menu } from '../engine/menu.js';
import { drawWindow } from '../engine/ui.js';
import {
  state, getFlag, setFlag, addItem, healParty, addMonster, registerCaught, PARTY_MAX,
  autoSave,
} from '../game/state.js';
import { createMonster, displayName } from '../game/monster.js';
import { getSpecies } from '../data/species.js';
import { RIVAL_STARTER } from '../data/rival.js';
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
 *   { chooseStarter:[722,4,258] }
 *   { shop:['モンスターボール','きずぐすり'] }
 *   { trade:{ want:10, give:1, lv:8, nick:null, flag:'trade_bulba' } }
 *   { daycare:true }
 *   { tower:true }
 *
 * パーサを書かずに済むよう、素の JS の値をそのまま解釈する。
 */
export class DialogScene {
  constructor({ lines, npc = null, onClose = null, field = null }) {
    this.transparent = true;
    this.queue = [...(Array.isArray(lines) ? lines : [lines])];
    this.npc = npc;
    this.onClose = onClose;
    this.field = field;      // { surf } / { fish } を実行してもらう相手
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
    // なみのり・つりは、会話枠が消えてから始める
    const run = this.pendingField;
    this.pendingField = null;
    run?.();
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
        // ここまでは確実、と言える地点なのでオートセーブする
        autoSave();
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
      if (cmd.nameRival) {
        this.startNameRival();
        return;
      }
      if (cmd.shop) {
        this.openShop(cmd.shop);
        return;
      }
      if (cmd.trade) {
        this.startTrade(cmd.trade);
        return;
      }
      if (cmd.daycare) {
        this.daycare();
        return;
      }
      if (cmd.takeBack) {
        this.takeBack();
        continue;
      }
      // 地形がらみは FieldScene が持っている。会話を閉じてから実行する。
      if (cmd.surf) {
        this.pendingField = () => this.field?.doSurf();
        continue;
      }
      if (cmd.fish) {
        this.pendingField = () => this.field?.fish();
        continue;
      }
      if (cmd.tower) {
        this.pendingField = () => this.field?.startTowerChallenge();
        continue;
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
        setFlag(`starter_${id}`);
        addItem('モンスターボール', 5);
        addItem('きずぐすり', 3);
        state.player.rivalStarter = RIVAL_STARTER[id] ?? null;
        this.queue.unshift(
          `${mon.species.name}を てにいれた！`,
          'それから モンスターボールを ５こ もらった。',
          'きたの １ばんどうろで くさむらに はいって みなさい。',
          'やせいの ポケモンが とびだしてくるぞ！',
          { nameRival: true },
        );
      },
    }));
  }

  /** ライバルの名前をきく。御三家を選んだ直後、1度だけ。 */
  async startNameRival() {
    const { NameScene } = await import('./NameScene.js');
    Scenes.push(new NameScene({
      title: 'ライバルの なまえは？',
      initial: 'シゲル',
      max: 5,
      onDone: (name) => {
        state.player.rivalName = name || 'シゲル';
      },
    }));
  }

  async openShop(stock) {
    const { ShopScene } = await import('./ShopScene.js');
    Scenes.push(new ShopScene({ stock }));
  }

  /**
   * ポケモン交換。want の種族を1匹わたすと give の種族が来る。
   * 一度きり（flag）。交換で来た子は、こちらの手持ちの空いた場所に入る。
   */
  async startTrade(t) {
    const want = getSpecies(t.want);
    const give = getSpecies(t.give);
    if (!want || !give) { this.next(); return; }

    if (!state.party.some((m) => m.species.id === t.want)) {
      this.queue.unshift(`${want.name}を つれてきたら こえを かけてくれ！`);
      this.next();
      return;
    }

    const { PartyScene } = await import('./PartyScene.js');
    this.pendingTrade = t;
    Scenes.push(new PartyScene({
      mode: 'pick',
      accept: (m) => m.species.id === t.want,
      reject: `それは ${want.name}じゃないよ。`,
    }));
  }

  /**
   * そだてや。あずける／ひきとる の入口。
   * 一度に1匹だけ。手持ちが1匹しかいないときは あずけられない。
   */
  async daycare() {
    const dc = state.daycare;

    if (dc) {
      const grew = dc.mon.level - dc.startLv;
      const fee = Math.max(100, grew * 100);
      this.queue.unshift(
        `${displayName(dc.mon)}は レベル ${dc.mon.level}に なっているよ。`,
        `ひきとるなら ${fee}円 だけど どうする？`,
        {
          ask: true,
          yes: [{ takeBack: true }],
          no: ['じゃあ もう すこし あずかっておくよ。'],
        },
      );
      this.next();
      return;
    }

    if (state.party.length <= 1) {
      this.queue.unshift('てもちが 1ひきだけじゃ あずかれないよ。');
      this.next();
      return;
    }

    this.queue.unshift('どの ポケモンを あずける？');
    this.pendingDaycare = true;
    const { PartyScene } = await import('./PartyScene.js');
    Scenes.push(new PartyScene({ mode: 'pick' }));
  }

  /** 手持ち画面から戻ってきて あずける */
  finishDaycare(index) {
    this.pendingDaycare = false;
    if (index === null || index === undefined) {
      this.queue.unshift('また いつでも どうぞ。');
      return;
    }
    const mon = state.party.splice(index, 1)[0];
    state.daycare = { mon, steps: 0, startLv: mon.level };
    this.queue.unshift(
      `${displayName(mon)}を あずかったよ。`,
      'あるいた ぶんだけ そだてておくからね。',
    );
  }

  /** ひきとる */
  takeBack() {
    const dc = state.daycare;
    if (!dc) return;
    const fee = Math.max(100, (dc.mon.level - dc.startLv) * 100);
    if (state.player.money < fee) {
      this.queue.unshift('おかねが たりないみたいだね。');
      return;
    }
    if (state.party.length >= PARTY_MAX) {
      this.queue.unshift('てもちが いっぱいだよ。');
      return;
    }
    state.player.money -= fee;
    state.party.push(dc.mon);
    state.daycare = null;
    SE.select();
    this.queue.unshift(`${displayName(dc.mon)}が かえってきた！`);
  }

  /** 手持ち画面から戻ってきて、実際に入れ替える */
  finishTrade(index) {
    const t = this.pendingTrade;
    this.pendingTrade = null;
    if (index === null || index === undefined) {
      this.queue.unshift('また きてくれ！');
      return;
    }

    const sent = state.party[index];
    const got = createMonster(t.give, t.lv ?? sent.level, {
      rng,
      nick: t.nick ?? null,
      metMap: state.player.pos.map,
    });
    state.party[index] = got;
    registerCaught(t.give);
    if (t.flag) setFlag(t.flag);
    SE.caught();

    this.queue.unshift(
      `${displayName(sent)}と ${got.species.name}を こうかんした！`,
      'たいせつに してあげてね！',
    );
  }

  /** サブシーンから戻ってきた */
  resume(result) {
    Input.clearEdges();
    if (this.pendingTrade) this.finishTrade(result);
    else if (this.pendingDaycare) this.finishDaycare(result);
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
