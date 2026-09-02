/**
 * ID のユニオン型を JSON から生成する。
 *
 *   packages/data/**\/*.json  （正）
 *          │  tools/gen-ids.ts
 *          ▼
 *   packages/data/generated/ids.d.ts
 *
 * ID を string 別名のままにすると、数千箇所の参照でタイプミスが検出されない。
 * 生成物はコミットし、CI で再生成して差分が出たら失敗させる。
 * 設計: docs/design/data-schema.md §3
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = resolve(ROOT, "packages/data");
const OUT = resolve(DATA, "generated/ids.d.ts");

type Entry = { id: string };

function idsOf(file: string): string[] {
  const items = JSON.parse(readFileSync(resolve(DATA, file), "utf8")) as Entry[];
  return items.map((i) => i.id).sort();
}

/** flags.json は文字列の配列。id を持つ形ではない。 */
function plainIdsOf(file: string): string[] {
  const items = JSON.parse(readFileSync(resolve(DATA, file), "utf8")) as string[];
  return [...items].sort();
}

function union(name: string, ids: readonly string[]): string {
  if (ids.length === 0) return `export type ${name} = never;`;
  const body = ids.map((id) => `  | ${JSON.stringify(id)}`).join("\n");
  return `export type ${name} =\n${body};`;
}

export function generate(): string {
  const species = idsOf("species.json");
  const moves = idsOf("moves.json");
  const natures = idsOf("natures.json");
  const abilities = idsOf("abilities.json");
  const items = idsOf("items.json");
  const battleSets = idsOf("battle-sets.json");
  const facilities = idsOf("facilities.json");
  const named = idsOf("named.json");
  const cups = idsOf("tournaments.json");
  const maps = idsOf("maps.json");
  const events = idsOf("events.json");
  const trainers = idsOf("trainers.json");
  const encounterTables = idsOf("encounters.json");
  const shops = idsOf("shops.json");
  const regions = idsOf("regions.json");
  const flags = plainIdsOf("flags.json");

  return `/**
 * 自動生成ファイル。直接編集しないこと。
 *   再生成: npm run gen:ids
 *
 * 種族 ${species.length} / 技 ${moves.length} / 性格 ${natures.length} /
 * 特性 ${abilities.length} / 道具 ${items.length} /
 * BattleSet ${battleSets.length} / 施設 ${facilities.length} /
 * ネームド ${named.length} / カップ ${cups.length} /
 * マップ ${maps.length} / イベント ${events.length} / トレーナー ${trainers.length} /
 * 出現テーブル ${encounterTables.length} / ショップ ${shops.length} / 地方 ${regions.length} /
 * フラグ ${flags.length}
 */

${union("GeneratedSpeciesId", species)}

${union("GeneratedMoveId", moves)}

${union("GeneratedNatureId", natures)}

${union("GeneratedAbilityId", abilities)}

${union("GeneratedItemId", items)}

${union("GeneratedBattleSetId", battleSets)}

${union("GeneratedFacilityId", facilities)}

${union("GeneratedNamedId", named)}

${union("GeneratedCupId", cups)}

${union("GeneratedMapId", maps)}

${union("GeneratedEventId", events)}

${union("GeneratedTrainerId", trainers)}

${union("GeneratedEncounterTableId", encounterTables)}

${union("GeneratedShopId", shops)}

${union("GeneratedRegionId", regions)}

${union("GeneratedFlagId", flags)}
`;
}

function main(): void {
  const out = generate();
  mkdirSync(dirname(OUT), { recursive: true });

  // --check: 差分があれば失敗する（CI 用）
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8");
    } catch {
      console.error("生成物がありません: npm run gen:ids を実行してください");
      process.exit(1);
    }
    if (current !== out) {
      console.error("生成物が古くなっています: npm run gen:ids を実行してコミットしてください");
      process.exit(1);
    }
    console.log("ID 型は最新です");
    return;
  }

  writeFileSync(OUT, out);
  console.log(`生成: ${OUT.replace(ROOT + "/", "")}`);
}

// CLI スクリプトなので常に実行する。
// 「自分が直接実行されたときだけ」という条件を付けていたが、
// vite-node 経由では成立せず、--check が何も検証せずに通っていた。
main();
