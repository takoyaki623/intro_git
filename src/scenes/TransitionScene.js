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
 *   'battle' … 菱形ワイプで塗りつぶす → onDone（戦闘導入用）
 */
export class TransitionScene {
  constructor({ kind = 'fade', onMid = null, onDone = null, frames = 24 } = {}) {
    this.transparent = true;
    this.kind = kind;
    this.onMid = onMid;
    this.onDone = onDone;
    this.frames = frames;
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
      this.renderDiamondWipe(ctx, r);
      return;
    }
    fillScreen(ctx, '#000000', this.phase === 'in' ? r : 1 - r);
  }

  /**
   * 菱形ワイプ。中央から広がる菱形で黒く塗りつぶしていく。
   * 走査線ごとの矩形の積み重ねなので、拡大してもエッジがドットのまま保たれる。
   */
  renderDiamondWipe(ctx, r) {
    const cx = W / 2;
    const cy = H / 2;
    const max = W / 2 + H / 2;
    const size = max * r;

    ctx.fillStyle = '#000000';
    for (let y = 0; y < H; y += 2) {
      const dy = Math.abs(y + 1 - cy);
      const halfW = size - dy;
      if (halfW <= 0) continue;
      const left = Math.max(0, Math.round(cx - halfW));
      const right = Math.min(W, Math.round(cx + halfW));
      ctx.fillRect(left, y, right - left, 2);
    }
    if (r >= 1) fillScreen(ctx, '#000000', 1);
  }
}
