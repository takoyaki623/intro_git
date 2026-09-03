import type { PokemonType } from './types'

export type AbilityKind = 'intimidate' | 'levitate' | 'waterAbsorb' | 'sturdy'

/** Lowered on the foe when a Pokemon with いかく comes out. */
export const INTIMIDATE_DELTA = -1
/** Fraction of maximum HP ちょすい restores instead of taking damage. */
export const ABSORB_FRACTION = 1 / 4

/** How an ability answers an incoming move type. */
export type Absorption = 'immune' | 'heal' | null

export function absorbs(
  ability: AbilityKind | undefined,
  moveType: PokemonType,
): Absorption {
  if (ability === 'levitate' && moveType === 'ground') return 'immune'
  if (ability === 'waterAbsorb' && moveType === 'water') return 'heal'
  return null
}

/**
 * Whether the ability holds a Pokemon at 1 HP through a blow that would end it.
 * Only from full health, as in the games -- otherwise it is a second life
 * rather than a last stand.
 */
export function enduresWith(ability: AbilityKind | undefined): boolean {
  return ability === 'sturdy'
}

export function intimidates(ability: AbilityKind | undefined): boolean {
  return ability === 'intimidate'
}
