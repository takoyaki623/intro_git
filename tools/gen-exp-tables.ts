/**
 * 経験値テーブルの生成（v0.8）。
 *
 * 6種類の成長曲線 × Lv100 = 600行にすぎないので、
 * **実行時に毎回計算せずテーブルとして持つ**（progression.md §7）。
 *
 * 式は世代を通じて変わらない定義なので、外部データではなくここに書く。
 * 正しさは「Lv100 到達値」が設計文書の表と一致するかで確かめる（末尾の照合）。
 *
 *   npx vite-node tools/gen-exp-tables.ts
 */

import { writeFileSync } from "node:fs";

const OUT = "packages/data/exp-tables.json";

/** レベル n に到達するのに必要な累計経験値。 */
const CURVES: Record<string, (n: number) => number> = {
  erratic: (n) => {
    if (n < 50) return Math.floor((n ** 3 * (100 - n)) / 50);
    if (n < 68) return Math.floor((n ** 3 * (150 - n)) / 100);
    if (n < 98) return Math.floor((n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500);
    return Math.floor((n ** 3 * (160 - n)) / 100);
  },
  fast: (n) => Math.floor((4 * n ** 3) / 5),
  "medium-fast": (n) => n ** 3,
  "medium-slow": (n) => Math.floor((6 * n ** 3) / 5 - 15 * n ** 2 + 100 * n - 140),
  slow: (n) => Math.floor((5 * n ** 3) / 4),
  fluctuating: (n) => {
    if (n < 15) return Math.floor((n ** 3 * (Math.floor((n + 1) / 3) + 24)) / 50);
    if (n < 36) return Math.floor((n ** 3 * (n + 14)) / 50);
    return Math.floor((n ** 3 * (Math.floor(n / 2) + 32)) / 50);
  },
};

/** progression.md §7 の表。ここと一致しなければ式が違う。 */
const AT_100: Record<string, number> = {
  erratic: 600_000,
  fast: 800_000,
  "medium-fast": 1_000_000,
  "medium-slow": 1_059_860,
  slow: 1_250_000,
  fluctuating: 1_640_000,
};

const tables: Record<string, number[]> = {};
for (const [id, f] of Object.entries(CURVES)) {
  // 添字 = レベル。0 番目は使わないので 0 を置く
  const table = [0];
  for (let level = 1; level <= 100; level += 1) table.push(Math.max(0, f(level)));

  // Lv1 は定義として 0。erratic の式は n=1 で 1 を返すが、
  // 原作のテーブルは 0 から始まる（式は Lv2 以降を与えるもの）
  table[1] = 0;

  // 単調増加であること
  if (table[1] !== 0) throw new Error(`${id}: Lv1 の必要経験値が ${table[1]}（0 のはず）`);
  for (let level = 2; level <= 100; level += 1) {
    if (table[level]! < table[level - 1]!) throw new Error(`${id}: Lv${level} で減っている`);
  }
  if (table[100] !== AT_100[id]) {
    throw new Error(`${id}: Lv100 が ${table[100]}（設計文書は ${AT_100[id]}）`);
  }
  tables[id] = table;
}

writeFileSync(OUT, `${JSON.stringify(tables)}\n`, "utf8");
console.log(`${OUT} … ${Object.keys(tables).length} 種類 × Lv100`);
for (const [id, table] of Object.entries(tables)) {
  console.log(`  ${id.padEnd(12)} Lv50 ${String(table[50]).padStart(8)} / Lv100 ${String(table[100]).padStart(9)}`);
}
