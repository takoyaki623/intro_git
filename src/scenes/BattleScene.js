import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { rng } from '../core/rng.js';
import { SE } from '../core/audio.js';
import * as Music from '../core/music.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextRight, drawTextCentered } from '../engine/font.js';
import {
  drawWindow, drawBar, drawCursor, hpColor, fillScreen, drawTypeTag, COL,
} from '../engine/ui.js';
import { TextBox } from '../engine/textbox.js';
import { Menu } from '../engine/menu.js';
import { TYPE_COLOR } from '../data/types.js';
import { getMove } from '../data/moves.js';
import { wildBattle, trainerBattle } from '../game/battle.js';
import { displayName, resetBattleState } from '../game/monster.js';
import { expRatio, STAT_LABEL } from '../game/formulas.js';
import { state } from '../game/state.js';

const W = Screen.W;
const H = Screen.H;

// レイアウト
const FOE_X = 168, FOE_Y = 26, FOE_SCALE = 2;
const MINE_X = 26, MINE_Y = 74, MINE_SCALE = 2.5;
const BOX_Y = 148;

export class BattleScene {
  /**
   * 野生戦は { foe } だけ。
   * トレーナー戦は { trainer, trainerId, foeParty } を渡す（foe は先頭が使われる）。
   */
  constructor({ foe, wild = true, trainer = null, trainerId = null, foeParty = null }) {
    this.ctx = {
      mine: state.party.find((m) => m.curHP > 0) ?? state.party[0],
      foe: foe ?? foeParty?.[0],
      rng,
      isWild: wild && !trainer,
      trainer,
      trainerId,
      foeParty,
      runAttempts: 0,
      onSwitch: (m) => { this.dispHP.mine = m.curHP; this.dispExp = expRatio(m); },
      onFoeSwitch: (m) => { this.dispHP.foe = m.curHP; },
    };
    foe = this.ctx.foe;

    this.box = new TextBox();
    this.mode = 'run';          // run | msg | command | moveSelect | statPanel | anim | tween | sub
    this.pending = null;
    this.result = null;

    this.dispHP = { mine: this.ctx.mine.curHP, foe: foe.curHP };
    this.dispExp = expRatio(this.ctx.mine);

    this.commandMenu = new Menu(['たたかう', 'バッグ', 'ポケモン', 'にげる'], {
      cols: 2, x: 138, y: BOX_Y + 8, lineH: 16, colW: 58,
    });
    this.moveMenu = null;

    // 演出用
    this.anim = null;
    this.shake = 0;
    this.flash = { mine: 0, foe: 0 };
    this.spriteOffset = { mine: 0, foe: 0 };
    this.faintClip = { mine: null, foe: null };
    this.hidden = { mine: true, foe: true };
    this.ball = null;
    this.evolveState = null;
    this.statPanel = null;
    this.t = 0;
  }

  enter() {
    Input.clearEdges();
    Music.play(this.ctx.trainer ? 'trainer' : 'battle');
    this.gen = this.ctx.trainer ? trainerBattle(this.ctx) : wildBattle(this.ctx);
    this.advance();
  }

  exit() {
    resetBattleState(this.ctx.mine);
    for (const m of state.party) resetBattleState(m);
  }

  /** ジェネレータを1つ進めて、次のエフェクトを受け取る */
  advance(value) {
    const r = this.gen.next(value);
    if (r.done) {
      this.result = r.value;
      this.finish();
      return;
    }
    this.handle(r.value);
  }

  finish() {
    Scenes.pop(this.result);
  }

  handle(fx) {
    this.pending = fx;

    switch (fx.t) {
      case 'msg':
        this.box.setText(fx.text);
        this.mode = 'msg';
        break;

      case 'command':
        this.commandMenu.index = 0;
        this.mode = 'command';
        break;

      case 'moveSelect':
        this.buildMoveMenu();
        this.mode = 'moveSelect';
        break;

      case 'hpTween':
        this.mode = 'tween';
        this.tweenKind = 'hp';
        this.tweenTimer = 0;
        break;

      case 'expTween':
        this.mode = 'tween';
        this.tweenKind = 'exp';
        this.tweenTimer = 0;
        break;

      case 'statPanel':
        this.statPanel = fx.gain;
        this.mode = 'statPanel';
        break;

      case 'wait':
        this.mode = 'anim';
        this.anim = { kind: 'wait', t: 0, len: fx.frames ?? 20 };
        break;

      case 'anim':
        this.startAnim(fx);
        break;

      case 'party':
      case 'forceSwitch':
        this.openParty(fx.t === 'forceSwitch');
        break;

      case 'bag':
        this.openBag();
        break;

      case 'forgetSelect':
        this.openForget(fx);
        break;

      case 'confirm':
        this.box.setText(fx.text);
        this.confirmMenu = new Menu(['はい', 'いいえ'], {
          x: 186, y: BOX_Y - 40, lineH: 16, colW: 60, index: fx.defaultNo ? 1 : 0,
        });
        this.mode = 'confirm';
        break;

      case 'nickname':
        this.openNaming(fx.mon);
        break;

      default:
        // 知らないエフェクトは黙って飛ばす（エンジンより先にデータが増えても止まらない）
        this.advance();
    }
  }

  buildMoveMenu() {
    const items = this.ctx.mine.moves.map((mv) => {
      const def = getMove(mv.id);
      return { label: mv.id, mv, def, disabled: mv.pp <= 0 };
    });
    this.moveMenu = new Menu(items, { cols: 2, x: 12, y: BOX_Y + 6, lineH: 15, colW: 108 });
  }

  // ---- サブ画面 ----

  async openParty(forced) {
    this.mode = 'sub';
    const { PartyScene } = await import('./PartyScene.js');
    Scenes.push(new PartyScene({
      mode: forced ? 'forceSwitch' : 'switch',
      exclude: this.ctx.mine,
    }));
  }

  async openBag() {
    this.mode = 'sub';
    const { BagScene } = await import('./BagScene.js');
    Scenes.push(new BagScene({ mode: 'battle' }));
  }

  async openForget(fx) {
    this.mode = 'sub';
    const { ForgetScene } = await import('./ForgetScene.js');
    Scenes.push(new ForgetScene({ mon: fx.mon, newMove: fx.newMove }));
  }

  async openNaming(mon) {
    this.mode = 'sub';
    const { NameScene } = await import('./NameScene.js');
    Scenes.push(new NameScene({
      title: `${mon.species.name}の ニックネーム`,
      max: 5,
      sprite: mon.species.sprite,
      // 結果は resume(name) で受ける。onDone は使わない（両方だと二重に進む）
    }));
  }

  /** サブ画面から戻ってきた */
  resume(result) {
    Input.clearEdges();
    const fx = this.pending;

    if (fx?.t === 'party' || fx?.t === 'forceSwitch') {
      // 強制交代でキャンセルされたら選び直させる
      if (fx.t === 'forceSwitch' && (result === null || result === undefined)) {
        this.openParty(true);
        return;
      }
      this.advance(result ?? null);
      return;
    }
    this.advance(result ?? null);
  }

  // ---- 演出 ----

  startAnim(fx) {
    this.mode = 'anim';
    const kind = fx.kind;

    if (kind === 'intro' || kind === 'foeSendOut') {
      this.anim = { kind: 'intro', t: 0, len: 26 };
      this.hidden.foe = false;
      this.faintClip.foe = null;
      this.spriteOffset.foe = 0;
      this.dispHP.foe = this.ctx.foe.curHP;
      SE.encounter();
    } else if (kind === 'sendOut') {
      this.anim = { kind, t: 0, len: 22 };
      this.hidden.mine = false;
      this.faintClip.mine = null;
      this.dispHP.mine = this.ctx.mine.curHP;
      this.dispExp = expRatio(this.ctx.mine);
    } else if (kind === 'hit') {
      this.anim = { kind, t: 0, len: 24, onFoe: fx.onFoe };
      SE.hit(fx.eff ?? 1);
    } else if (kind === 'faint') {
      this.anim = { kind, t: 0, len: 30, onFoe: fx.onFoe };
      SE.faint();
    } else if (kind === 'ball') {
      this.anim = {
        kind, t: 0, shakes: fx.shakes, caught: fx.caught, shakeIndex: -1,
        len: 40 + (fx.shakes ?? 0) * 34 + (fx.caught ? 30 : 0),
      };
      this.ball = { x: 40, y: 130, t: 0 };
      SE.ballThrow();
    } else if (kind === 'levelUp') {
      this.anim = { kind, t: 0, len: 24 };
      SE.levelUp();
    } else if (kind === 'evolve') {
      this.anim = { kind, t: 0, len: 190, from: fx.from, to: fx.to, cancelled: false };
      this.evolveState = { from: fx.from, to: fx.to };
      SE.evolve();
    } else {
      this.anim = { kind, t: 0, len: 12 };
    }
  }

  updateAnim() {
    const a = this.anim;
    if (!a) { this.advance(); return; }
    a.t++;

    if (a.kind === 'hit') {
      const side = a.onFoe ? 'foe' : 'mine';
      this.flash[side] = a.t % 8 < 4 && a.t < 18 ? 1 : 0;
      this.shake = a.t < 18 ? (a.t % 4 < 2 ? 3 : -3) : 0;
      if (a.t >= a.len) { this.flash[side] = 0; this.shake = 0; this.advance(); }
      return;
    }

    if (a.kind === 'faint') {
      const side = a.onFoe ? 'foe' : 'mine';
      const r = Math.min(1, a.t / a.len);
      this.faintClip[side] = Math.round(24 * (1 - r));
      this.spriteOffset[side] = Math.round(24 * r * (a.onFoe ? FOE_SCALE : MINE_SCALE) / 2);
      if (a.t >= a.len) { this.hidden[side] = true; this.advance(); }
      return;
    }

    if (a.kind === 'intro' || a.kind === 'sendOut') {
      const r = Math.min(1, a.t / a.len);
      const side = a.kind === 'intro' ? 'foe' : 'mine';
      this.spriteOffset[side] = Math.round((1 - r) * (a.kind === 'intro' ? 90 : -90));
      if (a.t >= a.len) { this.spriteOffset[side] = 0; this.advance(); }
      return;
    }

    if (a.kind === 'levelUp' || a.kind === 'wait') {
      if (a.t >= a.len) this.advance();
      return;
    }

    if (a.kind === 'ball') {
      this.updateBallAnim(a);
      return;
    }

    if (a.kind === 'evolve') {
      this.updateEvolveAnim(a);
      return;
    }

    if (a.t >= a.len) this.advance();
  }

  updateBallAnim(a) {
    const throwLen = 34;

    if (a.t <= throwLen) {
      // 放物線でボールが飛ぶ
      const r = a.t / throwLen;
      this.ball = {
        x: 40 + (FOE_X + 20 - 40) * r,
        y: 130 + (FOE_Y + 22 - 130) * r - Math.sin(r * Math.PI) * 46,
        open: false, shake: 0,
      };
      return;
    }
    if (a.t <= throwLen + 8) {
      // 吸い込み（白フラッシュ＋縮小）
      this.flash.foe = 1;
      this.ball.open = true;
      return;
    }

    this.flash.foe = 0;
    this.hidden.foe = true;
    this.ball.open = false;

    const after = a.t - throwLen - 8;
    const per = 34;
    const shakeIdx = Math.floor(after / per);
    const inShake = after % per;

    if (shakeIdx < a.shakes) {
      // しばらく待って、カタッと揺れる
      if (inShake > 20) {
        if (a.shakeIndex !== shakeIdx) { a.shakeIndex = shakeIdx; SE.ballShake(); }
        this.ball.shake = inShake % 6 < 3 ? 3 : -3;
      } else {
        this.ball.shake = 0;
      }
      return;
    }

    if (a.caught) {
      this.ball.shake = 0;
      if (!a.caughtSe) { a.caughtSe = true; SE.caught(); }
      if (after >= a.shakes * per + 24) { this.ball = null; this.advance(); }
      return;
    }

    // 失敗 → 飛び出す
    this.ball = null;
    this.hidden.foe = false;
    this.advance();
  }

  updateEvolveAnim(a) {
    // B でキャンセルできる
    if (Input.justPressed(BTN.B) && !a.cancelled) {
      a.cancelled = true;
      this.advance(true);
      return;
    }
    if (a.t >= a.len) {
      this.evolveState = null;
      this.advance(false);
    }
  }

  // ---- 更新 ----

  update() {
    this.t++;

    // HPが2割を切ったら警告音を鳴らし続ける
    const mine = this.ctx.mine;
    if (this.mode !== 'sub' && mine.curHP > 0 && mine.curHP / mine.stats.hp <= 0.2) {
      if (this.t % 40 === 0) SE.lowHp();
    }

    switch (this.mode) {
      case 'msg': {
        this.box.update(Input.isDown(BTN.A));
        if (Input.justPressed(BTN.A) && this.box.advance()) this.advance();
        break;
      }

      case 'command': {
        const r = this.commandMenu.update();
        if (r?.type === 'select') {
          const map = ['fight', 'bag', 'party', 'run'];
          this.advance({ type: map[r.index] });
        }
        break;
      }

      case 'moveSelect': {
        const r = this.moveMenu.update();
        if (r?.type === 'select') this.advance(r.index);
        else if (r?.type === 'cancel') this.advance(null);
        break;
      }

      case 'statPanel': {
        if (Input.justPressed(BTN.A) || Input.justPressed(BTN.B)) {
          this.statPanel = null;
          this.advance();
        }
        break;
      }

      case 'confirm': {
        // 本文を読み終わってから選ばせる
        this.box.update(Input.isDown(BTN.A));
        if (!this.box.waiting) break;
        const r = this.confirmMenu.update();
        if (r?.type === 'select') { this.confirmMenu = null; this.advance(r.index === 0); }
        else if (r?.type === 'cancel') { this.confirmMenu = null; this.advance(false); }
        break;
      }

      case 'tween':
        this.updateTween();
        break;

      case 'anim':
        this.updateAnim();
        break;

      default:
        break;
    }
  }

  updateTween() {
    this.tweenTimer++;

    if (this.tweenKind === 'hp') {
      let done = true;
      for (const [key, mon] of [['mine', this.ctx.mine], ['foe', this.ctx.foe]]) {
        const target = mon.curHP;
        const cur = this.dispHP[key];
        if (cur === target) continue;
        done = false;
        // 最大HPが大きいほど速く動かす（大型でも待たされすぎない）
        const speed = Math.max(1, Math.ceil(mon.stats.hp / 60));
        this.dispHP[key] = cur < target
          ? Math.min(target, cur + speed)
          : Math.max(target, cur - speed);
      }
      if (done && this.tweenTimer > 8) this.advance();
      return;
    }

    const target = expRatio(this.ctx.mine);
    const diff = target - this.dispExp;
    if (Math.abs(diff) < 0.01 || this.tweenTimer > 60) {
      this.dispExp = target;
      this.advance();
      return;
    }
    this.dispExp += Math.sign(diff) * 0.02;
  }

  // ---- 描画 ----

  render(ctx) {
    this.renderBackground(ctx);

    ctx.save();
    if (this.shake) ctx.translate(this.shake, 0);
    this.renderMonsters(ctx);
    ctx.restore();

    this.renderStatusBoxes(ctx);
    if (this.ball) this.renderBall(ctx);

    if (this.evolveState) {
      this.renderEvolve(ctx);
      return;
    }

    this.renderBottom(ctx);
    if (this.statPanel) this.renderStatPanel(ctx);
  }

  renderBackground(ctx) {
    // 空 → 地面。矩形の帯で描くのでドット絵と質感が揃う。
    ctx.fillStyle = '#88c8f0';
    ctx.fillRect(0, 0, W, 96);
    ctx.fillStyle = '#a0d8f8';
    ctx.fillRect(0, 0, W, 40);
    ctx.fillStyle = '#78b048';
    ctx.fillRect(0, 96, W, BOX_Y - 96);
    ctx.fillStyle = '#68a038';
    ctx.fillRect(0, 96, W, 3);

    // 台座
    this.renderPlatform(ctx, FOE_X + 24, FOE_Y + 50, 44, 8, '#8ac058');
    this.renderPlatform(ctx, MINE_X + 30, MINE_Y + 62, 58, 10, '#8ac058');
  }

  renderPlatform(ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, rx * 0.8, ry * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  renderMonsters(ctx) {
    const { mine, foe } = this.ctx;

    if (!this.hidden.foe) {
      drawSprite(ctx, foe.species.sprite, FOE_X + this.spriteOffset.foe, FOE_Y + (this.faintClip.foe !== null ? this.spriteOffset.foe : 0), {
        scale: FOE_SCALE,
        flash: this.flash.foe > 0,
        clipH: this.faintClip.foe,
      });
    }
    if (!this.hidden.mine) {
      drawSprite(ctx, mine.species.sprite, MINE_X, MINE_Y + this.spriteOffset.mine, {
        scale: MINE_SCALE,
        flip: true,
        flash: this.flash.mine > 0,
        clipH: this.faintClip.mine,
      });
    }
  }

  renderStatusBoxes(ctx) {
    const { mine, foe } = this.ctx;

    // 相手（状態異常があるときだけ HPバーを縮めて札を置く）
    drawWindow(ctx, 6, 8, 122, 36);
    drawText(ctx, foe.species.name, 14, 13, { color: COL.ink });
    drawTextRight(ctx, `Lv${foe.level}`, 122, 13, { color: COL.ink });
    drawText(ctx, 'HP', 14, 28, { color: '#f0a020' });
    if (foe.status) {
      const w = this.renderStatusTag(ctx, foe.status, 30, 28);
      drawBar(ctx, 34 + w, 32, 116 - (34 + w) + 6, this.dispHP.foe / foe.stats.hp, hpColor(this.dispHP.foe, foe.stats.hp));
    } else {
      drawBar(ctx, 32, 32, 84, this.dispHP.foe / foe.stats.hp, hpColor(this.dispHP.foe, foe.stats.hp));
    }

    // 自分（なまえ / HPバー / HP数値 / 一番下に EXPバー）
    drawWindow(ctx, 126, 94, 124, 52);
    drawText(ctx, displayName(mine), 134, 98, { color: COL.ink });
    drawTextRight(ctx, `Lv${mine.level}`, 244, 98, { color: COL.ink });
    drawText(ctx, 'HP', 134, 112, { color: '#f0a020' });
    drawBar(ctx, 152, 116, 84, this.dispHP.mine / mine.stats.hp, hpColor(this.dispHP.mine, mine.stats.hp));
    drawTextRight(ctx, `${Math.round(this.dispHP.mine)}/${mine.stats.hp}`, 244, 124, { color: COL.ink });
    if (mine.status) this.renderStatusTag(ctx, mine.status, 134, 125);
    drawBar(ctx, 134, 140, 110, this.dispExp, COL.exp, { h: 2, frame: false });

    // トレーナー戦は「あと何匹いるか」が読めないと戦いようがない
    if (this.ctx.trainer) {
      this.renderPips(ctx, 8, 47, this.ctx.foeParty ?? [foe], false);
      this.renderPips(ctx, 248, 86, state.party, true);
    }
  }

  /** 残りポケモン数のしるし。健在は白、ひんしは沈んだ色。 */
  renderPips(ctx, x, y, list, rightAlign) {
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const idx = rightAlign ? n - 1 - i : i;
      const px = rightAlign ? x - 8 - i * 9 : x + i * 9;
      const alive = list[idx].curHP > 0;
      ctx.fillStyle = '#202028';
      ctx.fillRect(px, y, 7, 7);
      ctx.fillStyle = alive ? '#f8f8f8' : '#606070';
      ctx.fillRect(px + 1, y + 1, 5, 5);
      if (alive) {
        ctx.fillStyle = '#e04030';
        ctx.fillRect(px + 2, y + 2, 3, 2);
      }
    }
  }

  /** 状態異常の札。描いた幅を返す。 */
  renderStatusTag(ctx, status, x, y) {
    const colors = {
      'どく': '#a040a0', 'やけど': '#e06030', 'まひ': '#d8c020',
      'ねむり': '#8890a0', 'こおり': '#68c8d8',
    };
    const w = status.length * 12 + 4;
    ctx.fillStyle = colors[status] ?? '#808080';
    ctx.fillRect(Math.round(x), Math.round(y) - 1, w, 11);
    drawText(ctx, status, x + 2, y, { color: '#ffffff' });
    return w;
  }

  renderBall(ctx) {
    const b = this.ball;
    const x = Math.round(b.x + (b.shake ?? 0));
    const y = Math.round(b.y);
    // 上半分赤・下半分白のボール
    ctx.fillStyle = '#202028';
    ctx.fillRect(x - 5, y - 5, 10, 10);
    ctx.fillStyle = '#e04030';
    ctx.fillRect(x - 4, y - 4, 8, 3);
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(x - 4, y + 1, 8, 3);
    ctx.fillStyle = '#202028';
    ctx.fillRect(x - 4, y - 1, 8, 2);
    ctx.fillStyle = b.open ? '#ffe14a' : '#c8c8d0';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  renderEvolve(ctx) {
    const a = this.anim;
    const r = a.t / a.len;
    fillScreen(ctx, '#101018', 1);

    // 進むほど速く点滅し、終わりに新しい姿へ切り替わる
    const freq = Math.max(3, Math.round(16 - r * 14));
    const showNew = Math.floor(a.t / freq) % 2 === 1;
    const sp = showNew ? a.to : a.from;
    const white = r < 0.9;

    drawSprite(ctx, sp.sprite, W / 2 - 36, 44, { scale: 3, flash: white });

    this.box.render(ctx);
    if (r < 0.85) {
      drawTextCentered(ctx, 'B ： しんかを ストップ', W / 2, 132, { color: '#ffffff', shadow: '#303050' });
    }
  }

  renderBottom(ctx) {
    if (this.mode === 'command') {
      // 左にメッセージ、右にコマンド
      drawWindow(ctx, 4, BOX_Y, 130, 40);
      drawText(ctx, `${displayName(this.ctx.mine)}は`, 12, BOX_Y + 7, { color: COL.ink });
      drawText(ctx, 'どうする？', 12, BOX_Y + 21, { color: COL.ink });
      drawWindow(ctx, 132, BOX_Y, 120, 40);
      this.commandMenu.render(ctx);
      return;
    }

    if (this.mode === 'moveSelect') {
      drawWindow(ctx, 4, BOX_Y, 248, 40);
      this.moveMenu.render(ctx);
      const cur = this.moveMenu.current;
      if (cur?.def) {
        drawTypeTag(ctx, cur.def.type, TYPE_COLOR[cur.def.type], 138, BOX_Y + 26);
        drawTextRight(ctx, `PP ${cur.mv.pp}/${cur.mv.maxPp}`, 246, BOX_Y + 26, { color: COL.ink });
      }
      return;
    }

    this.box.render(ctx);

    if (this.mode === 'confirm' && this.box.waiting) {
      drawWindow(ctx, 178, BOX_Y - 48, 72, 46);
      this.confirmMenu.render(ctx);
    }
  }

  renderStatPanel(ctx) {
    drawWindow(ctx, 120, 60, 130, 86);
    const rows = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    rows.forEach((k, i) => {
      const y = 66 + i * 13;
      drawText(ctx, STAT_LABEL[k], 128, y, { color: COL.ink });
      const g = this.statPanel[k] ?? 0;
      drawTextRight(ctx, `+${g}`, 242, y, { color: g > 0 ? COL.select : COL.inkLight });
    });
  }
}
