import type { PokemonType } from './types'
import type { Status, StatusKind } from './status'
import type { StatKey, StatStages } from './stages'
import { NO_STAGES, stagedStat } from './stages'
import { PARALYSIS_SPEED_MULTIPLIER } from './status'

/** Which corner of the battle a Pokemon belongs to. */
export type Side = 'player' | 'opponent'

export type MoveCategory = 'physical' | 'special' | 'status'

export interface Move {
  readonly id: string
  readonly name: string
  readonly type: PokemonType
  readonly category: MoveCategory
  /** Zero for a status move, which only applies its effect. */
  readonly power: number
  /** Hit chance from 0 to 1. */
  readonly accuracy: number
  /** A condition the move may leave behind. */
  readonly effect?: { readonly status: StatusKind; readonly chance: number }
  /** A stat the move pushes up or down, on the user or the target. */
  readonly stageChange?: {
    readonly target: 'self' | 'foe'
    readonly stat: StatKey
    readonly delta: number
  }
}

export interface Stats {
  readonly hp: number
  readonly attack: number
  readonly defense: number
  readonly specialAttack: number
  readonly specialDefense: number
  readonly speed: number
}

export interface Species {
  readonly id: string
  readonly name: string
  readonly types: readonly PokemonType[]
  readonly baseStats: Stats
  readonly moves: readonly Move[]
}

export interface BattlePokemon {
  readonly species: Species
  readonly level: number
  /** Stats at this level, derived from the species' base stats. */
  readonly stats: Stats
  readonly currentHp: number
  readonly status: Status | null
  /** Cleared whenever the Pokemon leaves the field. */
  readonly stages: StatStages
}

/**
 * Stats at a given level. IVs, EVs and natures are all left at zero for now --
 * adding them later only changes this function.
 */
export function statsAtLevel(base: Stats, level: number): Stats {
  const scale = (value: number) => Math.floor((2 * value * level) / 100)
  return {
    hp: scale(base.hp) + level + 10,
    attack: scale(base.attack) + 5,
    defense: scale(base.defense) + 5,
    specialAttack: scale(base.specialAttack) + 5,
    specialDefense: scale(base.specialDefense) + 5,
    speed: scale(base.speed) + 5,
  }
}

export function createBattlePokemon(species: Species, level: number): BattlePokemon {
  const stats = statsAtLevel(species.baseStats, level)
  return { species, level, stats, currentHp: stats.hp, status: null, stages: NO_STAGES }
}

/** A stat as the battle sees it, with its stage applied. */
export function battleStat(pokemon: BattlePokemon, stat: StatKey): number {
  return stagedStat(pokemon.stats[stat], pokemon.stages[stat])
}

/** Speed after its stage and paralysis, which is what decides who moves first. */
export function effectiveSpeed(pokemon: BattlePokemon): number {
  const speed = battleStat(pokemon, 'speed')
  return pokemon.status?.kind === 'paralysis'
    ? Math.floor(speed * PARALYSIS_SPEED_MULTIPLIER)
    : speed
}

export function isFainted(pokemon: BattlePokemon): boolean {
  return pokemon.currentHp <= 0
}

/** One side's party, and which member is currently out. */
export interface TeamState {
  readonly members: readonly BattlePokemon[]
  readonly activeIndex: number
}

export function createTeam(members: readonly BattlePokemon[]): TeamState {
  if (members.length === 0) throw new Error('a team needs at least one Pokemon')
  return { members, activeIndex: 0 }
}

export function activePokemon(team: TeamState): BattlePokemon {
  const active = team.members[team.activeIndex]
  if (!active) throw new Error(`no Pokemon at index ${team.activeIndex}`)
  return active
}

/** Members that could be sent out: still standing, and not already out. */
export function switchableIndexes(team: TeamState): number[] {
  return team.members.flatMap((member, index) =>
    index !== team.activeIndex && !isFainted(member) ? [index] : [],
  )
}

export function isTeamDefeated(team: TeamState): boolean {
  return team.members.every(isFainted)
}

export function withActive(team: TeamState, index: number): TeamState {
  if (!team.members[index]) throw new Error(`no Pokemon at index ${index}`)
  return { ...team, activeIndex: index }
}

export function withMember(
  team: TeamState,
  index: number,
  pokemon: BattlePokemon,
): TeamState {
  return {
    ...team,
    members: team.members.map((member, i) => (i === index ? pokemon : member)),
  }
}
