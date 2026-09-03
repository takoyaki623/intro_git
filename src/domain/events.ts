import type { Side } from './entities'

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
