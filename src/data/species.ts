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
    moves: [MOVES.thunderbolt, MOVES.voltSwitch, MOVES.dig, MOVES.thunderWave],
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
    moves: [MOVES.fireBlast, MOVES.dragonBreath, MOVES.swordsDance, MOVES.scratch],
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
    moves: [MOVES.surf, MOVES.iceBeam, MOVES.aquaJet, MOVES.bite],
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
    moves: [MOVES.energyBall, MOVES.razorLeaf, MOVES.sleepPowder, MOVES.sludgeBomb],
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
    moves: [MOVES.doubleEdge, MOVES.quickAttack, MOVES.bite, MOVES.dig],
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
    moves: [MOVES.bravebird, MOVES.uTurn, MOVES.sludgeBomb, MOVES.bite],
  },
  geodude: {
    id: 'geodude',
    name: 'イシツブテ',
    types: ['rock', 'ground'],
    ability: 'sturdy',
    baseStats: {
      hp: 40,
      attack: 80,
      defense: 100,
      specialAttack: 30,
      specialDefense: 30,
      speed: 20,
    },
    moves: [MOVES.stoneEdge, MOVES.earthquake, MOVES.rockThrow, MOVES.tackle],
  },
  drowzee: {
    id: 'drowzee',
    name: 'スリープ',
    types: ['psychic'],
    baseStats: {
      hp: 60,
      attack: 48,
      defense: 45,
      specialAttack: 43,
      specialDefense: 90,
      speed: 42,
    },
    moves: [MOVES.psychic, MOVES.hypnosis, MOVES.confusion, MOVES.toxic],
  },
  machop: {
    id: 'machop',
    name: 'ワンリキー',
    types: ['fighting'],
    baseStats: {
      hp: 70,
      attack: 80,
      defense: 50,
      specialAttack: 35,
      specialDefense: 35,
      speed: 35,
    },
    moves: [MOVES.karateChop, MOVES.rockThrow, MOVES.dig, MOVES.leer],
  },
  gastly: {
    id: 'gastly',
    name: 'ゴース',
    types: ['ghost', 'poison'],
    ability: 'levitate',
    baseStats: {
      hp: 30,
      attack: 35,
      defense: 30,
      specialAttack: 100,
      specialDefense: 35,
      speed: 80,
    },
    moves: [MOVES.shadowBall, MOVES.sludgeBomb, MOVES.hypnosis, MOVES.lick],
  },
  magnemite: {
    id: 'magnemite',
    name: 'コイル',
    types: ['electric', 'steel'],
    ability: 'sturdy',
    baseStats: {
      hp: 25,
      attack: 35,
      defense: 70,
      specialAttack: 95,
      specialDefense: 55,
      speed: 45,
    },
    moves: [MOVES.flashCannon, MOVES.thunder, MOVES.wildCharge, MOVES.ironTail],
  },
  dratini: {
    id: 'dratini',
    name: 'ミニリュウ',
    types: ['dragon'],
    baseStats: {
      hp: 41,
      attack: 64,
      defense: 45,
      specialAttack: 50,
      specialDefense: 50,
      speed: 50,
    },
    moves: [MOVES.dragonBreath, MOVES.agility, MOVES.bite, MOVES.thunderWave],
  },
  scyther: {
    id: 'scyther',
    name: 'ストライク',
    types: ['bug', 'flying'],
    ability: 'intimidate',
    baseStats: {
      hp: 70,
      attack: 110,
      defense: 80,
      specialAttack: 55,
      specialDefense: 80,
      speed: 105,
    },
    moves: [MOVES.megahorn, MOVES.xScissor, MOVES.uTurn, MOVES.swordsDance],
  },
  dewgong: {
    id: 'dewgong',
    name: 'ジュゴン',
    types: ['water', 'ice'],
    ability: 'waterAbsorb',
    baseStats: {
      hp: 90,
      attack: 70,
      defense: 80,
      specialAttack: 70,
      specialDefense: 95,
      speed: 70,
    },
    moves: [MOVES.blizzard, MOVES.surf, MOVES.aquaJet, MOVES.growl],
  },
  clefairy: {
    id: 'clefairy',
    name: 'ピッピ',
    types: ['fairy'],
    baseStats: {
      hp: 70,
      attack: 45,
      defense: 48,
      specialAttack: 60,
      specialDefense: 65,
      speed: 35,
    },
    moves: [MOVES.dazzlingGleam, MOVES.playRough, MOVES.calmMind, MOVES.growl],
  },
  houndour: {
    id: 'houndour',
    name: 'デルビル',
    types: ['dark', 'fire'],
    ability: 'intimidate',
    baseStats: {
      hp: 45,
      attack: 60,
      defense: 30,
      specialAttack: 80,
      specialDefense: 50,
      speed: 65,
    },
    moves: [MOVES.darkPulse, MOVES.flareBlitz, MOVES.flamethrower, MOVES.bite],
  },
  sandshrew: {
    id: 'sandshrew',
    name: 'サンド',
    types: ['ground'],
    baseStats: {
      hp: 50,
      attack: 75,
      defense: 85,
      specialAttack: 20,
      specialDefense: 30,
      speed: 40,
    },
    moves: [MOVES.earthquake, MOVES.swordsDance, MOVES.scratch, MOVES.rockThrow],
  },
  tentacool: {
    id: 'tentacool',
    name: 'メノクラゲ',
    types: ['water', 'poison'],
    ability: 'waterAbsorb',
    baseStats: {
      hp: 40,
      attack: 40,
      defense: 35,
      specialAttack: 50,
      specialDefense: 100,
      speed: 70,
    },
    moves: [MOVES.surf, MOVES.sludgeBomb, MOVES.toxic, MOVES.bite],
  },

  // --- Filling in the chart -----------------------------------------------
  // The first eighteen left eleven types with a single species between them,
  // which meant a draft could offer no answer at all to a whole column of the
  // chart. These are chosen for the gaps, not for their stats: several are
  // frail on purpose, because six candidates want chaff among them for the
  // choice to be a choice.

  vulpix: {
    id: 'vulpix',
    name: 'ロコン',
    types: ['fire'],
    baseStats: {
      hp: 38,
      attack: 41,
      defense: 40,
      specialAttack: 50,
      specialDefense: 65,
      speed: 65,
    },
    moves: [MOVES.flamethrower, MOVES.dig, MOVES.bite, MOVES.growl],
  },
  tangela: {
    id: 'tangela',
    name: 'モンジャラ',
    types: ['grass'],
    baseStats: {
      hp: 65,
      attack: 55,
      defense: 115,
      specialAttack: 100,
      specialDefense: 40,
      speed: 60,
    },
    moves: [MOVES.energyBall, MOVES.razorLeaf, MOVES.sleepPowder, MOVES.toxic],
  },
  exeggcute: {
    id: 'exeggcute',
    name: 'タマタマ',
    types: ['grass', 'psychic'],
    baseStats: {
      hp: 60,
      attack: 40,
      defense: 80,
      specialAttack: 60,
      specialDefense: 45,
      speed: 40,
    },
    moves: [MOVES.energyBall, MOVES.psychic, MOVES.hypnosis, MOVES.confusion],
  },
  abra: {
    id: 'abra',
    name: 'ケーシィ',
    types: ['psychic'],
    baseStats: {
      hp: 25,
      attack: 20,
      defense: 15,
      specialAttack: 105,
      specialDefense: 55,
      speed: 90,
    },
    moves: [MOVES.psychic, MOVES.confusion, MOVES.calmMind, MOVES.agility],
  },
  onix: {
    id: 'onix',
    name: 'イワーク',
    types: ['rock', 'ground'],
    ability: 'sturdy',
    baseStats: {
      hp: 35,
      attack: 45,
      defense: 160,
      specialAttack: 30,
      specialDefense: 45,
      speed: 70,
    },
    moves: [MOVES.rockThrow, MOVES.earthquake, MOVES.ironTail, MOVES.leer],
  },
  sneasel: {
    id: 'sneasel',
    name: 'ニューラ',
    types: ['dark', 'ice'],
    baseStats: {
      hp: 55,
      attack: 95,
      defense: 55,
      specialAttack: 35,
      specialDefense: 75,
      speed: 115,
    },
    moves: [MOVES.darkPulse, MOVES.iceBeam, MOVES.quickAttack, MOVES.swordsDance],
  },
  aron: {
    id: 'aron',
    name: 'ココドラ',
    types: ['steel', 'rock'],
    ability: 'sturdy',
    baseStats: {
      hp: 50,
      attack: 70,
      defense: 100,
      specialAttack: 40,
      specialDefense: 40,
      speed: 30,
    },
    moves: [MOVES.flashCannon, MOVES.stoneEdge, MOVES.tackle, MOVES.leer],
  },
  duskull: {
    id: 'duskull',
    name: 'ヨマワル',
    types: ['ghost'],
    ability: 'levitate',
    baseStats: {
      hp: 20,
      attack: 40,
      defense: 90,
      specialAttack: 30,
      specialDefense: 90,
      speed: 25,
    },
    moves: [MOVES.shadowBall, MOVES.lick, MOVES.toxic, MOVES.confusion],
  },
  axew: {
    id: 'axew',
    name: 'キバゴ',
    types: ['dragon'],
    baseStats: {
      hp: 46,
      attack: 87,
      defense: 60,
      specialAttack: 30,
      specialDefense: 40,
      speed: 57,
    },
    moves: [MOVES.dragonBreath, MOVES.xScissor, MOVES.swordsDance, MOVES.scratch],
  },
  hitmonchan: {
    id: 'hitmonchan',
    name: 'エビワラー',
    types: ['fighting'],
    baseStats: {
      hp: 50,
      attack: 105,
      defense: 79,
      specialAttack: 35,
      specialDefense: 110,
      speed: 76,
    },
    moves: [MOVES.karateChop, MOVES.rockThrow, MOVES.agility, MOVES.quickAttack],
  },
  pineco: {
    id: 'pineco',
    name: 'クヌギダマ',
    types: ['bug'],
    ability: 'sturdy',
    baseStats: {
      hp: 50,
      attack: 65,
      defense: 90,
      specialAttack: 35,
      specialDefense: 35,
      speed: 15,
    },
    moves: [MOVES.xScissor, MOVES.tackle, MOVES.toxic, MOVES.leer],
  },
  doduo: {
    id: 'doduo',
    name: 'ドードー',
    types: ['normal', 'flying'],
    baseStats: {
      hp: 35,
      attack: 85,
      defense: 45,
      specialAttack: 35,
      specialDefense: 35,
      speed: 75,
    },
    moves: [MOVES.wingAttack, MOVES.quickAttack, MOVES.doubleEdge, MOVES.growl],
  },
  jigglypuff: {
    id: 'jigglypuff',
    name: 'プリン',
    types: ['normal', 'fairy'],
    baseStats: {
      hp: 115,
      attack: 45,
      defense: 20,
      specialAttack: 45,
      specialDefense: 25,
      speed: 20,
    },
    moves: [MOVES.dazzlingGleam, MOVES.playRough, MOVES.doubleEdge, MOVES.growl],
  },
} as const satisfies Record<string, Species>

/** What a run draws from: the player's draft, the opposing parties, recruits. */
export const SPECIES_LIST: readonly Species[] = Object.values(SPECIES)

/**
 * The last battle, and nowhere else.
 *
 * Kept out of SPECIES so it cannot be drafted, met on the way, or recruited --
 * a boss the player might already be holding is not a boss. Its type pair is
 * the point: dragon/flying is four times weak to ice and twice to rock, fairy,
 * electric and dragon, so the coverage line on the draft cards is what decides
 * whether the party has an answer.
 */
export const BOSS_SPECIES = {
  dragonite: {
    id: 'dragonite',
    name: 'カイリュー',
    types: ['dragon', 'flying'],
    baseStats: {
      hp: 91,
      attack: 134,
      defense: 95,
      specialAttack: 100,
      specialDefense: 100,
      speed: 80,
    },
    moves: [MOVES.dragonBreath, MOVES.wingAttack, MOVES.flamethrower, MOVES.dig],
  },
} as const satisfies Record<string, Species>

export const BOSS_LIST: readonly Species[] = Object.values(BOSS_SPECIES)

/**
 * Every species the game can put on the field, boss included.
 *
 * Loading a save has to find the boss too, and the fitness tests should hold it
 * to the same standard as everything else.
 */
export const ALL_SPECIES: readonly Species[] = [...SPECIES_LIST, ...BOSS_LIST]
