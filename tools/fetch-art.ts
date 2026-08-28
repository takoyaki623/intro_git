/**
 * 姿のレシピの下地を公式データから作る（v0.12.5）。
 *
 * **姿は「絵」ではなく「構造情報」として持てる。**
 * veekun の `pokemon_species.csv` は種族ごとに
 * **体型（shape）と体色（color）**を持っている ―― どちらも数値・分類であって
 * 画像ではないので、game-plan.md §10 のもとでコミットできる。
 *
 * ここが作るのは `packages/data/source/art.tsv` の**下地**で、
 * **原本はそのTSV**（あとから手で詰められる）。取り込み口と同じ扱い方
 * （v0.9.5 の `fetch-numbers.ts`）にしてある。
 *
 *   npx vite-node tools/fetch-art.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "./veekun.js";

const OUT = "packages/data/source/art.tsv";
const SPECIES = "packages/data/source/species.tsv";
const SPECIES_JSON = "packages/data/species.json";

/**
 * タイプから足す飾り。
 *
 * **体型は公式の分類、飾りはこちらの判断。** 分けておくと、
 * 飾りを増やしたくなったときに体型のほうを触らずに済む。
 */
const PART_BY_TYPE: Record<string, string> = {
  fire: "flame",
  grass: "plant",
  water: "fin",
  electric: "spark",
  ice: "crystal",
  poison: "drip",
  psychic: "aura",
  ghost: "aura",
  dragon: "horn",
  rock: "spike",
  ground: "spike",
  steel: "plate",
  bug: "antenna",
  flying: "wing",
  fighting: "band",
  dark: "aura",
  fairy: "sparkle",
  normal: "",
};

function main(): void {
  const species = parseCsv("pokemon_species.csv");
  const shapes = Object.fromEntries(parseCsv("pokemon_shapes.csv").map((s) => [s.id, s.identifier]));
  const colors = Object.fromEntries(parseCsv("pokemon_colors.csv").map((c) => [c.id, c.identifier]));
  const byName = new Map(species.map((s) => [s.identifier!, s]));

  const wanted = readFileSync(SPECIES, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "" && !l.startsWith("#"))
    .slice(1)
    .map((l) => l.split("\t")[0]!.trim())
    .filter((id) => id !== "");

  const types = new Map<string, string[]>(
    (JSON.parse(readFileSync(SPECIES_JSON, "utf8")) as { id: string; types: string[] }[]).map(
      (s) => [s.id, s.types],
    ),
  );

  const missing: string[] = [];
  // **大きさも公式の数値から。** 進化前後が同じ絵にならない効きが大きい
  const heights = new Map(
    parseCsv("pokemon.csv")
      .filter((p) => p.is_default === "1")
      .map((p) => [p.identifier!, Number(p.height)]),
  );
  const sizeOf = (id: string): string => {
    const h = heights.get(id) ?? 10;
    if (h <= 5) return "tiny";
    if (h <= 10) return "small";
    if (h <= 17) return "medium";
    return "large";
  };

  const lines = ["species\tshape\tcolor\tsize\tparts"];
  for (const id of wanted) {
    const row = byName.get(id);
    if (row === undefined) {
      missing.push(id);
      continue;
    }
    const parts = (types.get(id) ?? [])
      .map((t) => PART_BY_TYPE[t] ?? "")
      .filter((p) => p !== "");
    lines.push(
      [
        id,
        shapes[row.shape_id!] ?? "blob",
        colors[row.color_id!] ?? "gray",
        sizeOf(id),
        [...new Set(parts)].join(","),
      ].join("\t"),
    );
  }

  writeFileSync(OUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`姿のレシピの下地を書きました: ${OUT}（${lines.length - 1}種）`);
  if (missing.length > 0) {
    console.log(`  公式データに見つからなかった種: ${missing.join(" ")}`);
  }
  const used = new Set(lines.slice(1).map((l) => l.split("\t")[1]));
  console.log(`  体型は ${used.size} 種類: ${[...used].sort().join(" ")}`);
}

main();
