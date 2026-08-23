/**
 * わざマシンの対応表を公式データから取り込む（v1.1-b）。
 *
 * veekun の `machines.csv`（version_group 7 = FRLG）に、
 * **どの番号がどの技を教えるか**が全部入っている。番号と技の対応は
 * 記憶で書くと必ずどこかがずれるので、取り込む。
 *
 * 出すのは58行**すべて**で、道具にしないものには理由を書く ――
 * 「入れていないこと」と「入れ忘れ」を区別するための運用
 * （`moves-todo.tsv` と同じ・data-schema.md §6）。
 *
 *   npm run fetch:machines
 */

import { readFileSync, writeFileSync } from "node:fs";

const CSV = "node_modules/pokedex/data/csv";
const OUT = "packages/data/source/machines.tsv";
/** FRLG。出現表の取り込みと同じ版を見る（fetch-encounters.ts）。 */
const VERSION_GROUP = "7";

function parseCsv(file: string): Record<string, string>[] {
  const lines = readFileSync(`${CSV}/${file}`, "utf8").split(/\r?\n/).filter((l) => l !== "");
  const head = lines[0]!.split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""]));
  });
}

function main(): void {
  const moves = Object.fromEntries(parseCsv("moves.csv").map((m) => [m["id"]!, m["identifier"]!]));
  const items = Object.fromEntries(parseCsv("items.csv").map((i) => [i["id"]!, i["identifier"]!]));

  // 生成物ではなく原本を読む（fetch-official.ts と同じ理由 ――
  // moves.json を読むと「技を足す → import → ここ」の順に縛られる）
  const ours = new Set(
    readFileSync("packages/data/source/moves.tsv", "utf8")
      .split(/\r?\n/)
      .slice(1)
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t")[0]!),
  );

  /**
   * 互換表に載っている技（v1.1-b）。
   *
   * **マシンの版と互換表の版が違う。** マシン番号は FRLG（第3世代）で、
   * 互換表（`Species.tmMoves`）は第9〜7世代から採っている ―― でんげきは のように
   * 「原作ではマシンだが、いま誰もマシンでは覚えない」技が出る。
   * 道具にすると**置いてあるが一生使えない**ので、ここで落とす。
   */
  const learnable = new Set(
    readFileSync("packages/data/source/learnsets.tsv", "utf8")
      .split(/\r?\n/)
      .slice(1)
      .filter((line) => line.trim() !== "")
      .flatMap((line) => (line.split("\t")[3] ?? "").split(",").filter(Boolean)),
  );

  const rows = parseCsv("machines.csv")
    .filter((r) => r["version_group_id"] === VERSION_GROUP)
    .map((r) => ({
      id: items[r["item_id"]!]!,
      number: Number(r["machine_number"]),
      move: moves[r["move_id"]!]!,
    }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.number - b.number);

  const out: string[] = [];
  const skipped = new Map<string, number>();
  let made = 0;
  for (const row of rows) {
    // **秘伝マシンは道具にしない。** 本作に秘伝技は無く、フィールド技は
    // プレイヤー自身が持つ（world.md §7）。技として存在するものもあるが、
    // 「教える道具」にすると廃止した機構が裏口から戻ってくる
    const skip = row.id.startsWith("hm")
      ? "秘伝マシンは道具にしない（world.md §7）"
      : !ours.has(row.move)
        ? "技が未実装（moves-todo.tsv）"
        : !learnable.has(row.move)
          ? "互換表に持つ種がいない（マシンの版と互換表の版が違う）"
          : "";
    if (skip === "") made += 1;
    else skipped.set(skip, (skipped.get(skip) ?? 0) + 1);
    out.push([row.id, String(row.number), row.move, skip].join("\t"));
  }

  writeFileSync(OUT, `id\tnumber\tmove\tskip\n${out.join("\n")}\n`, "utf8");
  console.log(`${OUT} … ${rows.length} 件`);
  console.log(`  道具にする ${made} 件`);
  for (const [reason, n] of [...skipped].sort((a, b) => b[1] - a[1])) {
    console.log(`  作らない ${n} 件: ${reason}`);
  }
}

main();
