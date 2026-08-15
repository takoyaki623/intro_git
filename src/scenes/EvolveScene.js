import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { SE } from '../core/audio.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawTextCentered } from '../engine/font.js';
import { fillScreen } from '../engine/ui.js';
import { TextBox } from '../engine/textbox.js';
import { getSpecies } from '../data/species.js';
import { displayName, evolve, movesLearnedAt, learnMove, knowsMove, MAX_MOVES } from '../game/monster.js';
import { registerCaught } from '../game/state.js';

const W = Screen.W;
const H = Screen.H;
const LEN = 190;

/**
 * フィールドからの進化（いしを使ったとき）。
 * バトル中の進化は BattleScene が同じ演出を内側で持つ。
 */
export class EvolveScene {
  constructor({ mon, toId, onDone = null }) {
    this.mon = mon;
    this.from = mon.species;
    this.to = getSpecies(toId);
    this.toId = toId;
    this.onDone = onDone;
    this.beforeName = displayName(mon);
    this.box = new TextBox();
    this.t = 0;
    this.phase = 'intro';
    this.cancelled = false;
  }

  enter() {
    Input.clearEdges();
    this.box.setText(`おや…？ ${this.beforeName}の ようすが…！`);
  }

  update() {
    if (this.phase === 'intro') {
      this.box.update(Input.isDown(BTN.A));
      if (Input.justPressed(BTN.A) && this.box.advance()) {
        this.phase = 'anim';
        this.t = 0;
        this.box.setText('');
        SE.evolve();
      }
      return;
    }

    if (this.phase === 'anim') {
      this.t++;
      if (Input.justPressed(BTN.B)) {
        this.cancelled = true;
        this.phase = 'done';
        this.box.setText(`あれ？ ${this.beforeName}の ようすが…！`);
        return;
      }
      if (this.t >= LEN) {
        evolve(this.mon, this.toId);
        this.mon.evoDeclined = false;
        this.mon.evoLocked = false;
        registerCaught(this.toId);
        // 進化先が同じレベルで覚える技は、空きがあるぶんだけ自動で拾う
        for (const mv of movesLearnedAt(this.mon.species, this.mon.level)) {
          if (!knowsMove(this.mon, mv) && this.mon.moves.length < MAX_MOVES) learnMove(this.mon, mv);
        }
        this.phase = 'done';
        this.box.setText(`おめでとう！ ${this.beforeName}は ${this.to.name}に しんかした！`);
      }
      return;
    }

    this.box.update(Input.isDown(BTN.A));
    if (Input.justPressed(BTN.A) && this.box.advance()) {
      Scenes.pop({ evolved: !this.cancelled });
      this.onDone?.(!this.cancelled);
    }
  }

  render(ctx) {
    fillScreen(ctx, '#101018', 1);

    let sp = this.from;
    let white = false;

    if (this.phase === 'anim') {
      const r = this.t / LEN;
      // 進むほど速く点滅させる。終盤は白シルエットのまま新しい姿へ寄せる。
      const freq = Math.max(3, Math.round(16 - r * 14));
      sp = Math.floor(this.t / freq) % 2 === 1 ? this.to : this.from;
      white = r < 0.9;
    } else if (this.phase === 'done' && !this.cancelled) {
      sp = this.to;
    }

    drawSprite(ctx, sp.sprite, W / 2 - 36, 40, { scale: 3, flash: white });

    if (this.phase === 'anim' && this.t < LEN * 0.85) {
      drawTextCentered(ctx, 'B ： しんかを ストップ', W / 2, 130, {
        color: '#ffffff', shadow: '#303050',
      });
    }

    if (this.phase !== 'anim') this.box.render(ctx);
  }
}
