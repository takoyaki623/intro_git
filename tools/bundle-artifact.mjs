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
const OUT_STANDALONE = join(OUT_DIR, "pokemon-rpg-standalone.html");

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

/*
 * **そのまま開く用の1枚**（v1.6-d）。
 *
 * 上の `out` は Artifact 用の**断片**で、`<!doctype>` も `<head>` も無い ――
 * 公開時に骨組みが付く前提だから。それをそのままスマホへ送って開くと:
 *
 *   - `meta viewport` が無い  … 980px の幅で組んで縮小される（指で押せない）
 *   - `meta charset` が無い    … 日本語が化けることがある
 *   - `<!doctype>` が無い      … 互換モードになり、箱の大きさの規則が変わる
 *
 * **実際に送って「動かない」と言われた。** 断片を単体のファイルとして
 * 渡したのが間違いで、渡すなら骨組みを付けたほうを渡す。
 *
 * 撮影で気づけなかった理由もはっきりしている ―― Playwright の `viewport` は
 * **表示領域を直接決める**ので、`meta viewport` が無いことを隠してしまう。
 * `isMobile: true` にすると初めて 980px で組まれる（下の probe で確かめた）。
 */
const body = out.replace(/^<title>.*?<\/title>\n/u, "");
const standalone = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title}</title>
</head>
<body>
${body}</body>
</html>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, out, "utf8");
writeFileSync(OUT_STANDALONE, standalone, "utf8");
console.log(`${OUT} … ${(out.length / 1024).toFixed(0)} KB（Artifact 用の断片）`);
console.log(`${OUT_STANDALONE} … ${(standalone.length / 1024).toFixed(0)} KB（そのまま開く用）`);
