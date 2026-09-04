import { describe, expect, it } from 'vitest'
import {
  DRAFT_CONFIG,
  chooseTier,
  draftedRoster,
  isDraftComplete,
  startDraft,
  togglePick,
} from './draft'
import { FIRST_TIER, TIER_CONFIG } from './tiers'
import { RUN_CONFIG, startRun } from './run'
import { SPECIES_LIST } from '../data/species'
import { fixedRandom, scriptedRandom } from '../test/rng'

describe('dealing the draft', () => {
  it('lays out the configured number of candidates', () => {
    const draft = startDraft(fixedRandom(0.3))
    expect(draft.candidates).toHaveLength(DRAFT_CONFIG.candidates)
    expect(draft.picked).toEqual([])
  })

  it('never offers the same species twice', () => {
    for (let i = 0; i < 50; i++) {
      const ids = startDraft().candidates.map((species) => species.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('offers only species the game knows about', () => {
    const known = new Set(SPECIES_LIST.map((species) => species.id))
    for (const species of startDraft().candidates)
      expect(known.has(species.id)).toBe(true)
  })

  it('offers more than it asks for, so there is a choice to make', () => {
    expect(DRAFT_CONFIG.candidates).toBeGreaterThan(DRAFT_CONFIG.picks)
  })

  it('asks for exactly the party the run fields', () => {
    expect(DRAFT_CONFIG.picks).toBe(RUN_CONFIG.partySize)
  })
})

describe('picking', () => {
  const dealt = () => startDraft(scriptedRandom(0.1, 0.2, 0.3, 0.4, 0.5, 0.6))

  it('takes a candidate', () => {
    const draft = dealt()
    const id = draft.candidates[0]!.id
    expect(togglePick(draft, id).picked).toEqual([id])
  })

  it('puts one back when it is taken again', () => {
    const draft = dealt()
    const id = draft.candidates[1]!.id
    expect(togglePick(togglePick(draft, id), id).picked).toEqual([])
  })

  it('keeps the order they were taken in', () => {
    const draft = dealt()
    const [a, b, c] = draft.candidates
    const picked = togglePick(togglePick(togglePick(draft, c!.id), a!.id), b!.id)
    expect(picked.picked).toEqual([c!.id, a!.id, b!.id])
  })

  it('refuses a fourth rather than dropping one already taken', () => {
    const draft = dealt()
    const full = draft.candidates
      .slice(0, DRAFT_CONFIG.picks)
      .reduce((state, species) => togglePick(state, species.id), draft)
    const extra = draft.candidates[DRAFT_CONFIG.picks]!

    expect(togglePick(full, extra.id)).toEqual(full)
  })

  it('ignores a species that is not on the table', () => {
    const draft = dealt()
    const absent = SPECIES_LIST.find(
      (species) => !draft.candidates.some((c) => c.id === species.id),
    )!
    expect(togglePick(draft, absent.id)).toEqual(draft)
  })

  it('leaves the draft it was given alone', () => {
    const draft = dealt()
    togglePick(draft, draft.candidates[0]!.id)
    expect(draft.picked).toEqual([])
  })

  it('is complete only at a full party', () => {
    const draft = dealt()
    expect(isDraftComplete(draft)).toBe(false)
    const two = togglePick(
      togglePick(draft, draft.candidates[0]!.id),
      draft.candidates[1]!.id,
    )
    expect(isDraftComplete(two)).toBe(false)
    expect(isDraftComplete(togglePick(two, draft.candidates[2]!.id))).toBe(true)
  })
})

describe('the party the draft produces', () => {
  const dealt = () => startDraft(scriptedRandom(0.1, 0.2, 0.3, 0.4, 0.5, 0.6))

  it('is the picks, in the order they were made', () => {
    const draft = dealt()
    const [a, b, c] = draft.candidates
    const picked = togglePick(togglePick(togglePick(draft, b!.id), c!.id), a!.id)
    expect(draftedRoster(picked)).toEqual([b, c, a])
  })

  it('is what the run fields, led by the first pick', () => {
    const draft = dealt()
    const roster = draftedRoster(
      draft.candidates
        .slice(0, DRAFT_CONFIG.picks)
        .reduce((state, species) => togglePick(state, species.id), draft),
    )
    const run = startRun(fixedRandom(0.3), roster)

    expect(run.battle.player.members.map((m) => m.species.id)).toEqual(
      roster.map((species) => species.id),
    )
    expect(run.battle.player.activeIndex).toBe(0)
    expect(run.battle.player.members[0]!.level).toBe(RUN_CONFIG.playerLevel)
  })

  it('still deals a party when no roster is handed over', () => {
    expect(startRun(fixedRandom(0.3)).battle.player.members).toHaveLength(
      RUN_CONFIG.partySize,
    )
  })
})

describe('the tier a draft is played at', () => {
  it('starts at the first tier unless told otherwise', () => {
    expect(startDraft(fixedRandom(0.3)).tier).toBe(FIRST_TIER)
  })

  it('opens at the tier it was dealt for', () => {
    expect(startDraft(fixedRandom(0.3), 3).tier).toBe(3)
  })

  it('refuses a tier that does not exist', () => {
    expect(startDraft(fixedRandom(0.3), 99).tier).toBe(TIER_CONFIG.max)
    expect(startDraft(fixedRandom(0.3), 0).tier).toBe(FIRST_TIER)
  })

  it('moves to a tier the player has earned', () => {
    const draft = startDraft(fixedRandom(0.3))
    expect(chooseTier(draft, 3, 2).tier).toBe(3)
  })

  it('refuses one they have not', () => {
    const draft = startDraft(fixedRandom(0.3))
    expect(chooseTier(draft, 4, 2)).toEqual(draft)
    expect(chooseTier(draft, 2, 0)).toEqual(draft)
  })

  it('leaves the six on the table alone, so the offer cannot be re-rolled', () => {
    const draft = startDraft(fixedRandom(0.3))
    const moved = chooseTier(draft, 2, 1)
    expect(moved.candidates).toEqual(draft.candidates)
    expect(moved.picked).toEqual(draft.picked)
  })

  it('keeps the picks already made', () => {
    const draft = startDraft(fixedRandom(0.3))
    const picked = togglePick(draft, draft.candidates[0]!.id)
    expect(chooseTier(picked, 2, 1).picked).toEqual(picked.picked)
  })
})
