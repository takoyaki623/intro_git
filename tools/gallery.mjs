/**
 * 撮った画面を1枚の HTML にまとめる（v0.10.5）。
 *
 *   npm run dev      （別のターミナルで）
 *   npm run shots
 *   npm run gallery
 *
 * **見た目に自動判定は無い**（shots.mjs の頭に書いたとおり）。
 * なら「見る」側をちゃんと作る。ここで作るのは
 *
 *   - 画像を data URI で埋めた**1枚だけの HTML**（外部参照ゼロ）
 *   - スマホ幅／広い幅の切り替え
 *   - 凡例の色を **tiles.ts から読んで**並べた対照表
 *
 * 1枚に閉じてあるのは、**そのまま Artifact にできる**ため。
 * ファイルを配らないと見られない形にすると、結局スマホで確認できない。
 *
 * 凡例をソースから読むのは、**手で書き写すと必ずずれる**から
 * （v0.9.5 で 151種の手入力から3件の間違いが出たのと同じ話）。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SHOTS = "dist/shots";
const OUT = process.argv[2] ?? join(SHOTS, "gallery.html");

const places = JSON.parse(readFileSync(join(SHOTS, "index.json"), "utf8"));

/**
 * 凡例の色を `art/tiles.ts` の `TILE_HINT` から拾う。
 * 「文字 → 色 → 意味」がソースに揃って書いてあるので、そのまま読む。
 */
function tileHints() {
  const source = readFileSync("packages/game/src/art/tiles.ts", "utf8");
  const body = source.slice(source.indexOf("TILE_HINT"), source.indexOf("};", source.indexOf("TILE_HINT")));
  const out = [];
  for (const line of body.split("\n")) {
    const hit = /^\s*(\w):\s*"(#[0-9a-fA-F]{6})",\s*\/\/\s*(.+?)\s*$/.exec(line);
    if (hit !== null) out.push({ char: hit[1], color: hit[2], label: hit[3] });
  }
  return out;
}

/** PNG を data URI にする。**外部ホストを1つも使わない**のが条件。 */
const dataUri = (file) =>
  `data:image/png;base64,${readFileSync(join(SHOTS, file)).toString("base64")}`;

const escape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let bytes = 0;
const sheetOf = (rows) => rows
  .map((place) => {
    const phone = dataUri(`${place.file}-phone.png`);
    const wide = dataUri(`${place.file}-wide.png`);
    bytes += phone.length + wide.length;
    const [map, x, y] = place.to;
    const slug = map === "—"
      ? `<span class="id">${escape(place.file)}</span>`
      : `<span class="id">${escape(map)}</span><span class="at">${escape(x)},${escape(y)}</span>`;
    return `      <figure class="shot">
        <div class="slug">${slug}</div>
        <div class="frame">
          <img class="phone" src="${phone}" alt="${escape(place.name)}（スマホ幅）" loading="lazy" />
          <img class="wide" src="${wide}" alt="${escape(place.name)}（広い幅）" loading="lazy" />
        </div>
        <figcaption>
          <b>${escape(place.name)}</b>
          <span>${escape(place.note)}</span>
        </figcaption>
      </figure>`;
  })
  .join("\n");

const maps = sheetOf(places.filter((p) => p.group !== "画面"));
const screens = sheetOf(places.filter((p) => p.group === "画面"));

const legend = tileHints()
  .map(
    (hint) => `      <li>
        <span class="chip" style="background:${hint.color}"></span>
        <span class="char">${escape(hint.char)}</span>
        <span class="label">${escape(hint.label)}</span>
        <span class="hex">${escape(hint.color)}</span>
      </li>`,
  )
  .join("\n");

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

const html = `<title>v0.11.5 描画チェックシート</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
/>
<style>
  /*
    暗い方を基本にしている。ドット絵は暗い地の上で見るものだから ――
    明るい方は「明るい環境で見る人のための同じ表」として別に組む。
  */
  :root {
    color-scheme: dark light;
    --bg: #14161a;
    --panel: #1b1e24;
    --sunk: #0d0f12;
    --ink: #e7eaf0;
    --dim: #8b93a1;
    --faint: #656d7a;
    --line: #2a2f38;
    --accent: #c94f46; /* ポケモンセンターの屋根の赤（tiles.ts の P） */
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      color-scheme: light;
      --bg: #eceef2;
      --panel: #ffffff;
      --sunk: #d8dce3;
      --ink: #1c2027;
      --dim: #5c6470;
      --faint: #858d99;
      --line: #d5dae1;
      --accent: #a8362e;
    }
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --bg: #eceef2;
    --panel: #ffffff;
    --sunk: #d8dce3;
    --ink: #1c2027;
    --dim: #5c6470;
    --faint: #858d99;
    --line: #d5dae1;
    --accent: #a8362e;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 0 0 4rem;
    background: var(--bg);
    color: var(--ink);
    font-family: "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    line-height: 1.75;
    -webkit-text-size-adjust: 100%;
  }

  header {
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
    padding: 0.85rem 1rem 0.75rem;
  }
  .bar { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 0.6rem; }
  h1 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    text-wrap: balance;
  }
  .meta {
    margin: 0;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
  .switch { display: flex; gap: 0.35rem; }
  .switch button {
    flex: 1;
    padding: 0.45rem 0.5rem;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 0.72rem;
    letter-spacing: 0.05em;
    color: var(--dim);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 4px;
    cursor: pointer;
  }
  .switch button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .switch button[aria-pressed="true"] {
    color: var(--ink);
    border-color: var(--accent);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  main { max-width: 760px; margin: 0 auto; padding: 1.1rem 1rem 0; }

  .note {
    border-left: 3px solid var(--accent);
    padding: 0 0 0 0.9rem;
    margin: 0 0 1.6rem;
    font-size: 0.86rem;
    color: var(--dim);
    max-width: 62ch;
  }
  .note b { color: var(--ink); font-weight: 500; }
  .note p { margin: 0 0 0.5rem; }
  .note p:last-child { margin-bottom: 0; }

  h2 {
    margin: 2.2rem 0 0.9rem;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--faint);
    padding-bottom: 0.45rem;
    border-bottom: 1px solid var(--line);
  }
  h2:first-of-type { margin-top: 0; }

  .sheet { display: flex; flex-direction: column; gap: 1.8rem; }
  .shot { margin: 0; }

  .slug {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    color: var(--faint);
    padding-bottom: 0.35rem;
    font-variant-numeric: tabular-nums;
  }
  .slug .at { margin-left: auto; }

  .frame {
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: 3px;
    overflow-x: auto;
    display: flex;
    justify-content: center;
  }
  .frame img {
    display: block;
    max-width: 100%;
    height: auto;
    image-rendering: pixelated;
  }
  body[data-size="phone"] .wide { display: none; }
  body[data-size="wide"] .phone { display: none; }

  figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    padding-top: 0.5rem;
  }
  figcaption b { font-size: 0.92rem; font-weight: 500; }
  figcaption span { font-size: 0.8rem; color: var(--dim); }

  .legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.15rem; }
  .legend li {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.32rem 0.1rem;
    border-bottom: 1px solid var(--line);
  }
  .legend li:last-child { border-bottom: 0; }
  .chip { width: 20px; height: 20px; border-radius: 3px; flex: none; }
  .legend .char {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink);
    width: 1.2rem;
  }
  .legend .label { font-size: 0.82rem; }
  .legend .hex {
    margin-left: auto;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 0.68rem;
    color: var(--faint);
  }

  footer {
    max-width: 760px;
    margin: 2.5rem auto 0;
    padding: 1rem;
    font-size: 0.76rem;
    color: var(--faint);
    border-top: 1px solid var(--line);
  }

  @media (prefers-reduced-motion: no-preference) {
    .shot { animation: rise 0.4s ease both; }
    @keyframes rise {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: none; }
    }
  }
</style>

<header>
  <div class="bar">
    <h1>v0.11.5 ― 見た目チェック</h1>
    <p class="meta">${places.filter((p) => p.group === "画面").length} SCREENS / ${
      places.filter((p) => p.group !== "画面").length
    } PLACES / SHOT ${stamp} UTC</p>
    <div class="switch">
      <button type="button" data-set="phone" aria-pressed="true">スマホ幅 420px</button>
      <button type="button" data-set="wide" aria-pressed="false">広い幅 900px</button>
    </div>
  </div>
</header>

<main>
  <div class="note">
    <p>
      <b>見た目に自動判定は無い。</b>撮って並べて目で見るしかないので、見るための道具の方を作った。
    </p>
    <p>
      <b>v0.11.5（見た目②）で変えたのはバトル画面と UI 全体。</b>
      いちばん効いたのは演出を足したことではなく、
      <b>バトル画面が毎イベント作り直されていたのをやめた</b>こと ――
      作り直している限り、HPバーの補間も揺れも、始まった瞬間に要素ごと消えていた。
      その上で、技を出したら前に出る／被弾で揺れる（ばつぐんと急所は強く）／
      ひんしで落ちる／タイプ色が場を1瞬染める、を足した。
    </p>
    <p>
      <b>この写真では書体が本来のものではない。</b>
      見出しと会話には Google Fonts の DotGothic16 を指定してあるが、
      撮影環境から fonts.googleapis.com へ出られないため、フォールバックの和文ゴシックで写っている。
      （フォールバックでも成立するように積んであるので、これはこれで想定どおりの姿）
    </p>
    <p>
      v0.10.5（見た目①）で入れたマップ側は<b>オートタイル</b>・
      <b>建物のまとまり描画</b>・<b>足元の影</b>。
      <b>データは1文字も変えていない。</b>絵も1枚も足していない ――
      公式素材はこの公開リポジトリに入れられないので（game-plan.md §10）、
      既定は「コードで描く」のまま。
    </p>
  </div>

  <h2>Screens</h2>
  <div class="sheet">
${screens}
  </div>

  <h2>Places</h2>
  <div class="sheet">
${maps}
  </div>

  <h2>Tile legend</h2>
  <ul class="legend">
${legend}
  </ul>
</main>

<footer>
  凡例の色は <code>packages/game/src/art/tiles.ts</code> から読み出している。
  手で書き写すとずれるため。
</footer>

<script>
  const body = document.body;
  body.dataset.size = "phone";
  const buttons = document.querySelectorAll(".switch button");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      body.dataset.size = button.dataset.set;
      for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
    });
  }
</script>
`;

writeFileSync(OUT, html, "utf8");
console.log(`  ${places.length}か所を 1枚にまとめました: ${OUT}`);
console.log(`  画像 ${(bytes / 1024 / 1024).toFixed(2)}MB ぶんを埋め込み（外部参照なし）`);
