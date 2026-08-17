/**
 * 1件追加するときの雛形を出す。必須項目の書き漏らしを防ぐ。
 *
 *   npx vite-node tools/scaffold.ts species pikachu-clone
 *   npx vite-node tools/scaffold.ts move flame-wheel
 *
 * 出力はそのまま source/*.tsv に貼れる1行。
 * 設計: docs/design/data-schema.md §8
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../packages/data/source");

const TEMPLATES: Record<string, Record<string, string>> = {
  species: {
    id: "<id>", dex: "0", name: "<なまえ>", type1: "normal", type2: "-",
    hp: "50", atk: "50", def: "50", spa: "50", spd: "50", spe: "50",
    bst: "300  ← 各能力の合計と一致させること（照合される）",
    abilities: "run-away", catch: "255", exp: "medium-fast", ev: "hp:1", gender: "0.5",
  },
  move: {
    id: "<id>", name: "<わざめい>", type: "normal", category: "physical",
    power: "60", accuracy: "100", pp: "20", priority: "0", crit: "0",
    effect: "（例: status:burn:0.1 / statChange:foe:atk:-1:1 / drain:0.5）",
    target: "foe",
  },
};

const kind = process.argv[2];
const id = process.argv[3];

if (kind === undefined || TEMPLATES[kind] === undefined) {
  console.error("使い方: scaffold.ts <species|move> [id]");
  process.exit(1);
}

const file = kind === "species" ? "species.tsv" : "moves.tsv";
const header = readFileSync(resolve(SRC, file), "utf8").split("\n")[0]!.split("\t");
const tpl = { ...TEMPLATES[kind]! };
if (id !== undefined) tpl["id"] = id;

console.log(`# ${file} に追記する1行（列: ${header.length}）`);
console.log(header.join("\t"));
console.log(header.map((h) => tpl[h] ?? "").join("\t"));
console.log();
console.log("追記後: npm run data  （投入 → ID型生成 → 検証）");
