/**
 * ビルド結果を1枚の HTML にまとめる（スマホで遊ぶ用の配信物）。
 *
 *   npm run build && node tools/bundle-artifact.mjs
 *   → dist/pokemon-rpg.html
 *
 * Artifact は <!doctype>…<head>…<body> の骨組みを公開時に付けるので、
 * ここでは **body の中身だけ** を出す。外部ファイルは全て埋め込む
 * （外部ホストへの読み込みは CSP で止まるため）。
 *
 * 公式素材は1枚も含まれない ―― アセット無しで成立させてある
 * （docs/game-plan.md §10）ので、そのまま配れる。
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DIST = "packages/game/dist";
const OUT_DIR = "dist";
const OUT = join(OUT_DIR, "pokemon-rpg.html");

const assets = readdirSync(join(DIST, "assets"));
const one = (ext) => {
  const found = assets.filter((f) => f.endsWith(ext));
  if (found.length !== 1) throw new Error(`${ext} が ${found.length} 件（1件のはず）`);
  return readFileSync(join(DIST, "assets", found[0]), "utf8");
};

const html = readFileSync(join(DIST, "index.html"), "utf8");
const title = /<title>(.*?)<\/title>/.exec(html)?.[1];
if (title === undefined) throw new Error("index.html に <title> が無い");

// </script> がスクリプト本体に現れると、そこで閉じてしまう
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");

const out = `<title>${title}</title>
<style>
${one(".css")}
</style>
<div id="app"></div>
<script type="module">
${safe(one(".js"))}
</script>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, out, "utf8");
console.log(`${OUT} … ${(out.length / 1024).toFixed(0)} KB`);
