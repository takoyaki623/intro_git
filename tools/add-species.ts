/**
 * 種を足す（v0.11）。
 *
 *   npx vite-node tools/add-species.ts steelix tyranitar …
 *
 * v0.9.5 で確かめたことが1つある ―― **手入力は、量が少なくても間違える。**
 * 151種を公式データと突き合わせたら、努力値の誤りが3件と名前の誤りが2件出た。
 * だから種族値もタイプも特性も**手で書かない。**
 *
 * ここが埋めるのは `source/species.tsv` の列だけ:
 *   図鑑番号・日本語名・タイプ・種族値・特性
 *
 * 数値の事実（捕獲率・成長曲線・努力値・性別比・与える経験値）は
 * `source/species-numbers.tsv` が持ち主のままで、`fetch-numbers.ts` が生成する。
 * **用途が違うデータは出典も違う**（progression.md §7.1）。
 *
 * 特性も一緒に足す。`@pkmn/dex` は特性の効果を持っていないので、
 * **効果は `inert` で入れて人が後から書く** ―― 黙って無効にしないための枠が
 * `abilities.tsv` に既にある（v0.5 から）。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { Dex } from "@pkmn/dex";

const DATA = "packages/data";
const SPECIES = `${DATA}/source/species.tsv`;
const ABILITIES = `${DATA}/source/abilities.tsv`;

/** Showdown の ID は区切り無し（`mrmime`）。当プロジェクトは `mr-mime`。 */
const flat = (id: string) => id.replace(/[^a-z0-9]/g, "");

/**
 * 日本語名。
 *
 * `@pkmn/dex` は英語名しか持たないので、**ここだけは人が書く。**
 * 突き合わせる相手が居ない列なので、間違えても誰も止めてくれない ――
 * 逆に言えば、他の列を機械に任せた意味はここに集中している。
 */
const JA: Record<string, string> = Object.fromEntries(
  readFileSync("tools/species-ja.tsv", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "" && !line.startsWith("#"))
    .map((line) => line.split("\t") as [string, string]),
);

/** 特性の日本語名。同上。無ければ英語名のまま入れて、名指しで警告する。 */
const ABILITY_JA: Record<string, string> = Object.fromEntries(
  readFileSync("tools/abilities-ja.tsv", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "" && !line.startsWith("#"))
    .map((line) => line.split("\t") as [string, string]),
);

const lines = (path: string) => readFileSync(path, "utf8").replace(/\n$/, "").split(/\r?\n/);

function main(): void {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (wanted.length === 0) throw new Error("足す種の ID を並べてください");

  const speciesLines = lines(SPECIES);
  const have = new Set(
    speciesLines.filter((l) => !l.startsWith("#") && l.includes("\t")).map((l) => l.split("\t")[0]),
  );
  have.delete("id");

  const abilityLines = lines(ABILITIES);
  const haveAbility = new Set(
    abilityLines.filter((l) => !l.startsWith("#") && l.includes("\t")).map((l) => l.split("\t")[0]),
  );
  haveAbility.delete("id");

  const dex = Dex.forGen(9);
  const added: string[] = [];
  const newAbilities: string[] = [];
  /** 日本語名が無いまま入った特性。**黙って英語名を残さない。** */
  const untranslated: string[] = [];
  const skipped: string[] = [];

  for (const id of wanted) {
    if (have.has(id)) {
      skipped.push(`${id}（すでに居る）`);
      continue;
    }
    const s = dex.species.get(flat(id));
    if (!s.exists) {
      skipped.push(`${id}（@pkmn/dex に無い）`);
      continue;
    }
    const ja = JA[id];
    if (ja === undefined) {
      skipped.push(`${id}（日本語名が tools/species-ja.tsv に無い）`);
      continue;
    }

    // 特性は「通常特性のみ」。隠れ特性は原作でも入手経路が別なので、
    // ネームドに持たせる理由が無い（要るようになったら足す）
    const abilities: string[] = [s.abilities[0], s.abilities[1]].filter(
      (a) => a !== undefined && a !== "",
    ) as string[];
    const abilityIds = abilities.map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    for (const [i, abilityId] of abilityIds.entries()) {
      if (haveAbility.has(abilityId)) continue;
      haveAbility.add(abilityId);
      const abilityJa = ABILITY_JA[abilityId];
      if (abilityJa === undefined) untranslated.push(abilityId);
      // 効果は人が書く。inert は「まだ何もしない」を**理由つきで宣言する**枠
      newAbilities.push(`${abilityId}\t${abilityJa ?? abilities[i] ?? abilityId}\tinert:未実装（v0.11 で追加）`);
    }

    const st = s.baseStats;
    added.push(
      [
        id,
        s.num,
        ja,
        s.types[0]!.toLowerCase(),
        s.types[1]?.toLowerCase() ?? "-",
        st.hp,
        st.atk,
        st.def,
        st.spa,
        st.spd,
        st.spe,
        st.hp + st.atk + st.def + st.spa + st.spd + st.spe,
        abilityIds.join(","),
      ].join("\t"),
    );
    have.add(id);
  }

  if (added.length > 0) {
    writeFileSync(SPECIES, `${[...speciesLines, ...added].join("\n")}\n`, "utf8");
  }
  if (newAbilities.length > 0) {
    writeFileSync(ABILITIES, `${[...abilityLines, ...newAbilities].join("\n")}\n`, "utf8");
  }

  console.log(`  種 ${added.length}件 を ${SPECIES} に足しました`);
  for (const row of added) console.log(`    ${row.split("\t").slice(0, 3).join(" ")}`);
  if (newAbilities.length > 0) {
    console.log(`\n  特性 ${newAbilities.length}件 を ${ABILITIES} に足しました（すべて inert）`);
    for (const row of newAbilities) console.log(`    ${row.split("\t").slice(0, 2).join(" ")}`);
    console.log("  ** 効果は人が書く。書くまで戦闘中は何もしない **");
  }
  if (untranslated.length > 0) {
    console.log(`\n  ⚠ 日本語名が無い特性 ${untranslated.length}件（英語名のまま入りました）:`);
    console.log(`    ${untranslated.join(" ")}`);
    console.log("    tools/abilities-ja.tsv に足して、abilities.tsv の name を直してください");
  }
  if (skipped.length > 0) {
    console.log(`\n  足さなかったもの ${skipped.length}件:`);
    for (const s of skipped) console.log(`    ${s}`);
  }
  console.log("\n  次: npm run fetch:numbers && npm run import && npm run fetch:official && npm run data");
}

main();
