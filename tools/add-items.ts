/**
 * 落ちている道具を足す（v1.1-i）。
 *
 * v1.1-i で「道具のイベント」は `.map` の1行から組み立てるようになったので、
 * **足すのに書く場所は1つ**になった。ここはその1行を、置ける場所を選んで書く。
 *
 *   npx vite-node tools/add-items.ts kanto-route-9 super-potion 2
 *
 * **道具は踏んで拾う**（`item` は床）。だから通路の真ん中でも構わないが、
 * 出入口の上・他のオブジェクトの上・水の上には置かない ――
 * 水の上のは v1.1-j で実際にやって、検証に止められた。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { canEnter, emptyWorldState, terrainAt } from "@pkmn/core";
import type { MapData } from "@pkmn/core";

const DATA = "packages/data";

function main(): void {
  const [mapId, itemId, countText, hiddenText] = process.argv.slice(2);
  if (mapId === undefined || itemId === undefined) {
    console.error("使い方: add-items.ts <map> <道具> [個数] [hidden]");
    process.exit(1);
  }
  const count = Number(countText ?? "1");
  const hidden = hiddenText === "hidden";
  const maps = JSON.parse(readFileSync(`${DATA}/maps.json`, "utf8")) as MapData[];
  const map = maps.find((m) => m.id === mapId);
  if (map === undefined) throw new Error(`マップ "${mapId}" が無い`);
  const items = JSON.parse(readFileSync(`${DATA}/items.json`, "utf8")) as { id: string }[];
  if (!items.some((i) => i.id === itemId)) throw new Error(`道具 "${itemId}" が無い`);

  const world = emptyWorldState();
  const taken = new Set(map.objects.map((o) => `${o.at.x},${o.at.y}`));
  const warps = new Set(map.warps.map((w) => `${w.at.x},${w.at.y}`));
  const { width, height } = map.size;
  const key = mapId.replace(/^kanto-/, "").replace(/-/g, "");

  const spots: { x: number; y: number }[] = [];
  // **端から順ではなく、真ん中から離して置く。** 端に固めると
  // 「道の隅に一列に落ちている」不自然な絵になる
  for (let y = height - 2; y >= 1 && spots.length < count; y -= 1) {
    for (let x = width - 2; x >= 1 && spots.length < count; x -= 1) {
      if (taken.has(`${x},${y}`) || warps.has(`${x},${y}`)) continue;
      if (!canEnter(map, world, x, y, {})) continue;
      if (terrainAt(map, x, y) === "water") continue;
      if (spots.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < 5)) continue;
      spots.push({ x, y });
      taken.add(`${x},${y}`);
    }
  }
  if (spots.length < count) console.log(`  ⚠ ${mapId}: 置ける場所が ${spots.length} 箇所`);

  const used = new Set(map.objects.map((o) => o.id));
  const lines = spots.map((spot, i) => {
    let n = i + 1;
    while (used.has(`${key}-${itemId}-${n}`)) n += 1;
    used.add(`${key}-${itemId}-${n}`);
    const flag = `kanto.${key}.${itemId}${n}-taken`;
    return (
      `${key}-${itemId}-${n} ${spot.x},${spot.y} item:${itemId}${hidden ? ":hidden" : ""} ` +
      `kanto.${key}.${itemId}${n} if:${flag}=false`
    );
  });

  const source = `${DATA}/source/maps/${mapId}.map`;
  const text = readFileSync(source, "utf8").replace(/\n$/, "");
  writeFileSync(source, `${text}\n${lines.join("\n")}\n`);
  console.log(`  ${mapId} に ${lines.length} 個（${itemId}${hidden ? "・隠し" : ""}）`);
}

main();
