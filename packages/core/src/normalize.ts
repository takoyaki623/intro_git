/**
 * バトル参加者の正規化。
 *
 * バトルに出るポケモンの出どころは3つあり、形がすべて違う。
 * core はそれらを直接扱わず、入口でこの1つの型に揃える。
 *   - PokemonInstance … 実在する個体（v0.8）
 *   - PartySpec       … 「Lv50のリザードン」という設計図（ネームド）
 *   - BattleSet       … 施設の相手プール（v0.5）
 * 設計: docs/design/battle-system.md §1
 */

import type { GameData } from "./gamedata.js";
import { calcAllStats, MAX_IVS } from "./stats.js";
import type {
  AbilityId,
  BattlePokemon,
  ItemId,
  MoveId,
  NatureId,
  SpeciesId,
  StatSpread,
  StatusId,
} from "./types.js";
import { EMPTY_STAGES, freshVolatile, STATS } from "./types.js";

/** 「Lv50のリザードン」という設計図。BattleSet もこの形に落としてから渡す。 */
export type PartySpec = {
  species: SpeciesId;
  level: number;
  moves: MoveId[];
  nickname?: string;
  /** 一部だけ指定できる。欠けた能力は既定値で埋める（fillSpread）。 */
  ivs?: Partial<StatSpread>;
  evs?: Partial<StatSpread>;
  nature?: NatureId;
  status?: StatusId;
  /** 省略時は種族の既定特性（abilities[0]）。 */
  ability?: AbilityId;
  item?: ItemId;

  // ── 実個体から持ち込む生きた状態（v0.8）──
  //
  // 出どころを union にせず、**設計図の側に「持ち込む値」を足す**形にした。
  // 「入口で1つの形に揃える」というこのファイルの役目を、型の数でも守るため。
  // どれも省略可で、省略すれば従来どおり満タンで生まれる。

  /** 誰の個体か。バトル後に書き戻す相手を特定する。 */
  uid?: string;
  /** 現在HPの割合（0〜1）。**レベル同期で最大HPが変わるので割合で持つ。** */
  hpRatio?: number;
  /** 技ごとの残りPP。`moves` と同じ並び。 */
  ppLeft?: number[];
  /** なつき度（v1.2-c）。おんがえし・やつあたり の威力になる。 */
  friendship?: number;
  /** 性別（v1.2-c）。メロメロ が見る。省略すると性別なし扱い。 */
  gender?: "male" | "female" | null;
};

/**
 * 設計図から作られた相手のなつき度（v1.2-c）。
 *
 * **捕まえた直後と同じ値**にしてある ―― 相手のなつき度は原作でも
 * 見えないので、おんがえし の威力が読めないのはむしろ正しい。
 */
export const DEFAULT_FRIENDSHIP = 70;

export type BattlePokemonSource = PartySpec;

/**
 * 一部しか書かれていない能力の並びを、6つ揃った形に埋める。
 *
 * データ側は「努力値は atk と spe だけ」のように部分的に書く。
 * 埋めずに計算式へ渡すと `undefined` が混ざり、**実数値が NaN になる**。
 * NaN は HP 比較を静かに素通りするため、
 * 「相手が最初から全員ひんし扱い」という形でしか表に出てこない。
 *
 * 入口で1つの形に揃えるのがこのファイルの役目なので、ここで埋める。
 */
function fillSpread(partial: Partial<StatSpread> | undefined, fallback: number): StatSpread {
  const out = {} as StatSpread;
  for (const stat of STATS) out[stat] = partial?.[stat] ?? fallback;
  return out;
}

export function toBattlePokemon(
  data: GameData,
  source: BattlePokemonSource,
  /** 施設・相棒のレベル同期で使う（v0.5 / v0.6）。 */
  levelOverride?: number,
): BattlePokemon {
  const species = data.species(source.species);
  const level = levelOverride ?? source.level;

  const ivs = fillSpread(source.ivs, MAX_IVS.hp);
  const evs = fillSpread(source.evs, 0);
  const stats = calcAllStats(data, species, level, ivs, evs, source.nature);

  // 計算結果が数値であることを保証する。ここを抜けた NaN は
  // 「最初から全員ひんし」という分かりにくい形でしか現れない
  for (const stat of STATS) {
    if (!Number.isFinite(stats[stat])) {
      throw new Error(`${source.species}: 実数値 ${stat} が数値にならない`);
    }
  }

  // 技0を許す（v0.8）。
  // 原作の learnset を入れたら、レベル技を1つも持たない種が実在した
  // ―― ケーシィは テレポート だけ、メタモンは へんしん だけを覚える。
  // ここで弾くと「原作どおりのデータ」が入れられなくなるので、
  // わるあがき しかできない個体として成立させる（battle.ts が既にその道を持っている）。
  if (source.moves.length > 4) throw new Error(`${source.species} has more than 4 moves`);

  const moves = source.moves.map((id, i) => {
    const move = data.move(id);
    const left = source.ppLeft?.[i];
    return { id: move.id, pp: left === undefined ? move.pp : Math.max(0, Math.min(move.pp, left)), maxPp: move.pp };
  });

  // 特性の既定値は種族の1つ目。BattleSet は明示するが、
  // 野生や暫定パーティは指定なしで作られるため、ここで埋める。
  const ability = source.ability ?? species.abilities[0] ?? null;
  if (ability !== null) data.ability(ability); // 存在確認（検証漏れをここで捕まえる）
  if (source.item !== undefined) data.item(source.item);

  return {
    species: species.id,
    name: source.nickname ?? species.name,
    level,
    types: species.types,
    stats,
    maxHp: stats.hp,
    // 実個体から持ち込むときだけ減った状態で始まる。
    // ひんし（0）は 0 のまま ―― 1 に丸めると「倒れている」が消える
    currentHp:
      source.hpRatio === undefined
        ? stats.hp
        : source.hpRatio <= 0
          ? 0
          : Math.max(1, Math.min(stats.hp, Math.round(stats.hp * source.hpRatio))),
    moves,
    ability,
    innateAbility: ability,
    item: source.item ?? null,
    itemConsumed: false,
    status: source.status ?? null,
    statusCounter: 0,
    statStages: { ...EMPTY_STAGES },
    friendship: source.friendship ?? DEFAULT_FRIENDSHIP,
    gender: source.gender ?? null,
    volatile: freshVolatile(),
  };
}
