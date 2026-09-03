import type { BattlePokemon, Move } from './entities'
import { battleStat } from './entities'
import { typeEffectiveness } from './types'
import { absorbs } from './abilities'
import { damageMultiplier } from './items'
import { BURN_PHYSICAL_MULTIPLIER } from './status'

/** Chance that a hit lands a critical, matching the games' base rate of 1/24. */
export const CRITICAL_CHANCE = 1 / 24
export const CRITICAL_MULTIPLIER = 1.5
/** Same-type attack bonus. */
export const STAB_MULTIPLIER = 1.5

export interface DamageResult {
  readonly damage: number
  readonly effectiveness: number
  readonly critical: boolean
  /**
   * Set when the defender's ability answered the move rather than taking it:
   * 'immune' shrugged it off, 'heal' turned it into health.
   */
  readonly absorbed: 'immune' | 'heal' | null
}

/**
 * Source of randomness, injected so battles can be replayed exactly in tests.
 * Must return a number in [0, 1).
 */
export type Random = () => number

/**
 * Damage for a single hit, following the main-series formula.
 *
 * Draws from `random` twice and always in the same order -- first the critical
 * roll, then the spread roll -- so a seeded generator produces a stable result.
 */
export function calculateDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  random: Random = Math.random,
): DamageResult {
  const absorbed = absorbs(defender.species.ability, move.type)
  const effectiveness =
    absorbed === null ? typeEffectiveness(move.type, defender.species.types) : 0

  const critical = random() < CRITICAL_CHANCE
  const spread = 0.85 + random() * 0.15

  if (effectiveness === 0) {
    return { damage: 0, effectiveness, critical: false, absorbed }
  }

  const physical = move.category === 'physical'
  // Stats as the battle sees them, so a stat stage is felt here.
  const [attack, defense] = physical
    ? [battleStat(attacker, 'attack'), battleStat(defender, 'defense')]
    : [battleStat(attacker, 'specialAttack'), battleStat(defender, 'specialDefense')]

  const burned =
    physical && attacker.status?.kind === 'burn' ? BURN_PHYSICAL_MULTIPLIER : 1

  const base =
    Math.floor(
      Math.floor(
        (Math.floor((2 * attacker.level) / 5 + 2) * move.power * attack) / defense,
      ) / 50,
    ) + 2

  const stab = attacker.species.types.includes(move.type) ? STAB_MULTIPLIER : 1
  const crit = critical ? CRITICAL_MULTIPLIER : 1

  // A hit that connects always takes off at least 1 HP.
  const held = damageMultiplier(attacker.item, effectiveness)

  const damage = Math.max(
    1,
    Math.floor(base * stab * effectiveness * crit * burned * held * spread),
  )
  return { damage, effectiveness, critical, absorbed: null }
}
