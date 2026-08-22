/**
 * フィールド技（v0.12-d）。
 *
 * 原作の秘伝技を廃止し、進行能力は**プレイヤー自身が持つ**（world.md §7）。
 * 手持ちに秘伝要員を1匹置き続ける必要がなくなり、
 * 「技を覚えさせる／忘れさせる」というサブシステムが丸ごと要らなくなる。
 *
 * ここにあるのは判定だけで、**何が解放条件かはデータ**
 * （`packages/data/field-abilities.json`）。地方が増えても関数は増えない。
 */

import { evaluate, type WorldState } from "./event.js";
import type { FieldAbility, FieldAbilityId, MapId, MapObject } from "./types.js";

/** 今このプレイヤーが使えるフィールド技。 */
export function fieldAbilitiesFor(
  all: readonly FieldAbility[],
  world: WorldState,
): FieldAbilityId[] {
  return all.filter((a) => evaluate(a.requires, world)).map((a) => a.id);
}

/**
 * どけた障害物の目印。
 *
 * **マップIDまで含める。** オブジェクトIDはマップの中でしか一意でないので、
 * 名前だけで覚えると「別の町の岩が最初から消えている」ことが起きる。
 */
export const obstacleKey = (map: MapId, object: MapObject): string => `${map}:${object.id}`;

/**
 * 障害物をどけられるか。
 *
 * **どけた記録は保存しない**（`WorldState.cleared` はセーブに載せない）。
 * 原作でも岩や木はマップを出入りすると元に戻る。
 * 保存しないと決めておくと、セーブに「世界のどこを壊したか」が溜まらずに済む。
 */
export function canClear(world: WorldState, object: MapObject): boolean {
  return object.kind.type === "obstacle" && world.abilities.includes(object.kind.clearedBy);
}
