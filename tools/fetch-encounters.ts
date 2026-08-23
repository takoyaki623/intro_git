/**
 * 出現テーブルを公式データから取り込む（v1.1-a）。
 *
 * **出現表は手入力しない。**
 * veekun の CSV（v0.9.5 から `baseExp` の取り込みに使っている）に、
 * FRLG のカントーの出現データが**全部入っている** ―― 種・レベル帯・出現率・
 * 引き方（歩き／なみのり／さお3段／いわくだき）が、場所ごと・階ごとに。
 *
 * 絵ではなく数値と分類なので、game-plan.md §10 のもとでこのリポジトリに置ける
 * （`fetch-numbers.ts` / `fetch-art.ts` と同じ扱い）。
 *
 * **今あるマップのぶんだけ出す。** 地図を1枚足したら `SOURCE` に1行足して回し直すと、
 * そのマップの出現表がついてくる ―― これが「1件足すコストをゼロに近づける」の素直な形。
 *
 *   npx vite-node tools/fetch-encounters.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { EncounterTable, MapData } from "@pkmn/core";

const CSV = "node_modules/pokedex/data/csv";
const MAPS = "packages/data/maps.json";
const SPECIES = "packages/data/species.json";
const OUT = "packages/data/encounters.json";

/** FRLG。赤緑（1/2）ではなく FRLG を採るのは、種と場所がいちばん揃っているため。 */
const VERSION = "10";

/**
 * 本作のマップ → 公式データの場所（と階）。
 *
 * **ここに無いマップには出現表を出さない。** 名前から機械的に導くこともできるが、
 * 導くと「綴りを間違えたマップに黙って出現表が付かない」ことが起きる。
 * 対応は手で書き、書いていないものは報告する。
 */
const SOURCE: Record<string, { location: string; area?: string }> = {
  "kanto-pallet-town": { location: "pallet-town" },
  "kanto-viridian-city": { location: "viridian-city" },
  "kanto-cerulean-city": { location: "cerulean-city" },
  // クチバだけ `area` を明示する。公式データは町の本体を**空文字のエリア**として持ち、
  // 同じ場所に `ss-anne-dock` がぶら下がっている ―― 省略すると
  // SSアンヌ号の埠頭の出現が町の海に混ざる（SSアンヌ号は v1.1-g）
  "kanto-vermilion-city": { location: "vermilion-city", area: "" },
  "kanto-celadon-city": { location: "celadon-city" },
  "kanto-fuchsia-city": { location: "fuchsia-city" },
  "kanto-cinnabar-island": { location: "cinnabar-island" },
  "kanto-viridian-forest": { location: "viridian-forest" },
  "kanto-mt-moon": { location: "mt-moon" },
  "kanto-victory-road": { location: "kanto-victory-road-2" },
  "kanto-pokemon-tower": { location: "pokemon-tower" },
  "kanto-route-1": { location: "kanto-route-1" },
  "kanto-route-2": { location: "kanto-route-2" },
  "kanto-route-2-north": { location: "kanto-route-2" },
  "kanto-route-3": { location: "kanto-route-3" },
  "kanto-route-4": { location: "kanto-route-4" },
  "kanto-route-5": { location: "kanto-route-5" },
  "kanto-route-6": { location: "kanto-route-6" },
  "kanto-route-7": { location: "kanto-route-7" },
  "kanto-route-8": { location: "kanto-route-8" },
  "kanto-route-11": { location: "kanto-route-11" },
  "kanto-route-16": { location: "kanto-route-16" },
  "kanto-route-19": { location: "kanto-sea-route-19" },
  "kanto-route-20": { location: "kanto-sea-route-20" },
  "kanto-route-21": { location: "kanto-sea-route-21" },
  "kanto-route-22": { location: "kanto-route-22" },
  "kanto-route-23": { location: "kanto-route-23" },
};

/** 公式の引き方 → 本作の引き方。`walk` だけは地形で分かれるので後で決める。 */
const METHOD: Record<string, EncounterTable["method"] | "walk"> = {
  walk: "walk",
  surf: "surf",
  "old-rod": "fishing-old",
  "good-rod": "fishing-good",
  "super-rod": "fishing-super",
  "rock-smash": "rock-smash",
};

function parseCsv(file: string): Record<string, string>[] {
  const text = readFileSync(`${CSV}/${file}`, "utf8");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0]!;
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function main(): void {
  const maps = JSON.parse(readFileSync(MAPS, "utf8")) as MapData[];
  const species = JSON.parse(readFileSync(SPECIES, "utf8")) as { id: string; dexNo: number }[];
  const byNo = new Map(species.map((s) => [s.dexNo, s.id]));

  const locations = Object.fromEntries(
    parseCsv("locations.csv").map((l) => [l["id"]!, l["identifier"]!]),
  );
  const areas = parseCsv("location_areas.csv");
  const slots = Object.fromEntries(parseCsv("encounter_slots.csv").map((s) => [s["id"]!, s]));
  const methods = Object.fromEntries(
    parseCsv("encounter_methods.csv").map((m) => [m["id"]!, m["identifier"]!]),
  );
  const encounters = parseCsv("encounters.csv").filter((e) => e["version_id"] === VERSION);

  /** 場所＋階 → エリアID。階を書かなければその場所の全エリアをまとめる。 */
  const areasOf = (location: string, area: string | undefined): Set<string> =>
    new Set(
      areas
        .filter(
          (a) =>
            locations[a["location_id"]!] === location &&
            (area === undefined || a["identifier"] === area),
        )
        .map((a) => a["id"]!),
    );

  const out: EncounterTable[] = [];
  const missingSpecies = new Set<string>();
  const report: string[] = [];

  for (const map of maps) {
    const source = SOURCE[map.id];
    if (source === undefined) continue;
    const wanted = areasOf(source.location, source.area);
    if (wanted.size === 0) {
      report.push(`  ! ${map.id}: 公式データに "${source.location}" が無い`);
      continue;
    }

    // 歩きの表が「くさむら」か「どうくつ」かは、そのマップの地形が決める
    const walkMethod: EncounterTable["method"] = map.terrain.includes("cave") ? "cave" : "grass";

    /** 引き方ごとに、種＋レベル帯でまとめて出現率を足す。 */
    const buckets = new Map<string, Map<string, { species: string; lo: number; hi: number; rate: number }>>();
    for (const e of encounters) {
      if (!wanted.has(e["location_area_id"]!)) continue;
      const slot = slots[e["encounter_slot_id"]!]!;
      const raw = METHOD[methods[slot["encounter_method_id"]!]!];
      if (raw === undefined) continue;
      const method = raw === "walk" ? walkMethod : raw;

      const id = byNo.get(Number(e["pokemon_id"]));
      if (id === undefined) {
        missingSpecies.add(e["pokemon_id"]!);
        continue;
      }
      const lo = Number(e["min_level"]);
      const hi = Number(e["max_level"]);
      const key = `${id}|${lo}|${hi}`;
      const bucket = buckets.get(method) ?? new Map();
      const found = bucket.get(key) ?? { species: id, lo, hi, rate: 0 };
      found.rate += Number(slot["rarity"]);
      bucket.set(key, found);
      buckets.set(method, bucket);
    }

    for (const [method, bucket] of [...buckets].sort()) {
      const entries = [...bucket.values()].sort((a, b) => b.rate - a.rate || a.species.localeCompare(b.species));
      out.push({
        id: `${map.id}-${method}`,
        method: method as EncounterTable["method"],
        entries: entries.map((e) => ({ species: e.species, levelRange: [e.lo, e.hi], rate: e.rate })),
      });
    }
  }

  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  const wild = new Set(out.flatMap((t) => t.entries.map((e) => e.species)));
  console.log(`出現表を書きました: ${OUT}`);
  console.log(`  ${out.length}表 / 野生に出る種 ${wild.size}`);
  const byMethod = new Map<string, number>();
  for (const t of out) byMethod.set(t.method, (byMethod.get(t.method) ?? 0) + 1);
  console.log(`  引き方: ${[...byMethod].map(([k, n]) => `${k} ${n}`).join(" / ")}`);
  const unmapped = maps.filter((m) => m.region === "kanto" && SOURCE[m.id] === undefined && m.encounters !== undefined);
  if (unmapped.length > 0) {
    console.log(`  ! 対応表に無いのに出現表を参照しているマップ: ${unmapped.map((m) => m.id).join(" ")}`);
  }
  if (missingSpecies.size > 0) {
    console.log(`  ! species.json に無い種（図鑑番号）: ${[...missingSpecies].join(" ")}`);
  }
  for (const line of report) console.log(line);
}

main();
