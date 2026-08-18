/**
 * ネームドキャラ（v0.6）。
 *
 * 「今までの全てのトレーナーが出る」を支えるデータ構造。
 * キャラを1人足すと、3ティアぶんのコンテンツが増える。
 *
 * 中心原則は「そのキャラの専門の中で最強を目指す。専門の外には出ない」。
 * 強さだけを追うと全ネームドが環境最強に収束し、
 * 30人ぶんのデータを作っても体験は1人ぶんにしかならない。
 *
 * 設計: docs/design/named-characters.md
 */

import type { GameData } from "../gamedata.js";
import type { PartySpec } from "../normalize.js";
import type { NamedId, RegionId, SpeciesId, TacticId, Type } from "../types.js";

export const TIERS = ["original", "serious", "ultimate"] as const;
export type TierId = (typeof TIERS)[number];

export const TIER_LABEL: Record<TierId, string> = {
  original: "原作",
  serious: "本気",
  ultimate: "極",
};

export type NamedRole = "gymLeader" | "elite4" | "champion" | "rival" | "villain" | "other";

export type NamedCharacter = {
  id: NamedId;
  name: string;
  role: NamedRole;
  region: RegionId;

  /**
   * らしさの定義。**パーティより先に書く。**
   * theme を一文で言語化できないキャラは、構築を組んでも「らしさ」が出ない。
   */
  concept: {
    /** 専門タイプ。チャンピオンは持たない（だから最も強くなる）。 */
    type?: Type;
    theme: string;
    /** キャラ間で重複させない管理用。v1.1 で AI が読んで遂行する。 */
    tactic?: TacticId;
  };
  /** 全ティアで不動のエース。これが「同じキャラだ」と認識できる最低条件。 */
  signature: SpeciesId;

  /** ティアごとのパーティ。極は v1.1（AI smart と同時）。 */
  tiers: Partial<Record<TierId, PartySpec[]>>;

  dialogue: Partial<Record<TierId, { before: string; win: string; lose: string }>>;
};

/**
 * ルールセットの体数に合わせてパーティを絞る。
 *
 * 原作のパーティは3〜6体だが、PWT は3対3。**単純に先頭から取ると
 * エースが落ちる**（原作の並びは弱い順で、ラスト がエース）。
 * signature を必ず残し、残りをレベルの高い順に埋める。
 */
export function selectParty(
  character: NamedCharacter,
  party: readonly PartySpec[],
  size: number,
): PartySpec[] {
  if (party.length <= size) return [...party];

  const ace = party.find((m) => m.species === character.signature);
  const rest = party
    .filter((m) => m !== ace)
    .slice()
    .sort((a, b) => b.level - a.level);

  const chosen = ace === undefined ? [] : [ace];
  for (const m of rest) {
    if (chosen.length >= size) break;
    chosen.push(m);
  }
  // 原作の並び（弱い順・エースが最後）を保つ
  return party.filter((m) => chosen.includes(m));
}

/** そのティアのパーティを、レベル同期まで済ませて返す。 */
export function partyFor(
  character: NamedCharacter,
  tier: TierId,
  size: number,
  level: number | null,
): PartySpec[] {
  const party = character.tiers[tier];
  if (party === undefined) {
    throw new Error(`${character.id}: ティア "${tier}" のパーティが無い`);
  }
  return selectParty(character, party, size).map((m) => ({
    ...m,
    level: level ?? m.level,
  }));
}

/**
 * そのキャラの AI 設定。
 *
 * 設計（ai.md §7）は四天王・チャンピオンに `smart` を、本気ティア全体にも `smart` を求める。
 * **`smart` は v1.1。** それまでは `basic` のまま誤り率だけを設計の値に寄せる。
 * ここを1箇所にまとめてあるので、v1.1 で policy を差し替えるのはこの表だけになる。
 */
export function aiFor(
  character: NamedCharacter,
  tier: TierId,
): { policy: "basic"; mistakeRate: number; knowledge: "fair" } {
  const strong = character.role === "elite4" || character.role === "champion";
  const mistakeRate =
    tier === "original" ? (strong ? 0.1 : 0.15)
    : tier === "serious" ? 0.05
    : 0;
  return { policy: "basic", mistakeRate, knowledge: "fair" };
}

/** そのキャラが持っているティア（データがある順）。 */
export const tiersOf = (character: NamedCharacter): TierId[] =>
  TIERS.filter((t) => character.tiers[t] !== undefined);

/**
 * 全ティアのパーティが投入可能か。データ投入時の取りこぼしを捕まえる。
 * signature が全ティアに含まれることも、ここで見る（設計の中心ルール）。
 */
export function assertNamedUsable(data: GameData, character: NamedCharacter): void {
  data.species(character.signature);
  for (const tier of tiersOf(character)) {
    const party = character.tiers[tier]!;
    if (party.length === 0) throw new Error(`${character.id}/${tier}: パーティが空`);
    if (!party.some((m) => m.species === character.signature)) {
      throw new Error(`${character.id}/${tier}: signature ${character.signature} が居ない`);
    }
    for (const m of party) {
      const species = data.species(m.species);
      for (const move of m.moves) data.move(move);
      if (m.ability !== undefined && !species.abilities.includes(m.ability)) {
        throw new Error(`${character.id}/${tier}: ${species.name} は特性 ${m.ability} を持たない`);
      }
      if (m.item !== undefined) data.item(m.item);
      if (m.nature !== undefined) data.nature(m.nature);
    }
  }
}
