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
import type {
  EncounterTable,
  FieldAbility,
  FieldAbilityId,
  FieldEffect,
  MapId,
  MapObject,
  TerrainId,
} from "./types.js";

/** 省略時の効果。v0.12-d の5件はどれもこれだった。 */
export const DEFAULT_EFFECT: FieldEffect = { kind: "clear" };

export const effectOf = (ability: FieldAbility): FieldEffect => ability.effect ?? DEFAULT_EFFECT;

/** 今このプレイヤーが使えるフィールド技。 */
export function fieldAbilitiesFor(
  all: readonly FieldAbility[],
  world: WorldState,
): FieldAbilityId[] {
  return all.filter((a) => evaluate(a.requires, world)).map((a) => a.id);
}

/**
 * 派生値をまとめて入れ直す（v1.1-c）。
 *
 * `abilities` と `walkable` は**どちらもフラグとバッジから毎回導く**もので、
 * 片方だけ入れ直すと「なみのり は使えるのに水に入れない」状態になる。
 * v1.1-c で `walkable` を足したとき、**入れ忘れて実際にそうなった** ――
 * 呼ぶ側に2行書かせるのをやめて、1つの関数にする。
 */
export function syncAbilities(all: readonly FieldAbility[], world: WorldState): void {
  world.abilities = fieldAbilitiesFor(all, world);
  world.walkable = walkableTerrains(all, world.abilities);
}

/**
 * どけた障害物の目印。
 *
 * **マップIDまで含める。** オブジェクトIDはマップの中でしか一意でないので、
 * 名前だけで覚えると「別の町の岩が最初から消えている」ことが起きる。
 */
export const objectKey = (map: MapId, object: MapObject): string => `${map}:${object.id}`;

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

// ─────────────────────────────────────────────
// 何をする能力か（v1.1-c）
// ─────────────────────────────────────────────

/**
 * フィールド行動の種類ごとの処理。
 *
 * 技効果・持ち物・イベントコマンド・「つかう」効果と同じレジストリ
 * ―― **種類を1つ足したら、ここに1行足さないと型が通らない。**
 * 検証 #98 が「全 kind にハンドラがある」ことを別途見る（#21・#24・#61 と同型）。
 *
 * ここが答えるのは**「向いているマスに対して何をするか」**の1問だけ。
 * `walk` と `travel` は効く場所が違うので `null` を返す ――
 * **黙って何も書かないのと、理由つきで何もしないのは別。**
 */
export const fieldActions: {
  [K in FieldEffect["kind"]]: (
    effect: Extract<FieldEffect, { kind: K }>,
    at: FieldSpot,
  ) => FieldAction | null;
} = {
  // 障害物は `interact` が先に見つけて `{kind:"obstacle"}` を返す。
  // ここへ来るのは「岩が無いマスに いわくだき を向けた」場合なので、何も起きない
  clear: () => null,

  // 移動できるかどうかは1歩ごとの判定（`canEnter`）で効く。
  // 調べても何も起きない ―― 水面に向かって「なみのり」と念じても始まらない
  walk: () => null,

  fish: (effect, at) =>
    at.terrain === "water" ? { kind: "encounter", method: effect.method } : null,

  reveal: (_effect, at) => (at.hidden ? { kind: "reveal" } : null),

  // 行き先を選ぶのは UI（`field.ts`）。ここに持ち込むと core が画面を知ることになる
  travel: () => null,
};

/** 向いているマスの様子。`fieldActions` が見るぶんだけ。 */
export type FieldSpot = {
  terrain: TerrainId;
  /** そのマスに隠れているものがあるか。 */
  hidden: boolean;
};

/** フィールド行動の結果。**起きることだけ**を返し、演出は UI が持つ。 */
export type FieldAction =
  | { kind: "encounter"; method: EncounterTable["method"] }
  | { kind: "reveal" };

/**
 * 今の場所でそのマスに対してできること（v1.1-c）。
 *
 * **使える能力を全部試して、最初に何かできたものを返す。**
 * さおを3本持っていたら、いちばん良いものが先に当たるように
 * データの並び順で決まる ―― 「どのさおを使うか」を選ばせるのは
 * 原作にも無い操作で、選択肢が1つ増えるたびに歩みが遅くなる。
 */
export function fieldActionAt(
  all: readonly FieldAbility[],
  world: WorldState,
  at: FieldSpot,
): { ability: FieldAbility; action: FieldAction } | null {
  for (const ability of all) {
    if (!world.abilities.includes(ability.id)) continue;
    const effect = effectOf(ability);
    const action = (fieldActions[effect.kind] as (e: FieldEffect, s: FieldSpot) => FieldAction | null)(
      effect,
      at,
    );
    if (action !== null) return { ability, action };
  }
  return null;
}

/**
 * 今の能力で上を移動できる地形（v1.1-c）。
 *
 * `fieldAbilitiesFor` と対にして使う派生値 ―― どちらもセーブに載せない。
 * 地形と能力の対応はデータにしかないので、**core に "water" と書かずに済む。**
 */
export function walkableTerrains(
  all: readonly FieldAbility[],
  abilities: readonly FieldAbilityId[],
): TerrainId[] {
  const out: TerrainId[] = [];
  for (const ability of all) {
    if (!abilities.includes(ability.id)) continue;
    const effect = effectOf(ability);
    if (effect.kind === "walk" && !out.includes(effect.terrain)) out.push(effect.terrain);
  }
  return out;
}
