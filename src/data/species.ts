import type { Species } from '../domain/entities'
import { MOVES } from './moves'

/** Base stats follow the main series. */
export const SPECIES = {
  pikachu: {
    id: 'pikachu',
    name: 'ピカチュウ',
    types: ['electric'],
    baseStats: {
      hp: 35,
      attack: 55,
      defense: 40,
      specialAttack: 50,
      specialDefense: 50,
      speed: 90,
    },
    moves: [MOVES.thunderbolt, MOVES.quickAttack, MOVES.thunderWave, MOVES.dig],
  },
  charmander: {
    id: 'charmander',
    name: 'ヒトカゲ',
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
    name: 'ゼニガメ',
    types: ['water'],
    baseStats: {
      hp: 44,
      attack: 48,
      defense: 65,
      specialAttack: 50,
      specialDefense: 64,
      speed: 43,
    },
    moves: [MOVES.surf, MOVES.iceBeam, MOVES.tackle, MOVES.bite],
  },
  bulbasaur: {
    id: 'bulbasaur',
    name: 'フシギダネ',
    types: ['grass', 'poison'],
    baseStats: {
      hp: 45,
      attack: 49,
      defense: 49,
      specialAttack: 65,
      specialDefense: 65,
      speed: 45,
    },
    moves: [MOVES.razorLeaf, MOVES.sleepPowder, MOVES.sludgeBomb, MOVES.vineWhip],
  },
  eevee: {
    id: 'eevee',
    name: 'イーブイ',
    types: ['normal'],
    baseStats: {
      hp: 55,
      attack: 55,
      defense: 50,
      specialAttack: 45,
      specialDefense: 65,
      speed: 55,
    },
    moves: [MOVES.bite, MOVES.quickAttack, MOVES.tackle, MOVES.dig],
  },
  zubat: {
    id: 'zubat',
    name: 'ズバット',
    types: ['poison', 'flying'],
    baseStats: {
      hp: 40,
      attack: 45,
      defense: 35,
      specialAttack: 30,
      specialDefense: 40,
      speed: 55,
    },
    moves: [MOVES.wingAttack, MOVES.sludgeBomb, MOVES.bite, MOVES.tackle],
  },
  geodude: {
    id: 'geodude',
    name: 'イシツブテ',
    types: ['rock', 'ground'],
    baseStats: {
      hp: 40,
      attack: 80,
      defense: 100,
      specialAttack: 30,
      specialDefense: 30,
      speed: 20,
    },
    moves: [MOVES.rockThrow, MOVES.dig, MOVES.tackle, MOVES.scratch],
  },
} as const satisfies Record<string, Species>

export const SPECIES_LIST: readonly Species[] = Object.values(SPECIES)
