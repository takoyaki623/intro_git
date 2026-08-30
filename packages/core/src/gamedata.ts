/**
 * マスタデータ参照の interface。
 *
 * core はこの interface しか知らない。packages/data は実装を提供するだけ。
 * これにより v0.1 のテストは「5種・8技だけの GameData」を渡せる。
 * データを静的 import すると、この性質が失われる。
 *
 * 依存の向き game → core → data は「型の依存」であって「実体の依存」ではない。
 * 設計: docs/design/battle-system.md §1
 */

import type {
  Ability,
  AbilityId,
  Ball,
  Item,
  ItemId,
  ExpType,
  Move,
  MoveId,
  NatureId,
  NatureModifier,
  Species,
  SpeciesId,
  TypeChart,
} from "./types.js";

export interface GameData {
  species(id: SpeciesId): Species;
  move(id: MoveId): Move;
  /**
   * 全部の技の ID（v1.2-d）。**ゆびをふる だけが要る。**
   *
   * ここまで core は「id を渡して引く」しか持っていなかった ――
   * 一覧を持たせると、次に何を足しても「core が世界の全部を見られる」
   * 状態に近づく。それでも足したのは、ゆびをふる が
   * **「全部の技から選ぶ」ことそのものが効果**の技だから。
   * 引ける形（id の配列）に留めて、実体は返さない。
   */
  moveIds(): readonly MoveId[];
  nature(id: NatureId): NatureModifier;
  /** v0.5 で追加。特性・持ち物も他のマスタデータと同じく注入で受け取る。 */
  ability(id: AbilityId): Ability;
  item(id: ItemId): Item;
  /** ボールの捕獲補正（v0.8）。ボールでない道具を渡すと投げる。 */
  ball(id: ItemId): Ball;
  /** 成長曲線。添字がレベル（1〜100）で、値は到達に必要な累計経験値（v0.8）。 */
  expTable(type: ExpType): readonly number[];
  readonly typeChart: TypeChart;
}

/** 参照先が存在しない場合に投げる。検証スクリプト(v0.4)が本来これを未然に防ぐ。 */
export class MissingDataError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} not found: "${id}"`);
    this.name = "MissingDataError";
  }
}
