/**
 * 姿の一覧を1枚にする（v0.12.5）。
 *
 * **見た目は撮って並べるしかない**（v0.10.5 の `shots` と同じ判断）。
 * ここはブラウザを使わずに済む ―― 姿は SVG なので、そのまま並べれば見える。
 *
 *   npx vite-node tools/sprite-sheet.ts   → dist/sprites.html
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { speciesSvg, type ArtRecipe } from "../packages/game/src/art/sprites.js";

const OUT = "dist/sprites.html";

type Species = { id: string; name: string; dexNo: number; types: string[] };

const escape = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function main(): void {
  const art = JSON.parse(readFileSync("packages/data/art.json", "utf8")) as ArtRecipe[];
  const species = JSON.parse(readFileSync("packages/data/species.json", "utf8")) as Species[];
  const byId = new Map(species.map((s) => [s.id, s]));

  const rows = art
    .map((a) => ({ art: a, species: byId.get(a.species) }))
    .filter((r) => r.species !== undefined)
    .sort((a, b) => a.species!.dexNo - b.species!.dexNo);

  const shapes = new Map<string, number>();
  for (const r of rows) shapes.set(r.art.shape, (shapes.get(r.art.shape) ?? 0) + 1);

  const cards = rows
    .map(
      (r) => `<figure>
        <div class="art">${speciesSvg(r.art)}</div>
        <figcaption>
          <span class="no">${String(r.species!.dexNo).padStart(3, "0")}</span>
          <b>${escape(r.species!.name)}</b>
          <span class="meta">${escape(r.art.shape)} ・ ${escape(r.art.size)}</span>
        </figcaption>
      </figure>`,
    )
    .join("\n");

  const legend = [...shapes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<li><b>${escape(k)}</b><span>${n}種</span></li>`)
    .join("");

  mkdirSync("dist", { recursive: true });
  writeFileSync(
    OUT,
    `<title>ポケモンの姿</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" />
<style>
  :root {
    color-scheme: light;
    --ground:#eef0ea; --panel:#fff; --ink:#22261f; --dim:#626a5c; --faint:#8b9382;
    --line:#d4d8cc; --accent:#4f9b46;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --ground:#171a15; --panel:#1e221b; --ink:#e6e9df; --dim:#a2ab97; --faint:#79806e;
      --line:#333829; --accent:#79c46e;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --ground:#171a15; --panel:#1e221b; --ink:#e6e9df; --dim:#a2ab97; --faint:#79806e;
    --line:#333829; --accent:#79c46e;
  }
  * { box-sizing: border-box; }
  body {
    margin:0; padding:0 0 4rem; background:var(--ground); color:var(--ink);
    font-family:"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;
    line-height:1.7; -webkit-text-size-adjust:100%;
  }
  header { border-bottom:1px solid var(--line); background:var(--panel); }
  .bar { max-width:960px; margin:0 auto; padding:1.2rem 1rem 1rem; }
  h1 { margin:0; font-size:1.15rem; font-weight:700; }
  .meta-line {
    margin:.2rem 0 0; font-family:"JetBrains Mono",ui-monospace,monospace;
    font-size:.68rem; letter-spacing:.06em; color:var(--faint);
  }
  main { max-width:960px; margin:0 auto; padding:1.2rem 1rem 0; }
  .note {
    border-left:3px solid var(--accent); padding-left:.9rem; margin:0 0 1.4rem;
    font-size:.86rem; color:var(--dim); max-width:62ch;
  }
  .note b { color:var(--ink); font-weight:500; }
  .note p { margin:0 0 .5rem; }
  .note p:last-child { margin:0; }
  ul.legend { display:flex; flex-wrap:wrap; gap:.35rem .9rem; margin:0 0 1.4rem; padding:0; list-style:none; }
  ul.legend li { display:flex; gap:.35rem; align-items:baseline; font-size:.76rem; color:var(--dim); }
  ul.legend b { font-family:"JetBrains Mono",ui-monospace,monospace; color:var(--ink); font-weight:600; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(104px,1fr)); gap:.6rem; }
  figure {
    margin:0; background:var(--panel); border:1px solid var(--line); border-radius:6px;
    padding:.5rem .4rem .55rem; text-align:center;
  }
  .art { width:100%; aspect-ratio:1; }
  figcaption { display:grid; gap:.05rem; margin-top:.2rem; }
  .no {
    font-family:"JetBrains Mono",ui-monospace,monospace; font-size:.62rem;
    color:var(--faint); font-variant-numeric:tabular-nums;
  }
  figcaption b { font-size:.8rem; font-weight:500; }
  .meta { font-size:.6rem; color:var(--faint); font-family:"JetBrains Mono",ui-monospace,monospace; }
  footer {
    max-width:960px; margin:2.4rem auto 0; padding:1rem; font-size:.76rem;
    color:var(--faint); border-top:1px solid var(--line);
  }
  code { font-family:"JetBrains Mono",ui-monospace,monospace; font-size:.74rem; }
</style>
<header><div class="bar">
  <h1>ポケモンの姿</h1>
  <p class="meta-line">GENERATED ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC / ${rows.length} 種 / FROM packages/data/art.json</p>
</div></header>
<main>
  <div class="note">
    <p><b>1体ずつ描いていない。</b>体型・体色・大きさ・飾りの組み合わせから
    コードが SVG を組む（<code>art/sprites.ts</code>）。種ごとの指定はデータ側
    （<code>source/art.tsv</code>）にあり、コードには体型14種と飾り14種しか無い。</p>
    <p><b>体型・体色・大きさは公式の分類。</b>絵ではなく分類なので、
    このリポジトリに置ける。飾りだけがタイプから足した判断。</p>
    <p><b>まだシルエットの段階。</b>目立つ種から詰めるのは次以降。</p>
  </div>
  <ul class="legend">${legend}</ul>
  <div class="grid">
${cards}
  </div>
</main>
<footer>packages/data/art.json から生成。<code>npx vite-node tools/sprite-sheet.ts</code></footer>
`,
    "utf8",
  );
  console.log(`  ${rows.length}種を1枚にまとめました: ${OUT}`);
}

main();
