import type { Species } from './entities'
import type { Random } from './damage'
import { sample } from './sample'
import { RUN_CONFIG } from './run'
import { SPECIES_LIST } from '../data/species'

export const DRAFT_CONFIG = {
  /** How many are laid out in front of the player. */
  candidates: 6,
  /** How many of them come along. Always the party the run expects. */
  picks: RUN_CONFIG.partySize,
} as const

/**
 * The choice made before the first battle: six offered, three taken.
 *
 * A dealt party swung a run hard -- measured, not guessed: sorted by the
 * party's base stat total, the quartiles came out 1.14 to 3.62 wins. What the
 * draft fixes is mostly the floor: a bot taking the three strongest of six
 * lifts the weakest quartile to 1.67 and halves the runs that win nothing,
 * 18% -> 8%, while the top-to-bottom spread only narrows 3.2x -> 2.6x. So a
 * strong party still carries a run; the difference is that the player now
 * chooses one rather than being handed one.
 */
export interface DraftState {
  /** The six on the table, in the order they were dealt. */
  readonly candidates: readonly Species[]
  /** Species ids taken so far, in the order they were taken. */
  readonly picked: readonly string[]
}

export function startDraft(random: Random = Math.random): DraftState {
  return { candidates: sample(SPECIES_LIST, DRAFT_CONFIG.candidates, random), picked: [] }
}

/**
 * Take a candidate, or put it back if it was already taken.
 *
 * A full hand refuses another rather than silently dropping the oldest pick:
 * the player deselects to change their mind, so no choice is ever lost to a
 * mis-tap.
 */
export function togglePick(draft: DraftState, speciesId: string): DraftState {
  if (draft.picked.includes(speciesId)) {
    return { ...draft, picked: draft.picked.filter((id) => id !== speciesId) }
  }
  if (draft.picked.length >= DRAFT_CONFIG.picks) return draft
  if (!draft.candidates.some((species) => species.id === speciesId)) return draft
  return { ...draft, picked: [...draft.picked, speciesId] }
}

export function isDraftComplete(draft: DraftState): boolean {
  return draft.picked.length === DRAFT_CONFIG.picks
}

/**
 * The party the draft produced, in the order it was picked -- so the first one
 * taken leads the first battle.
 */
export function draftedRoster(draft: DraftState): readonly Species[] {
  const byId = new Map(draft.candidates.map((species) => [species.id, species]))
  return draft.picked
    .map((id) => byId.get(id))
    .filter((species): species is Species => species !== undefined)
}
