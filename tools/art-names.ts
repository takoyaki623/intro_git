/**
 * 素材のファイル名の一覧を書き出す（v1.6）。
 *
 * 口は v0.10.5 から開いていたが、**どう名付ければ当たるのかを知る手段が無かった。**
 * 設定画面にも一覧を出したが、手元でファイルを並べ替えるときは
 * 画面より**表のほうが使いやすい**ので、同じ一覧をファイルにも出す。
 *
 *   npx vite-node tools/art-names.ts   → dist/asset-names.tsv
 *
 * ポケモンには**図鑑番号の列も付ける。** 手元の素材が番号で並んでいることが多く、
 * `001.png → species-bulbasaur.png` の対応が要るのはそこだけ。
 *
 * **素材そのものはこの道具に一切関係しない。** 作るのは名前の表だけで、
 * 絵は利用者が自分の端末から入れる（game-plan.md §10）。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { allSlots } from "../packages/game/src/art/slots.js";

const OUT = "dist/asset-names.tsv";

type Species = { id: string; name: string; dexNo: number };

function main(): void {
  const species = JSON.parse(readFileSync("packages/data/species.json", "utf8")) as Species[];
  const maps = JSON.parse(readFileSync("packages/data/maps.json", "utf8")) as never[];
  const trainers = JSON.parse(readFileSync("packages/data/trainers.json", "utf8")) as {
    id: string;
    name: string;
    class: string;
  }[];
  const dexOf = new Map(species.map((s) => [`species-${s.id}`, s.dexNo]));

  const slots = allSlots({ species, maps, trainers });
  const lines = ["ずかん番号\tファイル名\tなに"];
  for (const slot of slots) {
    const dex = dexOf.get(slot.name);
    lines.push(`${dex === undefined ? "" : String(dex).padStart(3, "0")}\t${slot.name}.png\t${slot.label}`);
  }
  mkdirSync("dist", { recursive: true });
  writeFileSync(OUT, `${lines.join("\n")}\n`, "utf8");

  const groups = new Map<string, number>();
  for (const slot of slots) groups.set(slot.group, (groups.get(slot.group) ?? 0) + 1);
  console.log(`  ${slots.length}この なまえを ${OUT} に書きました`);
  for (const [name, n] of groups) console.log(`    ${name}: ${n}`);
}

main();
