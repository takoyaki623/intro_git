/**
 * GBA の画面の拡大率（v1.3-a / 場所を移したのは v1.3-d）。
 *
 * 画面は**2つある**（探索とバトル）。最初は `field.ts` の中で自分の画面だけを
 * 拡大していて、**バトルの画面は原寸のまま**だった ―― スマホでは半分の大きさで出る。
 * 拡大は画面の持ち主ではなく、**画面という形に対して**掛ける。
 *
 * **CSS では決められない。** 「入る幅を 240 で割る」は長さ ÷ 長さで、
 * `calc()` は倍率（単位なしの数）を作れない ―― 最初 CSS で書いて `--px` が
 * 丸ごと無効になり、原寸のまま出た。
 */

/** GBA の画面の幅（`field.ts` の `TILE × VIEW.w` と同じ）。 */
const SCREEN_W = 240;

/**
 * 画面が入る幅。**親の幅ではなく窓の幅から決める。**
 *
 * 最初は `box.parentElement.clientWidth` を見ていた ―― バトルの画面は
 * 隠れている間は幅 0 なので、**読み込み時に 1倍と決まってしまい、
 * 出したときも小さいまま**だった。見えているかどうかで答えが変わる値を根拠にしない。
 *
 * `#app` は `max-width: 760px` / `padding: 16px`。枠のぶんを少し引く。
 */
const room = (): number => Math.min(window.innerWidth, 760) - 40;

export function fitScreens(): void {
  for (const box of document.querySelectorAll<HTMLElement>(".screen-box")) {
    const raw = room() / SCREEN_W;
    // **整数倍が入るなら整数倍**（ドットが濁らない）。
    // 入らない幅では幅に合わせる ―― 小さいまま遊ぶより、少し濁っても大きい方がよい
    const px = raw >= 2 ? Math.min(4, Math.floor(raw)) : Math.max(1, raw);
    box.style.setProperty("--px", `${px}`);
  }
}
