import type { Side } from './entities'
import type { StatusKind } from './status'
import type { StatKey } from './stages'
import type { AbilityKind } from './abilities'
import type { ItemKind } from './items'

/**
 * What happened during a turn, recorded as data rather than prose.
 *
 * The battle rules emit these; turning them into sentences is the UI's job
 * (`src/ui/messages.ts`). Keeping the two apart is what lets the same battle
 * be shown in a different language, and lets the UI reach for a number -- a
 * damage figure to animate, say -- without parsing a sentence to find it.
 */
export type BattleEvent =
  | { readonly kind: 'encounter'; readonly pokemon: string }
  | {
      readonly kind: 'useMove'
      readonly side: Side
      readonly pokemon: string
      readonly move: string
    }
  | { readonly kind: 'miss'; readonly side: Side; readonly pokemon: string }
  | {
      readonly kind: 'damage'
      readonly side: Side
      readonly pokemon: string
      readonly amount: number
    }
  | { readonly kind: 'critical' }
  | {
      readonly kind: 'effectiveness'
      readonly multiplier: number
      readonly target: string
    }
  | { readonly kind: 'faint'; readonly side: Side; readonly pokemon: string }
  | { readonly kind: 'withdraw'; readonly side: Side; readonly pokemon: string }
  | { readonly kind: 'sendOut'; readonly side: Side; readonly pokemon: string }
  | {
      readonly kind: 'statusInflicted'
      readonly side: Side
      readonly pokemon: string
      readonly status: StatusKind
    }
  | {
      readonly kind: 'statusDamage'
      readonly side: Side
      readonly pokemon: string
      readonly status: StatusKind
      readonly amount: number
    }
  | {
      readonly kind: 'immobilised'
      readonly side: Side
      readonly pokemon: string
      readonly status: StatusKind
    }
  | {
      readonly kind: 'statStage'
      readonly side: Side
      readonly pokemon: string
      readonly stat: StatKey
      /** What the move asked for. */
      readonly delta: number
      /** What it got -- zero when the stat was already at its limit. */
      readonly applied: number
    }
  | {
      readonly kind: 'ability'
      readonly side: Side
      readonly pokemon: string
      readonly ability: AbilityKind
      /** What it did: absorbed a move, held on, or announced itself. */
      readonly outcome: 'immune' | 'heal' | 'endured' | 'announced'
    }
  | {
      readonly kind: 'item'
      readonly side: Side
      readonly pokemon: string
      readonly item: ItemKind
      readonly outcome: 'healed' | 'endured'
      readonly amount?: number
    }
  | {
      readonly kind: 'statusEnded'
      readonly side: Side
      readonly pokemon: string
      readonly status: StatusKind
    }

export interface DamageMark {
  /** Position in the event list, so the UI can tell one hit from the next. */
  readonly index: number
  readonly amount: number
}

/**
 * The latest hit each side took, for the UI to flash over the target.
 *
 * Kept per side because a turn usually damages both, and a single "most recent
 * hit" would leave whichever was struck first with nothing to show.
 */
export function lastDamageBySide(
  events: readonly BattleEvent[],
): Record<Side, DamageMark | null> {
  const marks: Record<Side, DamageMark | null> = { player: null, opponent: null }
  events.forEach((event, index) => {
    if (event.kind === 'damage' && event.amount > 0) {
      marks[event.side] = { index, amount: event.amount }
    }
  })
  return marks
}
