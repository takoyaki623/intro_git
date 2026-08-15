// 固定タイムステップのゲームループ。
// ゲーム内の時間はすべて「フレーム」単位で数える（60fps基準）。
// 描画が遅れても更新回数がずれないので、アニメーションの尺が端末に依存しない。

const STEP = 1000 / 60;
const MAX_CATCHUP = 5; // 一度に取り戻す上限。タブ復帰時の暴走を防ぐ。

let acc = 0;
let last = 0;
let running = false;
let fps = 0;
let fpsCount = 0;
let fpsTime = 0;

export function start(update, render) {
  running = true;
  last = performance.now();

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);

    acc += now - last;
    last = now;
    if (acc > STEP * 60) acc = STEP; // 長時間バックグラウンドにいた場合は捨てる

    let steps = 0;
    while (acc >= STEP && steps < MAX_CATCHUP) {
      update();
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_CATCHUP) acc = 0;

    render();

    fpsCount++;
    if (now - fpsTime >= 1000) {
      fps = fpsCount;
      fpsCount = 0;
      fpsTime = now;
    }
  }

  requestAnimationFrame(frame);
}

export function stop() {
  running = false;
}

export function getFps() {
  return fps;
}
