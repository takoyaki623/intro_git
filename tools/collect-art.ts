/**
 * 手元の素材を、当たる名前で1つのフォルダに集める（v1.6-b）。
 *
 *   npm run art:collect -- <入力フォルダ> [出力フォルダ] [--dry]
 *   （出力の既定は assets/collected ―― `.gitignore` で止まっている場所）
 *
 * ## やらないことを3つ決めてある
 *
 * - **入力を1バイトも変えない。** 読むだけで、コピー先に新しく書く。
 * - **素材を取ってこない。** 集めるのは、すでに手元にあるものだけ
 *   （公式素材の入手はこの道具の外側・game-plan.md §10）。
 * - **迷ったら黙って決めない。** 2つ以上に当たるものはコピーせずに報告する。
 *
 * ## 判定はここに書かない
 *
 * 同じ判定がスマホ側（設定画面）にも要る ―― あちらには node が無いので、
 * この道具を回せない。2つ書くと**片方だけ直した跡が残る**ので、
 * 判定は `packages/game/src/art/match.ts` の1つを両方から呼ぶ。
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { buildIndex, matchArtName } from "../packages/game/src/art/match.js";
import { allSlots } from "../packages/game/src/art/slots.js";

const IMAGE = new Set([".png", ".gif", ".jpg", ".jpeg", ".webp", ".bmp"]);

const args = process.argv.slice(2).filter((a) => a !== "--");
const dry = args.includes("--dry");
const [inDir, outArg] = args.filter((a) => a !== "--dry");
const outDir = outArg ?? "assets/collected";

if (inDir === undefined) {
  console.error("つかいかた: npm run art:collect -- <入力フォルダ> [出力フォルダ] [--dry]");
  process.exit(1);
}
if (!existsSync(inDir)) {
  console.error(`入力フォルダが ありません: ${inDir}`);
  process.exit(1);
}

type Species = { id: string; name: string; dexNo: number };
const species = JSON.parse(readFileSync("packages/data/species.json", "utf8")) as Species[];
const maps = JSON.parse(readFileSync("packages/data/maps.json", "utf8")) as never[];
const trainers = JSON.parse(readFileSync("packages/data/trainers.json", "utf8")) as
  { id: string; name: string; class: string }[];
const index = buildIndex(species);
const known = new Set(allSlots({ species, maps, trainers }).map((s) => s.name));

/** 入力の中の画像を全部拾う（下の階層も見る）。 */
function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (IMAGE.has(extname(entry).toLowerCase())) found.push(path);
  }
  return found;
}

const files = walk(inDir);
const plan = new Map<string, string>();
/** 2まい以上当たって、どれも採らないことにした名前。 */
const taken = new Set<string>();
const unmatched: string[] = [];
const ambiguous: string[] = [];

for (const file of files) {
  const found = matchArtName(basename(file), index, known);
  if (found.kind === "unknown") {
    unmatched.push(file);
    continue;
  }
  if (found.kind === "ambiguous") {
    ambiguous.push(`${basename(file)} → ${found.candidates.join(" / ")}`);
    continue;
  }
  const name = found.name;
  const already = plan.get(name);
  if (already !== undefined) {
    /*
     * **先に見つけたほうを勝たせない。** 2まい当たったら両方コピーしない ――
     * ここで片方を採ると「たまたま歩いた順」で絵が決まることになり、
     * 報告を読んでも**もう直っている（間違ったまま）**という状態になる。
     */
    plan.delete(name);
    taken.add(name);
    ambiguous.push(`${name} に 2まい: ${basename(already)} / ${basename(file)}`);
    continue;
  }
  if (taken.has(name)) {
    ambiguous.push(`${name} に さらに: ${basename(file)}`);
    continue;
  }
  plan.set(name, file);
}

if (!dry) mkdirSync(outDir, { recursive: true });
for (const [name, file] of plan) {
  if (!dry) copyFileSync(file, join(outDir, `${name}${extname(file).toLowerCase()}`));
}

const missing = species.filter((s: Species) => !plan.has(`species-${s.id}`));
console.log("");
console.log(`  入力 ${files.length}まい（${inDir}）`);
console.log(`  ${dry ? "コピーする予定" : "コピーした"}: ${plan.size}まい → ${outDir}`);
console.log(`  ポケモン ${species.length - missing.length} / ${species.length} 種`);
if (missing.length > 0) {
  const show = missing.slice(0, 8).map((s: Species) => `${s.dexNo}:${s.id}`).join(" ");
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
