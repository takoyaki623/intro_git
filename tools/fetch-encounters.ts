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
import { parseCsv } from "./veekun.js";

const MAPS = "packages/data/maps.json";
const SPECIES = "packages/data/species.json";
const OUT = "packages/data/encounters.json";

/**
 * FRLG の**両方**（10=ファイアレッド / 11=リーフグリーン）。
 *
 * 赤緑（1/2）ではなく FRLG を採るのは、種と場所がいちばん揃っているため。
 *
 * **片方だけ取っていたら、10種が野生から消えていた**（v1.1-i）――
 * サンド系・マダツボミ系・ヤドン系・ヒトデマン系・カイロス はリーフグリーン専用で、
 * ファイアレッドだけ読んでいたので「カントーに居ない種」になっていた。
 *
 * **本作に版の対はない。** 2本のソフトを買い分ける前提そのものが無いので、
 * 両方の和を取るのが正しい ―― 「交換しないと揃わない」は、
 * 交換相手が居る世界の仕様であって、この世界の仕様ではない。
 *
 * 同じ枠は種＋レベル帯でまとめて出現率を足すので、
 * 両版に居る種は2倍・片方だけの種は等倍になる ―― **専用種はそのぶん珍しい。**
 */
const VERSIONS = new Set(["10", "11"]);

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
  // **階ごとに引く**（v1.1-e）。まとめて引くと1階に地下の種が混ざる
  "kanto-mt-moon": { location: "mt-moon", area: "1f" },
  "kanto-mt-moon-b1f": { location: "mt-moon", area: "b1f" },
  "kanto-mt-moon-b2f": { location: "mt-moon", area: "b2f" },
  "kanto-victory-road": { location: "kanto-victory-road-2", area: "1f" },
  "kanto-victory-road-2f": { location: "kanto-victory-road-2", area: "2f" },
  "kanto-victory-road-3f": { location: "kanto-victory-road-2", area: "3f" },
  // **階ごとに引く**（v1.1-g-3 で 2〜7階が繋がった）。
  // まとめて引くと、1階に上の階の種が混ざる ―― おつきみやまと同じ
  "kanto-pokemon-tower": { location: "pokemon-tower", area: "1f" },
  "kanto-pokemon-tower-2f": { location: "pokemon-tower", area: "2f" },
  "kanto-pokemon-tower-3f": { location: "pokemon-tower", area: "3f" },
  "kanto-pokemon-tower-4f": { location: "pokemon-tower", area: "4f" },
  "kanto-pokemon-tower-5f": { location: "pokemon-tower", area: "5f" },
  "kanto-pokemon-tower-6f": { location: "pokemon-tower", area: "6f" },
  "kanto-route-1": { location: "kanto-route-1" },
  "kanto-route-2": { location: "kanto-route-2" },
  "kanto-route-2-north": { location: "kanto-route-2" },
  "kanto-route-3": { location: "kanto-route-3" },
  "kanto-route-4": { location: "kanto-route-4" },
  "kanto-route-5": { location: "kanto-route-5" },
  "kanto-route-6": { location: "kanto-route-6" },
  "kanto-route-7": { location: "kanto-route-7" },
  "kanto-route-8": { location: "kanto-route-8" },
  "kanto-route-9": { location: "kanto-route-9" },
  "kanto-route-10": { location: "kanto-route-10" },
  "kanto-route-11": { location: "kanto-route-11" },
  "kanto-route-12": { location: "kanto-route-12" },
  "kanto-route-13": { location: "kanto-route-13" },
  "kanto-route-14": { location: "kanto-route-14" },
  "kanto-route-15": { location: "kanto-route-15" },
  // **階ごとに分かれている**（v1.1-e）。まとめて引くと、1階に地下の種が混ざる
  "kanto-rock-tunnel-1f": { location: "rock-tunnel", area: "1f" },
  "kanto-rock-tunnel-b1f": { location: "rock-tunnel", area: "b1f" },
  "kanto-route-16": { location: "kanto-route-16" },
  // サイクリングロードと、ハナダの北の腕（v1.1-g-2）
  "kanto-route-17": { location: "kanto-route-17" },
  "kanto-route-18": { location: "kanto-route-18" },
  "kanto-route-24": { location: "kanto-route-24" },
  "kanto-route-25": { location: "kanto-route-25" },
  "kanto-route-19": { location: "kanto-sea-route-19" },
  "kanto-route-20": { location: "kanto-sea-route-20" },
  "kanto-route-21": { location: "kanto-sea-route-21" },
  // サファリゾーン（v1.1-h）。公式は4エリアに分かれている
  "kanto-safari-middle": { location: "kanto-safari-zone", area: "middle" },
  "kanto-safari-east": { location: "kanto-safari-zone", area: "area-1-east" },
  "kanto-safari-north": { location: "kanto-safari-zone", area: "area-2-north" },
  "kanto-safari-west": { location: "kanto-safari-zone", area: "area-3-west" },
  // ダンジョンと伝説の居場所（v1.1-g-2）
  "kanto-power-plant": { location: "power-plant" },
  "kanto-seafoam-1f": { location: "seafoam-islands", area: "1f" },
  "kanto-seafoam-b1f": { location: "seafoam-islands", area: "b1f" },
  "kanto-pokemon-mansion": { location: "pokemon-mansion", area: "1f" },
  "kanto-pokemon-mansion-2f": { location: "pokemon-mansion", area: "2f" },
  "kanto-cerulean-cave": { location: "cerulean-cave", area: "1f" },
  // ディグダのあな（v1.1-i）。**ここでしか出ない種が2つある**
  "kanto-diglett-cave": { location: "digletts-cave" },
  "kanto-route-22": { location: "kanto-route-22" },
  "kanto-route-23": { location: "kanto-route-23" },
};

/**
 * 野生に出さない種と、その理由（v1.1-e）。
 *
 * **公式データを黙って書き換えない。** 落とすなら理由を残す ――
 * `fetch-official.ts` の `MANUAL_REJECT`、`machines.tsv` の `skip` 列と同じ運用。
 * 機構が入った日にここから外せば、次の取り込みで戻ってくる。
 */
const NOT_YET: Record<string, string> = {
  // **メタモンの借りは v1.1-i で返した。** へんしん を実装したので野生に出せる ――
  // この表に残していた理由文が、そのまま実装の受け入れ条件になっていた。
  // 24・25番道路を足した v1.1-g-2 で2件目が出た。**メタモンと同じ形の借り。**
  // ケーシィは原作でも Lv16 まで テレポート しか覚えず、
  // あれは「野生戦から逃げる」効果で、まだ機構が無い。
  // 除いても今より減らない（ケーシィは今もトレーナーの手持ちにしか居ない）が、
  // **テレポートを入れれば3種ぶん開く**ので、借りとして残す。
  // **ケーシィの借りも v1.1-i で返した**（テレポート を実装した）。
  // 表そのものは空になったが、消さない ―― 次に「まだ出せない種」が出たとき、
  // 理由を書く場所がここにあることが分かる
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
  const encounters = parseCsv("encounters.csv").filter((e) => VERSIONS.has(e["version_id"]!));

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
  const notYet = new Set<string>();
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
      if (NOT_YET[id] !== undefined) {
        notYet.add(id);
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
  for (const id of notYet) {
    console.log(`  ! ${id} は まだ野生に出さない: ${NOT_YET[id]}`);
  }
  for (const line of report) console.log(line);
}

main();
