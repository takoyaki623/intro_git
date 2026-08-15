import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import { fillScreen } from '../engine/ui.js';

const W = Screen.W;
const H = Screen.H;

/**
 * 画面切り替えの演出。下のシーンの上に重ねて描く。
 *
 * kind:
 *   'fade'   … 暗転 → onMid → 明転（ワープ用）
 *   'battle' … ワイプで塗りつぶす → onDone（戦闘導入用）
 *
 * variant（kind:'battle' のときだけ、Phase Y-3）:
 *   undefined … 通常の野生戦・トレーナー戦。中央から広がる菱形ワイプ
 *   'leader'  … ジムリーダー戦。縦じま(カーテン)ワイプで「格式」を出す
 *   'boss'    … ぬし戦。菱形ワイプの前に赤い一瞬のフラッシュを挟む
 *   'legend'  … 伝説戦。円形(アイリス)ワイプ＋金色のフラッシュで、ゆっくり
 */
export class TransitionScene {
  constructor({ kind = 'fade', variant = null, onMid = null, onDone = null, frames = 24 } = {}) {
    this.transparent = true;
    this.kind = kind;
    this.variant = variant;
    this.onMid = onMid;
    this.onDone = onDone;
    this.frames = variant === 'legend' ? Math.round(frames * 1.5) : frames;
    this.t = 0;
    this.phase = 'in';
    this.finished = false;
  }

  update() {
    this.t++;

    if (this.kind === 'battle') {
      if (this.t >= this.frames && !this.finished) {
        this.finished = true;
        // onDone 側が pop/push を行う（戦闘シーンへの差し替え）
        if (this.onDone) this.onDone();
        else Scenes.pop();
      }
      return;
    }

    if (this.phase === 'in' && this.t >= this.frames) {
      this.onMid?.();
      this.phase = 'out';
      this.t = 0;
      return;
    }
    if (this.phase === 'out' && this.t >= this.frames) {
      Scenes.pop();
      this.onDone?.();
    }
  }

  render(ctx) {
    const r = Math.min(1, this.t / this.frames);

    if (this.kind === 'battle') {
      if (this.variant === 'leader') { this.renderCurtainWipe(ctx, r); return; }
      if (this.variant === 'boss') { this.renderFlashThenDiamond(ctx, r, '#c02818'); return; }
      if (this.variant === 'legend') { this.renderIrisWipe(ctx, r); return; }
      this.renderDiamondWipe(ctx, r, '#000000');
      return;
    }
    fillScreen(ctx, '#000000', this.phase === 'in' ? r : 1 - r);
  }

  /**
   * 菱形ワイプ。中央から広がる菱形で塗りつぶしていく。
   * 走査線ごとの矩形の積み重ねなので、拡大してもエッジがドットのまま保たれる。
   */
  renderDiamondWipe(ctx, r, color) {
    const cx = W / 2;
    const cy = H / 2;
    const max = W / 2 + H / 2;
    const size = max * r;

    ctx.fillStyle = color;
    for (let y = 0; y < H; y += 2) {
      const dy = Math.abs(y + 1 - cy);
      const halfW = size - dy;
      if (halfW <= 0) continue;
      const left = Math.max(0, Math.round(cx - halfW));
      const right = Math.min(W, Math.round(cx + halfW));
      ctx.fillRect(left, y, right - left, 2);
    }
    if (r >= 1) fillScreen(ctx, color, 1);
  }

  /** ジムリーダー戦。縦じまが左右交互に閉じてくる「カーテン」ワイプ。 */
  renderCurtainWipe(ctx, r) {
    const stripes = 8;
    const stripeW = W / stripes;
    ctx.fillStyle = '#182848';
    for (let i = 0; i < stripes; i++) {
      const x = i * stripeW;
      const fromTop = i % 2 === 0;
      const h = H * r;
      ctx.fillRect(Math.round(x), fromTop ? 0 : Math.round(H - h), Math.ceil(stripeW) + 1, Math.round(h));
    }
    if (r >= 1) fillScreen(ctx, '#182848', 1);
  }

  /** ぬし戦。赤いフラッシュを一瞬はさんでから、通常の菱形ワイプに切り替わる。 */
  renderFlashThenDiamond(ctx, r, color) {
    const flashLen = 0.2;
    if (r < flashLen) {
      fillScreen(ctx, '#ffffff', 1 - r / flashLen);
      fillScreen(ctx, color, r / flashLen);
      return;
    }
    this.renderDiamondWipe(ctx, (r - flashLen) / (1 - flashLen), color);
  }

  /** 伝説戦。中央の円が縮んでいく アイリスワイプ＋金色のフラッシュ。 */
  renderIrisWipe(ctx, r) {
    fillScreen(ctx, '#f8e878', Math.max(0, 0.5 - r) * 0.8);

    const cx = W / 2;
    const cy = H / 2;
    const maxRadius = Math.hypot(W / 2, H / 2);
    const radius = maxRadius * (1 - r);

    ctx.fillStyle = '#141420';
    for (let y = 0; y < H; y += 2) {
      const dy = y + 1 - cy;
      const inside = radius * radius - dy * dy;
      const halfW = inside > 0 ? Math.sqrt(inside) : 0;
      if (halfW <= 0) { ctx.fillRect(0, y, W, 2); continue; }
      const left = Math.round(cx - halfW);
      const right = Math.round(cx + halfW);
      ctx.fillRect(0, y, left, 2);
      ctx.fillRect(right, y, W - right, 2);
    }
    if (r >= 1) fillScreen(ctx, '#141420', 1);
  }
}
