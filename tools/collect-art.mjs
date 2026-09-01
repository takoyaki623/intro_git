/**
 * 手元の素材を、当たる名前で1つのフォルダに集める（v1.6-b）。
 *
 *   node tools/collect-art.mjs <入力フォルダ> [出力フォルダ] [--dry]
 *   （出力の既定は assets/collected ―― `.gitignore` で止まっている場所）
 *
 * ## なぜ道具にするのか
 *
 * 差し替え口の名前は 453 こある（`art-names.ts`）。手元の素材は
 * `001.png` や `pikachu.png` のように**別の並び**で来るのが普通で、
 * **228回の手作業**を挟むと、そこで力尽きるか綴りを間違える。
 *
 * ## やらないこと
 *
 * - **入力を1バイトも変えない。** 読むだけで、コピー先に新しく書く。
 * - **素材を取ってこない。** 集めるのは、すでに手元にあるものだけ
 *   （公式素材の入手はこの道具の外側・game-plan.md §10）。
 * - **迷ったら黙って決めない。** 2つ以上に当たる名前は「あいまい」として報告し、
 *   コピーしない ―― 間違った1枚が混ざるより、報告して手で決めるほうがよい。
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

const IMAGE = new Set([".png", ".gif", ".jpg", ".jpeg", ".webp", ".bmp"]);

const [, , inDir, outArg, ...rest] = process.argv;
const dry = rest.includes("--dry") || outArg === "--dry";
const outDir = outArg !== undefined && outArg !== "--dry" ? outArg : "assets/collected";

if (inDir === undefined) {
  console.error("つかいかた: node tools/collect-art.mjs <入力フォルダ> [出力フォルダ] [--dry]");
  process.exit(1);
}
if (!existsSync(inDir)) {
  console.error(`入力フォルダが ありません: ${inDir}`);
  process.exit(1);
}

/** 見出しの揺れを吸う。`Mr. Mime` も `mr-mime` も同じ鍵にする。 */
const norm = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

const species = JSON.parse(readFileSync("packages/data/species.json", "utf8"));

/**
 * 手元のファイル名から種を引くための表。
 *
 * **1つの鍵が2種に当たったら、その鍵は捨てる。** 残しておくと
 * 「たまたま先に見つかったほう」が選ばれ、静かに間違った絵が入る。
 */
const byKey = new Map();
const drop = new Set();
const remember = (key, id) => {
  if (key === "" || drop.has(key)) return;
  const seen = byKey.get(key);
  if (seen !== undefined && seen !== id) {
    byKey.delete(key);
    drop.add(key);
    return;
  }
  byKey.set(key, id);
};
for (const s of species) {
  remember(norm(s.id), s.id);
  remember(norm(s.name), s.id);
  remember(String(s.dexNo), s.id);
  remember(String(s.dexNo).padStart(3, "0"), s.id);
}

/** 入力の中の画像を全部拾う（下の階層も見る）。 */
function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (IMAGE.has(extname(entry).toLowerCase())) found.push(path);
  }
  return found;
}

/**
 * ファイル名から鍵の候補を作る。
 *
 * `025 Pikachu.png` は「025」でも「pikachu」でも当たる ――
 * **どちらか片方の並びしか想定しない**と、もう片方の持ち主が使えない。
 */
function keysOf(file) {
  const stem = basename(file, extname(file));
  const keys = [norm(stem)];
  const digits = stem.match(/\d+/g) ?? [];
  for (const d of digits) {
    keys.push(String(Number(d)));
    keys.push(d.padStart(3, "0"));
  }
  for (const word of stem.split(/[^A-Za-z]+/)) if (word !== "") keys.push(norm(word));
  return keys;
}

const files = walk(inDir);
const plan = new Map();
const unmatched = [];
const ambiguous = [];
/** 2まい以上当たって、どれも採らないことにした種。 */
const taken = new Set();

for (const file of files) {
  const hits = new Set();
  for (const key of keysOf(file)) {
    const id = byKey.get(key);
    if (id !== undefined) hits.add(id);
  }
  if (hits.size === 0) {
    unmatched.push(file);
    continue;
  }
  if (hits.size > 1) {
    ambiguous.push(`${file} → ${[...hits].join(" / ")}`);
    continue;
  }
  const id = [...hits][0];
  const already = plan.get(id);
  if (already !== undefined) {
    /*
     * **先に見つけたほうを勝たせない。** 2まい当たったら両方コピーしない ――
     * ここで片方を採ると「たまたま歩いた順」で絵が決まることになり、
     * 報告を読んでも**もう直っている（間違ったまま）**という状態になる。
     */
    plan.delete(id);
    taken.add(id);
    ambiguous.push(`species-${id} に 2まい: ${already} / ${file}`);
    continue;
  }
  if (taken.has(id)) {
    ambiguous.push(`species-${id} に さらに: ${file}`);
    continue;
  }
  plan.set(id, file);
}

if (!dry) mkdirSync(outDir, { recursive: true });
for (const [id, file] of plan) {
  const dest = join(outDir, `species-${id}${extname(file).toLowerCase()}`);
  if (!dry) copyFileSync(file, dest);
}

const missing = species.filter((s) => !plan.has(s.id));
console.log("");
console.log(`  入力 ${files.length}まい（${inDir}）`);
console.log(`  ${dry ? "コピーする予定" : "コピーした"}: ${plan.size}まい → ${outDir}`);
console.log(`  ポケモン ${plan.size} / ${species.length} 種`);
if (missing.length > 0) {
  const show = missing.slice(0, 8).map((s) => `${s.dexNo}:${s.id}`).join(" ");
  console.log(`  まだ ない ${missing.length}種: ${show}${missing.length > 8 ? " ほか" : ""}`);
}
if (ambiguous.length > 0) {
  console.log(`  あいまい ${ambiguous.length}件（コピーしていない）:`);
  for (const line of ambiguous.slice(0, 10)) console.log(`    ${line}`);
}
if (unmatched.length > 0) {
  console.log(`  どれにも あたらない ${unmatched.length}まい:`);
  for (const line of unmatched.slice(0, 10)) console.log(`    ${basename(line)}`);
}
console.log("");
console.log("  ポケモン以外（マス・ひと・窓）は `npm run art:names` の表を見て手で名付ける。");
console.log("");
