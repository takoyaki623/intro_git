import type { PokemonType } from './types'

/** Which corner of the battle a Pokemon belongs to. */
export type Side = 'player' | 'opponent'

export type MoveCategory = 'physical' | 'special'

export interface Move {
  readonly id: string
  readonly name: string
  readonly type: PokemonType
  readonly category: MoveCategory
  readonly power: number
  /** Hit chance from 0 to 1. */
  readonly accuracy: number
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
  return { species, level, stats, currentHp: stats.hp }
}

export function isFainted(pokemon: BattlePokemon): boolean {
  return pokemon.currentHp <= 0
}
