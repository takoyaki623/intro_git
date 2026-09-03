import type { PokemonType } from './types'

export type StatusKind = 'poison' | 'burn' | 'paralysis' | 'sleep' | 'freeze'

/**
 * A status condition. Sleep is the only one that carries state, so it is the
 * only one with a field -- modelling it as a union keeps a burned Pokemon from
 * having a meaningless turn counter.
 */
export type Status =
  | { readonly kind: 'poison' }
  | { readonly kind: 'burn' }
  | { readonly kind: 'paralysis' }
  | { readonly kind: 'sleep'; readonly turns: number }
  | { readonly kind: 'freeze' }

/** Fraction of maximum HP lost at the end of each turn. */
export const POISON_FRACTION = 1 / 8
export const BURN_FRACTION = 1 / 16
/** A burn also softens physical blows. */
export const BURN_PHYSICAL_MULTIPLIER = 0.5
export const PARALYSIS_SPEED_MULTIPLIER = 0.5
export const PARALYSIS_IMMOBILISE_CHANCE = 0.25
export const FREEZE_THAW_CHANCE = 0.2
export const SLEEP_MIN_TURNS = 1
export const SLEEP_MAX_TURNS = 3

/** Types that shrug off a condition outright. */
const IMMUNE_TYPES: Record<StatusKind, readonly PokemonType[]> = {
  poison: ['poison', 'steel'],
  burn: ['fire'],
  paralysis: ['electric'],
  freeze: ['ice'],
  sleep: [],
}

export function isImmuneTo(kind: StatusKind, types: readonly PokemonType[]): boolean {
  return types.some((type) => IMMUNE_TYPES[kind].includes(type))
}

export function createStatus(kind: StatusKind, random: () => number): Status {
  if (kind !== 'sleep') return { kind }
  const span = SLEEP_MAX_TURNS - SLEEP_MIN_TURNS + 1
  return { kind: 'sleep', turns: SLEEP_MIN_TURNS + Math.floor(random() * span) }
}

export interface ActionGate {
  /** Whether the Pokemon gets to use its move this turn. */
  readonly canAct: boolean
  /** The condition after this turn's check -- sleep counts down, ice may thaw. */
  readonly status: Status | null
  /** A condition that wore off just now, to announce. */
  readonly ended: StatusKind | null
  /** The condition that stopped the Pokemon, if one did. */
  readonly blockedBy: StatusKind | null
}

const free = (status: Status | null): ActionGate => ({
  canAct: true,
  status,
  ended: null,
  blockedBy: null,
})

/**
 * Decide whether a Pokemon can move, and advance its condition.
 *
 * Draws from `random` only for the conditions that roll: paralysis and freeze.
 * Sleep counts down instead, and a Pokemon that wakes acts the same turn, as
 * it does in the games.
 */
export function gateAction(status: Status | null, random: () => number): ActionGate {
  if (!status) return free(null)

  switch (status.kind) {
    case 'poison':
    case 'burn':
      return free(status)

    case 'paralysis':
      return random() < PARALYSIS_IMMOBILISE_CHANCE
        ? { canAct: false, status, ended: null, blockedBy: 'paralysis' }
        : free(status)

    case 'freeze':
      return random() < FREEZE_THAW_CHANCE
        ? { canAct: true, status: null, ended: 'freeze', blockedBy: null }
        : { canAct: false, status, ended: null, blockedBy: 'freeze' }

    case 'sleep': {
      const turns = status.turns - 1
      return turns <= 0
        ? { canAct: true, status: null, ended: 'sleep', blockedBy: null }
        : {
            canAct: false,
            status: { kind: 'sleep', turns },
            ended: null,
            blockedBy: 'sleep',
          }
    }
  }
}

/** HP lost at the end of a turn to poison or burn. Always at least 1. */
export function endOfTurnDamage(status: Status | null, maxHp: number): number {
  if (status?.kind === 'poison') return Math.max(1, Math.floor(maxHp * POISON_FRACTION))
  if (status?.kind === 'burn') return Math.max(1, Math.floor(maxHp * BURN_FRACTION))
  return 0
}
