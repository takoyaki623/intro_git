import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { rng } from '../core/rng.js';
import { SE } from '../core/audio.js';
import * as Music from '../core/music.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText } from '../engine/font.js';
import { drawWindow, COL } from '../engine/ui.js';
import { getTileSprite, TILE } from '../data/tiles.js';
import { charSprite } from '../data/sprites/chars.js';
import * as World from '../game/world.js';
import { world } from '../game/world.js';
import { state, setFlag, getFlag, healParty, addItem } from '../game/state.js';
import { stepCheck, fishCheck, spawnWild } from '../game/encounter.js';
import { getTrainer, trainerFlag } from '../data/trainers.js';
import { createMonster, displayName, raiseBySteps } from '../game/monster.js';
import { getMove } from '../data/moves.js';
import { ITEMS } from '../data/items.js';

/** 持っているなかで一番いい つりざお。無ければ null。 */
function bestRod() {
  return Object.keys(state.bag)
    .map((name) => ITEMS[name])
    .filter((it) => it?.use?.kind === 'rod')
    .sort((a, b) => b.use.power - a.use.power)[0] ?? null;
}

const W = Screen.W;
const H = Screen.H;
const T = 16;

export class FieldScene {
  constructor() {
    this.camX = 0;
    this.camY = 0;
    this.banner = 0;      // マップ名の表示残りフレーム
    this.pendingWarp = null;
    this.busy = false;    // サブシーンを開いている間は入力を止める
    this.approach = null; // トレーナーに見つかってから戦闘までの演出
  }

  enter() {
    this.updateCamera();
    this.banner = 110;
    this.playMapMusic();
  }

  /** マップごとの曲。同じ曲なら鳴らし直さないので、屋内へ入っても途切れない。 */
  playMapMusic() {
    Music.play(world.map?.bgm ?? 'town');
  }

  resume() {
    this.busy = false;
    this.approach = null;
    world.frozen = false;
    Input.clearEdges();
    this.playMapMusic();
    // バトルで全滅していたらポケモンセンターへ強制送還
    if (state.party.length && state.party.every((m) => m.curHP <= 0)) {
      this.whiteOut();
    }
  }

  whiteOut() {
    healParty();
    // 最後に入ったポケモンセンターへ。町が増えたので、はじまりの村へ
    // 送り返されるとニビシティから戻るのが大変になる。
    const r = state.player.respawn ?? { map: 'center', x: 6, y: 6 };
    World.loadMap(r.map, r.x, r.y, 'down');
    this.updateCamera();
    this.banner = 110;
    this.playMapMusic();
    this.openDialog([
      'めのまえが まっくらに なった…',
      'ポケモンセンターに はこばれた。',
      'ポケモンたちは げんきに なった！',
    ]);
  }

  // ---- 更新 ----

  update() {
    if (this.busy) return;

    World.updateNpcs();

    if (this.banner > 0) this.banner--;

    if (this.approach) {
      this.updateApproach();
      this.updateCamera();
      return;
    }

    if (!world.frozen) {
      this.handleInput();
      const r = World.updatePlayer();
      if (r?.stepped) this.onStepped(r);
    }

    this.updateCamera();
  }

  handleInput() {
    const p = world.player;

    if (Input.justPressed(BTN.START)) {
      this.openMenu();
      return;
    }
    if (Input.justPressed(BTN.A) && !p.moving) {
      this.interact();
      return;
    }

    const dir = Input.heldDir();
    if (dir) World.tryStep(dir, Input.isDown(BTN.RUN));
  }

  onStepped({ tile, warp }) {
    // あずけた子は歩いた歩数ぶん育つ
    if (state.daycare) {
      state.daycare.steps++;
      raiseBySteps(state.daycare, 1);
    }
    if (warp) {
      this.doWarp(warp);
      return;
    }
    // 視線はエンカウントより先。草むらの中で見つかることもあるので、
    // 両方が同時に成立したときはトレーナーを優先する。
    const spotted = World.trainerInSight();
    if (spotted) {
      this.startApproach(spotted.npc);
      return;
    }
    const enc = stepCheck(world.map, tile, rng);
    if (enc) this.startWildBattle(enc);
  }

  // ---- トレーナーに見つかる ----

  startApproach(npc) {
    world.frozen = true;
    this.approach = { npc, phase: 'mark', t: 0 };
    SE.spotted();
  }

  /** 「！」を出す → こちらまで歩いてくる → 戦闘 */
  updateApproach() {
    const a = this.approach;
    a.t++;

    if (a.phase === 'mark') {
      if (a.t >= 42) { a.phase = 'walk'; a.t = 0; }
      return;
    }

    if (a.npc.moving) return;
    if (World.stepNpcTowardPlayer(a.npc)) return;
    this.startTrainerBattle(a.npc);
  }

  async startTrainerBattle(npc) {
    this.approach = null;
    this.busy = true;
    const trainer = getTrainer(npc.trainer);
    const foeParty = trainer.party.map((p) => createMonster(p.id, p.lv, { rng, moves: p.moves }));

    const [{ TransitionScene }, { BattleScene }] = await Promise.all([
      import('./TransitionScene.js'),
      import('./BattleScene.js'),
    ]);
    Scenes.push(new TransitionScene({
      kind: 'battle',
      onDone: () => {
        Scenes.pop();
        Scenes.push(new BattleScene({
          trainer, trainerId: npc.trainer, foeParty, wild: false,
        }));
      },
    }));
  }

  async doWarp(warp) {
    this.busy = true;
    const { TransitionScene } = await import('./TransitionScene.js');
    Scenes.push(new TransitionScene({
      kind: 'fade',
      onMid: () => {
        World.loadMap(warp.to, warp.tx, warp.ty, warp.dir ?? 'down');
        this.updateCamera();
        this.banner = 110;
        this.playMapMusic();
      },
      onDone: () => { this.busy = false; },
    }));
  }

  async startWildBattle(enc) {
    if (!state.party.some((m) => m.curHP > 0)) return; // 手持ちがいなければ出さない
    this.busy = true;
    const foe = spawnWild(enc, world.map.id, rng);
    const [{ TransitionScene }, { BattleScene }] = await Promise.all([
      import('./TransitionScene.js'),
      import('./BattleScene.js'),
    ]);
    Scenes.push(new TransitionScene({
      kind: 'battle',
      onDone: () => {
        Scenes.pop();                       // TransitionScene を畳んでから
        Scenes.push(new BattleScene({ foe, wild: true }));
      },
    }));
  }

  interact() {
    const target = World.facingTarget();
    if (!target) return;

    if (target.type === 'npc') {
      World.faceNpcToPlayer(target.npc);
      const npc = target.npc;
      if (npc.trainer) {
        const trainer = getTrainer(npc.trainer);
        // 倒した相手は世間話に変わる。まだなら話しかけた時点で勝負。
        if (getFlag(trainerFlag(npc.trainer))) {
          this.openDialog(npc.lines ?? trainer.after, npc);
        } else {
          world.frozen = true;
          this.startTrainerBattle(npc);
        }
        return;
      }
      this.openDialog(npc.lines, npc);
      return;
    }
    if (target.type === 'sign') {
      this.openDialog(target.sign.lines);
      return;
    }
    if (target.type === 'item') {
      this.pickUp(target.item);
      return;
    }
    if (target.type === 'pc') {
      this.openBox();
      return;
    }
    if (target.type === 'water') {
      this.faceWater();
      return;
    }
    if (target.type === 'bed') {
      healParty();
      SE.heal();
      this.openDialog(['ベッドで やすんだ…', 'ポケモンたちは げんきに なった！']);
    }
  }

  // ---- みずべ ----

  /**
   * 岸から水を向いて A。
   * なみのりが使えるなら聞いてから渡る。だめなら つりざお。
   */
  faceWater() {
    const surfer = state.party.find((m) => m.curHP > 0 && m.moves.some((mv) => getMove(mv.id)?.field === 'surf'));
    const rod = bestRod();

    if (surfer) {
      const ride = [`${displayName(surfer)}の なみのりが つかえる！`, 'みずのうえを すすみますか？'];
      this.openDialog([
        ...ride,
        {
          ask: true,
          yes: [{ surf: true }],
          no: rod ? [{ fish: true }] : ['また こんど にしよう。'],
        },
      ]);
      return;
    }
    if (rod) {
      this.fish(rod);
      return;
    }
    this.openDialog(['みずが とても きれいだ…']);
  }

  /** DialogScene から呼ばれる（{ surf:true } コマンド） */
  doSurf() {
    SE.heal();
    World.startSurf();
  }

  /** つりをする。かかったらそのまま野生戦へ。 */
  fish(rod = bestRod()) {
    if (!rod) return;
    const enc = fishCheck(world.map, rod.use.power, rng);
    if (!enc) {
      this.openDialog([`${rod.name}を ふりこんだ…`, 'しかし なにも つれなかった。']);
      return;
    }
    this.openDialog(
      [`${rod.name}を ふりこんだ…`, 'なにかが かかった！'],
      null,
      () => this.startWildBattle(enc),
    );
  }

  /** 落ちているものを拾う。フラグを立てるので二度は拾えない。 */
  pickUp(item) {
    const n = item.n ?? 1;
    addItem(item.item, n);
    setFlag(item.flag);
    world.items = world.items.filter((it) => it !== item);
    SE.select();
    this.openDialog([`${state.player.name}は ${item.item}を ${n}こ みつけた！`]);
  }

  async openDialog(lines, npc = null, after = null) {
    this.busy = true;
    world.frozen = true;
    const { DialogScene } = await import('./DialogScene.js');
    Scenes.push(new DialogScene({
      lines,
      npc,
      field: this,
      onClose: () => { world.frozen = false; this.busy = false; after?.(); },
    }));
  }

  async openMenu() {
    this.busy = true;
    const { MenuScene } = await import('./MenuScene.js');
    Scenes.push(new MenuScene({
      onClose: (flyTo) => {
        this.busy = false;
        if (flyTo) this.flyTo(flyTo);
      },
    }));
  }

  /** そらをとぶ。暗転をはさんで町へ降りる。 */
  async flyTo({ map, x, y }) {
    this.busy = true;
    const { TransitionScene } = await import('./TransitionScene.js');
    Scenes.push(new TransitionScene({
      kind: 'fade',
      onMid: () => {
        World.loadMap(map, x, y, 'down');
        this.updateCamera();
        this.banner = 110;
        this.playMapMusic();
      },
      onDone: () => { this.busy = false; },
    }));
  }

  async openBox() {
    this.busy = true;
    const { BoxScene } = await import('./BoxScene.js');
    Scenes.push(new BoxScene({ onClose: () => { this.busy = false; } }));
  }

  // ---- カメラ ----

  /** カメラはプレイヤー中央。ただしマップの外は映さない。 */
  updateCamera() {
    const p = world.player;
    const mw = World.width() * T;
    const mh = World.height() * T;

    const cx = p.px + T / 2 - W / 2;
    const cy = p.py + T / 2 - H / 2;

    // マップが画面より小さいときは中央寄せ
    this.camX = mw <= W ? (mw - W) / 2 : Math.max(0, Math.min(mw - W, cx));
    this.camY = mh <= H ? (mh - H) / 2 : Math.max(0, Math.min(mh - H, cy));
  }

  // ---- 描画 ----

  render(ctx) {
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, W, H);

    const camX = Math.round(this.camX);
    const camY = Math.round(this.camY);

    this.renderTiles(ctx, camX, camY);
    this.renderItems(ctx, camX, camY);
    this.renderActors(ctx, camX, camY);
    this.renderGrassOverlay(ctx, camX, camY);
    this.renderTimeTint(ctx);
    if (this.approach?.phase === 'mark') this.renderSpotMark(ctx, camX, camY);

    if (this.banner > 0) this.renderBanner(ctx);
  }

  /** 朝・夕・夜の色。屋外だけ、UI より下にかぶせる。 */
  renderTimeTint(ctx) {
    if (!world.map?.outdoor) return;
    const tint = World.TINT[World.timeOfDay()];
    if (!tint) return;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, H);
  }

  /** 見つかったときの「！」。矩形だけで描くのでドット絵と質感が揃う。 */
  renderSpotMark(ctx, camX, camY) {
    const n = this.approach.npc;
    const x = Math.round(n.px - camX) + 5;
    // 出た瞬間に少し飛び跳ねさせると気づきやすい
    const hop = this.approach.t < 8 ? Math.round((8 - this.approach.t) / 2) : 0;
    const y = Math.round(n.py - camY) - 16 - hop;

    ctx.fillStyle = '#202028';
    ctx.fillRect(x - 1, y - 1, 8, 14);
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(x, y, 6, 12);
    ctx.fillStyle = '#e04030';
    ctx.fillRect(x + 2, y + 1, 2, 6);
    ctx.fillRect(x + 2, y + 9, 2, 2);
  }

  renderTiles(ctx, camX, camY) {
    const x0 = Math.max(0, Math.floor(camX / T));
    const y0 = Math.max(0, Math.floor(camY / T));
    const x1 = Math.min(World.width(), Math.ceil((camX + W) / T) + 1);
    const y1 = Math.min(World.height(), Math.ceil((camY + H) / T) + 1);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const key = World.tileAt(x, y);
        if (!key) continue;
        // 木や建物の下に地面を敷いておくと、透明部分から黒が覗かない
        const base = getTileSprite(key === 'tree' ? 'grass' : key);
        if (key === 'tree') {
          drawSprite(ctx, getTileSprite('grass'), x * T - camX, y * T - camY);
        }
        if (base) drawSprite(ctx, getTileSprite(key), x * T - camX, y * T - camY);
      }
    }
  }

  renderActors(ctx, camX, camY) {
    const p = world.player;
    const actors = [
      ...world.npcs.map((n) => ({ a: n, sprite: n.sprite })),
      { a: p, sprite: 'hero' },
    ];
    // 足元の y でソートすると、物やキャラの裏に自然に回り込む
    actors.sort((u, v) => u.a.py - v.a.py);

    for (const { a, sprite } of actors) {
      const x = Math.round(a.px - camX);
      const y = Math.round(a.py - camY) - 4 - Math.round(a.hopY ?? 0);

      // 飛び降りている間は、着地点に影を落として高さを見せる
      if (a.jumping) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(x + 8, Math.round(a.py - camY) + 14, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // なみのり中はプレイヤーを浮き輪の上に乗せる
      if (a === p && world.surfing) this.renderFloat(ctx, x, Math.round(a.py - camY));

      const { def, flip } = charSprite(sprite, a.dir, World.walkFrame(a));
      drawSprite(ctx, def, x, y - (a === p && world.surfing ? 3 : 0), { flip });
    }
  }

  /** なみのり中の足場。矩形だけで描く。 */
  renderFloat(ctx, x, y) {
    ctx.fillStyle = '#2a5c80';
    ctx.fillRect(x, y + 8, 16, 7);
    ctx.fillStyle = '#58c8f0';
    ctx.fillRect(x + 1, y + 9, 14, 4);
    ctx.fillStyle = '#a0e8ff';
    ctx.fillRect(x + 2, y + 10, 12, 1);
  }

  /** 落ちているモンスターボール。矩形の積み重ねで描く（16x16に収める）。 */
  renderItems(ctx, camX, camY) {
    for (const it of world.items) {
      const x = Math.round(it.x * T - camX) + 3;
      const y = Math.round(it.y * T - camY) + 4;
      ctx.fillStyle = '#202028';
      ctx.fillRect(x, y, 10, 10);
      ctx.fillStyle = '#e04030';
      ctx.fillRect(x + 1, y + 1, 8, 3);
      ctx.fillStyle = '#f8f8f8';
      ctx.fillRect(x + 1, y + 6, 8, 3);
      ctx.fillStyle = '#202028';
      ctx.fillRect(x + 1, y + 4, 8, 2);
      ctx.fillStyle = '#c8c8d0';
      ctx.fillRect(x + 4, y + 4, 2, 2);
    }
  }

  /** 草むらに立っているとき、足元に草を重ねて「埋もれている」感じを出す */
  renderGrassOverlay(ctx, camX, camY) {
    const p = world.player;
    const key = World.tileAt(p.tx, p.ty);
    if (!TILE[key]?.grass || p.moving) return;
    const spr = getTileSprite(key);
    if (!spr) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.round(p.px - camX), Math.round(p.py - camY) + 8, T, 8);
    ctx.clip();
    drawSprite(ctx, spr, Math.round(p.px - camX), Math.round(p.py - camY));
    ctx.restore();
  }

  renderBanner(ctx) {
    const name = world.map.name;
    const w = Math.max(70, name.length * 12 + 20);
    drawWindow(ctx, 6, 6, w, 22);
    drawText(ctx, name, 16, 11, { color: COL.ink });
  }
}
