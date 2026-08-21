/**
 * 種族の「数値の事実」を公式データから取り込む（v0.9.5）。
 *
 * v0.8 で learnset は公式データになったが、**捕獲率・成長曲線・努力値・性別比は
 * 手入力のまま**で、与える経験値（`baseExp`）に至っては種族値合計からの推定だった。
 * 検証が毎回「全件が暫定」と報告していた借り（progression.md §7）。
 *
 * `@pkmn/dex`（対戦用データ）にはこれらが無い ―― 対戦の計算に使わないため。
 * 代わりに **`pokedex` パッケージが同梱している veekun の CSV** を使う。
 * PokéAPI と同じ出典で、捕獲率・base_experience・成長曲線・努力値・日本語名を持つ。
 *
 *   npx vite-node tools/fetch-numbers.ts
 *
 * `fetch-official.ts` と同じ方針:
 * **取り込みは人が明示的に走らせ、結果は TSV としてコミットする。**
 * ビルドを外部データに依存させない（数値と構造情報なのでコミットできる）。
 *
 * 設計: docs/design/progression.md §7 / docs/design/data-schema.md §2
 */

import { readFileSync, writeFileSync } from "node:fs";

const CSV = "node_modules/pokedex/data/csv";
const OUT = "packages/data/source/species-numbers.tsv";
const SPECIES = "packages/data/source/species.tsv";

/**
 * veekun の CSV は引用符つきのフィールド（成長曲線の数式など）を含む。
 * **素朴な split(",") では壊れる**ので最小限のパーサを持つ。
 */
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

  const head = rows.shift() ?? [];
  return rows
    .filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/** veekun の成長曲線名 → 本プロジェクトの `ExpType`（types.ts の EXP_TYPES）。 */
const GROWTH: Record<string, string> = {
  slow: "slow",
  medium: "medium-fast",
  fast: "fast",
  "medium-slow": "medium-slow",
  "slow-then-very-fast": "erratic",
  "fast-then-very-slow": "fluctuating",
};

/** veekun の能力名 → 本プロジェクトの略号。 */
const STAT: Record<string, string> = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
};

/** 日本語（カタカナ）。veekun の `local_language_id` で 1 = ja-Hrkt。 */
const JAPANESE = "1";

function main(): void {
  const species = parseCsv("pokemon_species.csv");
  const pokemon = parseCsv("pokemon.csv").filter((p) => p.is_default === "1");
  const names = parseCsv("pokemon_species_names.csv").filter((n) => n.local_language_id === JAPANESE);
  const stats = parseCsv("pokemon_stats.csv");
  const statName = Object.fromEntries(parseCsv("stats.csv").map((s) => [s.id, s.identifier]));
  const growth = Object.fromEntries(parseCsv("growth_rates.csv").map((g) => [g.id, g.identifier]));

  const speciesById = new Map(species.map((s) => [s.identifier!, s]));
  const monById = new Map(pokemon.map((p) => [p.identifier!, p]));
  const nameBySpecies = new Map(names.map((n) => [n.pokemon_species_id!, n.name!]));

  // 努力値は「1行1能力」なので畳む
  const evByPokemon = new Map<string, Record<string, number>>();
  for (const s of stats) {
    if (s.effort === "0") continue;
    const key = STAT[statName[s.stat_id!] ?? ""];
    if (key === undefined) continue;
    const cur = evByPokemon.get(s.pokemon_id!) ?? {};
    cur[key] = Number(s.effort);
    evByPokemon.set(s.pokemon_id!, cur);
  }

  // 出力するのは species.tsv に載っている種だけ。
  // **全1000種を書き出さない** ―― 使っていないデータを抱えても検証できない
  const wanted = readFileSync(SPECIES, "utf8")
    .trim()
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .slice(1)
    .map((l) => l.split("\t")[0]!);

  const rows: string[] = [];
  const missing: string[] = [];

  for (const id of wanted) {
    const sp = speciesById.get(id);
    const mon = monById.get(id);
    if (sp === undefined || mon === undefined) {
      missing.push(id);
      continue;
    }

    const ev = evByPokemon.get(mon.id!) ?? {};
    const evText = Object.entries(ev)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}:${v}`)
      .join(",");

    // veekun の gender_rate は「8分のいくつがメスか」。-1 は性別なし
    const rate = Number(sp.gender_rate);
    const gender = rate < 0 ? "-" : String((8 - rate) / 8);

    const expType = GROWTH[growth[sp.growth_rate_id!] ?? ""];
    if (expType === undefined) throw new Error(`${id}: 未知の成長曲線 ${sp.growth_rate_id}`);

    rows.push(
      [id, nameBySpecies.get(sp.id!) ?? "", sp.capture_rate, expType, evText, gender, mon.base_experience].join("\t"),
    );
  }

  if (missing.length > 0) {
    console.error(`veekun に無い種が ${missing.length} 件: ${missing.join(" ")}`);
    process.exit(1);
  }

  writeFileSync(
    OUT,
    "# 自動生成（tools/fetch-numbers.ts）。直接編集しないこと。\n" +
      "# 出典: veekun のデータセット（pokedex パッケージ同梱）。PokéAPI と同じ出典。\n" +
      "# name は species.tsv の表記を検証するためだけに置いてある（import.ts が突き合わせる）。\n" +
      "id\tname\tcatch\texp\tev\tgender\tbaseExp\n" +
      rows.join("\n") +
      "\n",
    "utf8",
  );
  console.log(`生成: ${OUT} … ${rows.length} 種`);
}

main();
