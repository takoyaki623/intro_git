// 画面のスタック。メニューやバトルのサブ画面はこの上に積む。
//
// シーンの契約:
//   { transparent?, enter?(), exit?(), pause?(), resume?(result), update(), render(ctx) }
//
// resume(result) がサブ画面の「戻り値」の経路になる。
// 手持ち画面が選んだ index、バッグが選んだ道具、忘れさせる技 ―― 全部これで返る。
// バトルのジェネレータがサブ画面を待てるのも、この一点があるおかげ。

const stack = [];

export function push(scene) {
  stack[stack.length - 1]?.pause?.();
  stack.push(scene);
  scene.enter?.();
  return scene;
}

export function pop(result) {
  const scene = stack.pop();
  scene?.exit?.();
  stack[stack.length - 1]?.resume?.(result);
  return scene;
}

/** 今のシーンを捨てて差し替える（下のシーンには resume を通知しない） */
export function replace(scene) {
  stack.pop()?.exit?.();
  stack.push(scene);
  scene.enter?.();
  return scene;
}

/** スタックを空にしてから1枚だけ積む。タイトルへ戻るとき用。 */
export function reset(scene) {
  while (stack.length) stack.pop().exit?.();
  return push(scene);
}

export const top = () => stack[stack.length - 1];
export const depth = () => stack.length;

export function update() {
  top()?.update?.();
}

export function render(ctx) {
  // 半透明シーンが重なっている場合、その下の不透明シーンから描き始める
  let i = stack.length - 1;
  while (i > 0 && stack[i].transparent) i--;
  for (; i < stack.length; i++) stack[i].render?.(ctx);
}
