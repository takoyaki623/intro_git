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
import { calcAllStats, MAX_IVS, ZERO_STATS } from "./stats.js";
import type { BattlePokemon, MoveId, NatureId, SpeciesId, StatSpread, StatusId } from "./types.js";
import { EMPTY_STAGES } from "./types.js";

/** v0.2 で使える唯一の出どころ。他は後続の版で union に加える。 */
export type PartySpec = {
  species: SpeciesId;
  level: number;
  moves: MoveId[];
  nickname?: string;
  ivs?: StatSpread;
  evs?: StatSpread;
  nature?: NatureId;
  status?: StatusId;
};

export type BattlePokemonSource = PartySpec;

export function toBattlePokemon(
  data: GameData,
  source: BattlePokemonSource,
  /** 施設・相棒のレベル同期で使う（v0.5 / v0.6）。 */
  levelOverride?: number,
): BattlePokemon {
  const species = data.species(source.species);
  const level = levelOverride ?? source.level;

  const ivs = source.ivs ?? MAX_IVS;
  const evs = source.evs ?? ZERO_STATS;
  const stats = calcAllStats(data, species, level, ivs, evs, source.nature);

  if (source.moves.length === 0) throw new Error(`${source.species} has no moves`);
  if (source.moves.length > 4) throw new Error(`${source.species} has more than 4 moves`);

  const moves = source.moves.map((id) => {
    const move = data.move(id);
    return { id: move.id, pp: move.pp, maxPp: move.pp };
  });

  return {
    species: species.id,
    name: source.nickname ?? species.name,
    level,
    types: species.types,
    stats,
    maxHp: stats.hp,
    currentHp: stats.hp,
    moves,
    status: source.status ?? null,
    statusCounter: 0,
    statStages: { ...EMPTY_STAGES },
    volatile: { confusionTurns: 0, flinched: false },
  };
}
