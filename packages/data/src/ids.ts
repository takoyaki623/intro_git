/**
 * 生成した ID 型の使い道（v0.9.5）。
 *
 * `tools/gen-ids.ts` は v0.4 から ID のユニオン型を生成し、CI は「生成物が古くないか」を
 * 毎回確かめてきた。**その検証はずっと通っていたが、誰も参照していなかった。**
 * 当初の目的（補完が効く・タイプミスがコンパイルエラーになる）は5バージョン達成されていない。
 *
 * v0.9.5 で繋ごうとして、**この構造では型として効かない**ことが分かった。
 *
 *   1. TS は JSON import の文字列を `string` に広げる。
 *      `facilities.json` の `"battle-towr"` をユニオンで検査することは**原理的にできない**
 *   2. `gameData.species(id)` を狭めると、`PokemonInstance.species`（設計上 `string`）を
 *      渡せなくなる。**`GameData` 注入の意味そのものが壊れる** ―― core は
 *      「2種2技だけの GameData」でも動かねばならず、151種に縛った時点でそれが崩れる
 *
 * したがって役割を縮める。
 *
 * > **JSON に書いた ID の持ち主は型ではなく `tools/validate.ts`。**
 * > **型で守れるのは「人が TS にリテラルで書いた ID」だけ。** それがここ。
 *
 * 使い方は恒等関数を1枚かませるだけ。
 *
 * ```ts
 * const START = { map: mapId("kanto-players-house-1f"), x: 3, y: 5 };
 * //                    ^ タイプミスはここでコンパイルエラーになる
 * ```
 *
 * 設計: docs/design/data-schema.md §3
 */

import type {
  GeneratedAbilityId,
  GeneratedBattleSetId,
  GeneratedCupId,
  GeneratedEncounterTableId,
  GeneratedEventId,
  GeneratedFacilityId,
  GeneratedFlagId,
  GeneratedItemId,
  GeneratedMapId,
  GeneratedMoveId,
  GeneratedNamedId,
  GeneratedNatureId,
  GeneratedRegionId,
  GeneratedShopId,
  GeneratedSpeciesId,
  GeneratedTrainerId,
} from "../generated/ids.js";

export type {
  GeneratedAbilityId,
  GeneratedBattleSetId,
  GeneratedCupId,
  GeneratedEncounterTableId,
  GeneratedEventId,
  GeneratedFacilityId,
  GeneratedFlagId,
  GeneratedItemId,
  GeneratedMapId,
  GeneratedMoveId,
  GeneratedNamedId,
  GeneratedNatureId,
  GeneratedRegionId,
  GeneratedShopId,
  GeneratedSpeciesId,
  GeneratedTrainerId,
};

/**
 * **返り値は `string` に広げる。**
 *
 * 狭いまま返すと、受け取る側（`PlayerPosition.map` など core の `string` 型）に
 * 入れた瞬間にどうせ広がる。それでいて「狭い型が流れている」という誤解だけが残る。
 * ここでやりたいのは**書いた瞬間の検査**であって、型を持ち回ることではない。
 */
const check =
  <T extends string>() =>
  (id: T): string =>
    id;

export const speciesId = check<GeneratedSpeciesId>();
export const moveId = check<GeneratedMoveId>();
export const natureId = check<GeneratedNatureId>();
export const abilityId = check<GeneratedAbilityId>();
export const itemId = check<GeneratedItemId>();
export const battleSetId = check<GeneratedBattleSetId>();
export const facilityId = check<GeneratedFacilityId>();
export const namedId = check<GeneratedNamedId>();
export const cupId = check<GeneratedCupId>();
export const mapId = check<GeneratedMapId>();
export const eventId = check<GeneratedEventId>();
export const trainerId = check<GeneratedTrainerId>();
export const encounterTableId = check<GeneratedEncounterTableId>();
export const shopId = check<GeneratedShopId>();
export const regionId = check<GeneratedRegionId>();
export const flagId = check<GeneratedFlagId>();
