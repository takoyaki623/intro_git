/**
 * 絵の出どころ（v0.10.5）。
 *
 * `SaveStore`（v0.5 で先に抽象化して v0.9 で IndexedDB に差し替えた）と同じ判断で、
 * **中身より先に差し替え口を作る。** 後から挟むと、描画コードが散った後になる。
 *
 * 2つの実装がある。
 *
 * | | 中身 | コミット |
 * | --- | --- | --- |
 * | `drawn`（既定） | コードで描く。**スマホ版でもこれが動く** | ⭕️ できる |
 * | `local` | 手元の画像。無ければ `drawn` に落ちる | ❌ `.gitignore` 済み |
 *
 * **公式素材はリポジトリに入れられない**（このリポジトリは公開・game-plan.md §10）。
 * だから既定は「コードで描く」で、素材はあくまで手元での差し替えになる。
 * 素材が無い状態が**逃げ道ではなく通常動作**、というのは v0.7 からの方針のまま。
 *
 * ## 手元の素材の入れ方（2経路）
 *
 * - 開発時（`npm run dev`）… `assets/tiles/*.png` を vite が配信する
 * - 遊べる版（Artifact）… **利用者が自分の端末から読み込み、IndexedDB に置く。**
 *   ページには同梱しないので、公衆送信にならない
 *
 * どちらも「無ければ `drawn`」なので、素材が欠けていても絵が消えるだけで遊べる。
 */

/** 画像の置き場。ここに無い名前は `drawn` が描く。 */
const images = new Map<string, HTMLImageElement>();

let mode: "drawn" | "local" = "drawn";

export const artMode = (): "drawn" | "local" => mode;

export function useArtMode(next: "drawn" | "local"): void {
  mode = next;
}

/**
 * 素材を1枚覚える。
 *
 * `local` でも**ここに無いものは `drawn` が描く。**
 * 全部そろって初めて絵になる、という形にしない ―― 1枚ずつ足せる方がよい。
 */
export function putImage(name: string, image: HTMLImageElement): void {
  images.set(name, image);
}

export const hasImage = (name: string): boolean => mode === "local" && images.has(name);

/**
 * 素材があればそれを描いて `true`。無ければ何もせず `false`。
 *
 * **呼び出し側は返り値を見て、false なら自分で描く。**
 * 「素材が無い」を例外にしない ―― 例外にすると、1枚欠けただけで画面が止まる。
 *
 * 名前は**細かい方から順に**渡せる（`tile-,` → `tile-grass`）。
 * 凡例の文字は `,` や `.` のようにファイル名にしづらいものがあるので、
 * **文字で細かく指定してもよいし、地形名でまとめて1枚でもよい**という形にする。
 * 最初に見つかったものを使う。
 */
export function drawImage(
  ctx: CanvasRenderingContext2D,
  names: string | readonly string[],
  x: number,
  y: number,
  size: number,
): boolean {
  for (const name of typeof names === "string" ? [names] : names) {
    if (!hasImage(name)) continue;
    ctx.drawImage(images.get(name)!, x, y, size, size);
    return true;
  }
  return false;
}

/** 覚えている素材の数。設定画面が「何枚読み込めているか」を出すのに使う。 */
export const imageCount = (): number => images.size;

export function clearImages(): void {
  images.clear();
}
