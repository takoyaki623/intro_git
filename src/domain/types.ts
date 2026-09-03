export const POKEMON_TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const

export type PokemonType = (typeof POKEMON_TYPES)[number]

type Matchup = {
  /** Deals 2x to these types. */
  double?: readonly PokemonType[]
  /** Deals 0.5x to these types. */
  half?: readonly PokemonType[]
  /** Deals no damage to these types. */
  zero?: readonly PokemonType[]
}

/**
 * Gen 6+ type chart, keyed by attacking type. Only non-neutral matchups are
 * listed -- anything absent is 1x, which keeps the table small enough to check
 * by eye against the published chart.
 */
export const TYPE_CHART: Record<PokemonType, Matchup> = {
  normal: { half: ['rock', 'steel'], zero: ['ghost'] },
  fire: {
    double: ['grass', 'ice', 'bug', 'steel'],
    half: ['fire', 'water', 'rock', 'dragon'],
  },
  water: { double: ['fire', 'ground', 'rock'], half: ['water', 'grass', 'dragon'] },
  electric: {
    double: ['water', 'flying'],
    half: ['electric', 'grass', 'dragon'],
    zero: ['ground'],
  },
  grass: {
    double: ['water', 'ground', 'rock'],
    half: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'],
  },
  ice: {
    double: ['grass', 'ground', 'flying', 'dragon'],
    half: ['fire', 'water', 'ice', 'steel'],
  },
  fighting: {
    double: ['normal', 'ice', 'rock', 'dark', 'steel'],
    half: ['poison', 'flying', 'psychic', 'bug', 'fairy'],
    zero: ['ghost'],
  },
  poison: {
    double: ['grass', 'fairy'],
    half: ['poison', 'ground', 'rock', 'ghost'],
    zero: ['steel'],
  },
  ground: {
    double: ['fire', 'electric', 'poison', 'rock', 'steel'],
    half: ['grass', 'bug'],
    zero: ['flying'],
  },
  flying: {
    double: ['grass', 'fighting', 'bug'],
    half: ['electric', 'rock', 'steel'],
  },
  psychic: { double: ['fighting', 'poison'], half: ['psychic', 'steel'], zero: ['dark'] },
  bug: {
    double: ['grass', 'psychic', 'dark'],
    half: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'],
  },
  rock: {
    double: ['fire', 'ice', 'flying', 'bug'],
    half: ['fighting', 'ground', 'steel'],
  },
  ghost: { double: ['psychic', 'ghost'], half: ['dark'], zero: ['normal'] },
  dragon: { double: ['dragon'], half: ['steel'], zero: ['fairy'] },
  dark: { double: ['psychic', 'ghost'], half: ['fighting', 'dark', 'fairy'] },
  steel: {
    double: ['ice', 'rock', 'fairy'],
    half: ['fire', 'water', 'electric', 'steel'],
  },
  fairy: { double: ['fighting', 'dragon', 'dark'], half: ['fire', 'poison', 'steel'] },
}

/**
 * Combined damage multiplier of one attacking type against a defender, whose
 * types multiply together: 4x, 2x, 1x, 0.5x, 0.25x or 0x.
 */
export function typeEffectiveness(
  attacking: PokemonType,
  defending: readonly PokemonType[],
): number {
  const matchup = TYPE_CHART[attacking]
  return defending.reduce((total, type) => {
    if (matchup.zero?.includes(type)) return 0
    if (matchup.double?.includes(type)) return total * 2
    if (matchup.half?.includes(type)) return total * 0.5
    return total
  }, 1)
}

/** Wording shown to the player, matching the games' battle messages. */
export function effectivenessMessage(multiplier: number): string | null {
  if (multiplier === 0) return "It doesn't affect the target..."
  if (multiplier > 1) return "It's super effective!"
  if (multiplier < 1) return "It's not very effective..."
  return null
}
