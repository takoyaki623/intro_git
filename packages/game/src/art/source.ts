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
 * ## 手元の素材の入れ方
 *
 * **設定画面から自分の端末の画像を選ぶ。** 選んだものは IndexedDB に入り、
 * ページには同梱されないので公衆送信にならない。開発でも遊ぶときでも同じ道。
 *
 * ここには長らく「開発時は `assets/tiles/*.png` を vite が配信する」と書いてあったが、
 * **それを読みに行くコードは無い**（v1.3-d で確かめた）。
 * `assets/` を置いても何も起きないので、書き置きのほうを実際に合わせた。
 *
 * 無ければ `drawn` に落ちるので、素材が欠けていても絵が変わるだけで遊べる。
 */

/** 画像の置き場。ここに無い名前は `drawn` が描く。 */
const images = new Map<string, HTMLImageElement>();

let mode: "drawn" | "local" = "drawn";

export const artMode = (): "drawn" | "local" => mode;

export function useArtMode(next: "drawn" | "local"): void {
  mode = next;
  // `hasImage` は mode を見るので、切り替えたら貼り直す
  publishSkins();
}

/**
 * 素材を1枚覚える。
 *
 * `local` でも**ここに無いものは `drawn` が描く。**
 * 全部そろって初めて絵になる、という形にしない ―― 1枚ずつ足せる方がよい。
 */
export function putImage(name: string, image: HTMLImageElement): void {
  images.set(name, image);
  publishSkins();
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

/**
 * 素材の URL。**canvas ではなく DOM に貼るとき**に使う（v0.12.5）。
 * ポケモンの姿はバトル画面の DOM に置くので、`drawImage` では届かない。
 */
export const imageSrc = (name: string): string | null =>
  hasImage(name) ? images.get(name)!.src : null;

/** 覚えている素材の数。設定画面が「何枚読み込めているか」を出すのに使う。 */
export const imageCount = (): number => images.size;

export function clearImages(): void {
  images.clear();
  publishSkins();
}

/**
 * DOM に貼る素材の口（v1.3-d）。
 *
 * ここまで差し替えられたのは**タイルと姿だけ**だった。
 * 画面の作りを原作に寄せた（v1.3-a〜c）ので、**窓の枠・HP箱・バトルの背景**にも
 * 同じ口を用意する ―― 手元に素材を置けば、そこも原作の絵になる。
 *
 * | ファイル名 | 貼る先 | 無いとき |
 * | --- | --- | --- |
 * | `ui-frame.png` | 会話窓・てもち/どうぐ/ずかん の窓 | CSS で描く枠 |
 * | `ui-frame-battle.png` | バトルのメッセージ窓（無ければ `ui-frame`） | 同上 |
 * | `ui-hpbox-foe.png` / `ui-hpbox-own.png` | HP箱 | CSS の箱 |
 * | `battle-bg.png` | バトルの背景 | 空と地面の2色 |
 *
 * **名前は平たくする**（`ui/frame` ではなく `ui-frame`）。
 * 絵の名前はファイル名そのままという規約（`store.ts` の `artName`）なので、
 * 斜線を含む名前は**ファイル名では作れない** ―― 作っても永久に差し替わらない口になる。
 *
 * **枠の素材は縁 8px で切る**（`border-image` の 9分割）。
 * 中央は伸ばすので、角と辺が 8px の枠なら形が崩れない。
 *
 * 貼り方は CSS 変数にする ―― 画面ごとに「素材があるか」を聞いて回ると、
 * 聞き忘れた画面だけ差し替わらない。**1か所で全部の変数を出し直す。**
 */
const SKINS: readonly { name: string; varName: string; fallback?: string }[] = [
  { name: "ui-frame", varName: "--ui-frame" },
  { name: "ui-frame-battle", varName: "--ui-frame-battle", fallback: "ui-frame" },
  { name: "ui-hpbox-foe", varName: "--ui-hpbox-foe" },
  { name: "ui-hpbox-own", varName: "--ui-hpbox-own" },
  { name: "battle-bg", varName: "--battle-bg" },
];

export function publishSkins(): void {
  const root = document.documentElement;
  for (const skin of SKINS) {
    const src = imageSrc(skin.name) ?? (skin.fallback === undefined ? null : imageSrc(skin.fallback));
    if (src === null) root.style.removeProperty(skin.varName);
    else root.style.setProperty(skin.varName, `url("${src}")`);
  }
}
