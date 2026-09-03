import type { Species } from '../domain/entities'
import { MOVES } from './moves'

/** Base stats follow the main series. */
export const SPECIES = {
  pikachu: {
    id: 'pikachu',
    name: 'Pikachu',
    types: ['electric'],
    baseStats: {
      hp: 35,
      attack: 55,
      defense: 40,
      specialAttack: 50,
      specialDefense: 50,
      speed: 90,
    },
    moves: [MOVES.thunderbolt, MOVES.quickAttack, MOVES.ironTail, MOVES.dig],
  },
  charmander: {
    id: 'charmander',
    name: 'Charmander',
    types: ['fire'],
    baseStats: {
      hp: 39,
      attack: 52,
      defense: 43,
      specialAttack: 60,
      specialDefense: 50,
      speed: 65,
    },
    moves: [MOVES.flamethrower, MOVES.ember, MOVES.scratch, MOVES.dragonBreath],
  },
  squirtle: {
    id: 'squirtle',
    name: 'Squirtle',
    types: ['water'],
    baseStats: {
      hp: 44,
      attack: 48,
      defense: 65,
      specialAttack: 50,
      specialDefense: 64,
      speed: 43,
    },
    moves: [MOVES.surf, MOVES.waterGun, MOVES.tackle, MOVES.bite],
  },
  bulbasaur: {
    id: 'bulbasaur',
    name: 'Bulbasaur',
    types: ['grass', 'poison'],
    baseStats: {
      hp: 45,
      attack: 49,
      defense: 49,
      specialAttack: 65,
      specialDefense: 65,
      speed: 45,
    },
    moves: [MOVES.razorLeaf, MOVES.vineWhip, MOVES.sludgeBomb, MOVES.tackle],
  },
} as const satisfies Record<string, Species>

export const SPECIES_LIST: readonly Species[] = Object.values(SPECIES)
