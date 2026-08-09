import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { rng } from '../core/rng.js';
import { SE } from '../core/audio.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText } from '../engine/font.js';
import { drawWindow, COL } from '../engine/ui.js';
import { getTileSprite, TILE } from '../data/tiles.js';
import { charSprite } from '../data/sprites/chars.js';
import * as World from '../game/world.js';
import { world } from '../game/world.js';
import { state, setFlag, healParty, addItem } from '../game/state.js';
import { stepCheck, spawnWild } from '../game/encounter.js';

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
  }

  enter() {
    this.updateCamera();
    this.banner = 110;
  }

  resume() {
    this.busy = false;
    Input.clearEdges();
    // バトルで全滅していたらポケモンセンターへ強制送還
    if (state.party.length && state.party.every((m) => m.curHP <= 0)) {
      this.whiteOut();
    }
  }

  whiteOut() {
    healParty();
    World.loadMap('center', 6, 6, 'down');
    this.updateCamera();
    this.banner = 110;
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
    if (warp) {
      this.doWarp(warp);
      return;
    }
    const enc = stepCheck(world.map, tile, rng);
    if (enc) this.startWildBattle(enc);
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
      this.openDialog(target.npc.lines, target.npc);
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
    if (target.type === 'bed') {
      healParty();
      SE.heal();
      this.openDialog(['ベッドで やすんだ…', 'ポケモンたちは げんきに なった！']);
    }
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

  async openDialog(lines, npc = null) {
    this.busy = true;
    world.frozen = true;
    const { DialogScene } = await import('./DialogScene.js');
    Scenes.push(new DialogScene({
      lines,
      npc,
      onClose: () => { world.frozen = false; this.busy = false; },
    }));
  }

  async openMenu() {
    this.busy = true;
    const { MenuScene } = await import('./MenuScene.js');
    Scenes.push(new MenuScene({ onClose: () => { this.busy = false; } }));
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

    if (this.banner > 0) this.renderBanner(ctx);
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
      const { def, flip } = charSprite(sprite, a.dir, World.walkFrame(a));
      drawSprite(ctx, def, Math.round(a.px - camX), Math.round(a.py - camY) - 4, { flip });
    }
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
