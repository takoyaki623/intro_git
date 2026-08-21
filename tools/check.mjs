/**
 * 全部まとめて確かめる（v0.10.5）。
 *
 *   npm run check
 *
 * v0.10 まで、`check` は5つのコマンドを `&&` で繋いだ1行だった。
 * 通れば緑・落ちれば赤で機能はしていたが、**出力が日英ちゃんぽん**で
 * （tsc は無言、vitest は英語、検証は日本語）、
 * 何がどこまで通ったのかを読み取るのに毎回スクロールが要った。
 *
 * ここでは**結果を日本語で1枚にまとめる。** 各段の生の出力は失敗したときだけ出す
 * ―― 成功しているときに読む必要のあるものは、要約だけで足りる。
 */

import { spawnSync } from "node:child_process";

/** 1段ぶんの定義。`summary` は生の出力から1行を作る。 */
const STEPS = [
  {
    name: "型検査",
    run: ["npx", ["tsc", "--noEmit"]],
    summary: () => "通過（TypeScript strict）",
  },
  {
    name: "テスト",
    run: ["npx", ["vitest", "run", "--reporter", "dot"]],
    summary: (out) => {
      const tests = /Tests\s+(\d+) passed/.exec(out)?.[1] ?? "?";
      const files = /Test Files\s+(\d+) passed/.exec(out)?.[1] ?? "?";
      const time = /Duration\s+([\d.]+m?s)/.exec(out)?.[1] ?? "?";
      return `${tests}件 すべて緑（${files}ファイル・${time}）`;
    },
  },
  {
    name: "データ検証",
    run: ["npx", ["vite-node", "tools/validate.ts"]],
    summary: (out) => {
      const warns = /検証を通過（警告 (\d+) 件）/.exec(out)?.[1] ?? "?";
      const scale = /検証対象: (.+)/.exec(out)?.[1] ?? "";
      return { line: `通過（警告 ${warns}件）`, detail: scale };
    },
  },
  {
    name: "マップ",
    run: ["npx", ["vite-node", "tools/convert-map.ts", "--check"]],
    summary: (out) => (out.includes("最新") ? "最新（原本と JSON が一致）" : out.trim()),
  },
  {
    name: "ID型",
    run: ["npx", ["vite-node", "tools/gen-ids.ts", "--check"]],
    summary: (out) => (out.includes("最新") ? "最新（生成物と JSON が一致）" : out.trim()),
  },
];

/** 半角は0.5文字ぶんとして数え、見出しの幅を揃える。 */
const width = (s) => [...s].reduce((n, c) => n + (/[\x20-\x7e]/.test(c) ? 1 : 2), 0);
const pad = (s) => s + " ".repeat(Math.max(0, 10 - width(s)));

let failed = null;
const results = [];

for (const step of STEPS) {
  const [cmd, args] = step.run;
  const started = Date.now();
  const proc = spawnSync(cmd, args, { encoding: "utf8" });
  const out = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (proc.status !== 0) {
    results.push({ name: step.name, ok: false, line: "落ちた", seconds });
    failed = { step, out };
    break;
  }
  const summary = step.summary(out);
  results.push({
    name: step.name,
    ok: true,
    seconds,
    ...(typeof summary === "string" ? { line: summary } : summary),
  });
}

console.log("");
for (const r of results) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${pad(r.name)}… ${r.line}  (${r.seconds}秒)`);
  if (r.detail !== undefined) console.log(`    ${" ".repeat(10)}  ${r.detail}`);
}

if (failed !== null) {
  console.log(`\n  ── 「${failed.step.name}」の出力 ─────────────────────────`);
  console.log(failed.out.trimEnd());
  console.log("\n  ✗ ここで止まりました。上の出力を見てください。\n");
  process.exit(1);
}

console.log("\n  すべて通りました。\n");
