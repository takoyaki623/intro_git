import { describe, expect, it } from 'vitest'
import type { BattlePokemon, Move } from './entities'
import { createBattlePokemon, isFainted } from './entities'
import type { ItemKind } from './items'
import {
  REWARD_CONFIG,
  applyReward,
  availableRewards,
  needsTarget,
  offerRewards,
  sameOffer,
  targetsFor,
} from './rewards'
import { SPECIES } from '../data/species'
import { MOVES, MOVE_LIST } from '../data/moves'
import { fixedRandom, scriptedRandom } from '../test/rng'

const pikachu = () => createBattlePokemon(SPECIES.pikachu, 50)
const squirtle = () => createBattlePokemon(SPECIES.squirtle, 50)
const bulbasaur = () => createBattlePokemon(SPECIES.bulbasaur, 50)

const hurt = (member: BattlePokemon, hp: number): BattlePokemon => ({
  ...member,
  currentHp: hp,
})
const downed = (member: BattlePokemon): BattlePokemon => ({ ...member, currentHp: 0 })

describe('availableRewards', () => {
  it('always offers a level up', () => {
    expect(availableRewards([pikachu()])).toContain('levelUp')
  })

  it('offers healing only when somebody is hurt', () => {
    expect(availableRewards([pikachu()])).not.toContain('heal')
    expect(availableRewards([hurt(pikachu(), 10)])).toContain('heal')
  })

  it('offers a revival only when somebody is down', () => {
    expect(availableRewards([hurt(pikachu(), 10)])).not.toContain('revive')
    expect(availableRewards([downed(pikachu())])).toContain('revive')
  })

  it('stops offering recruits once the party is full', () => {
    const full = Array.from({ length: REWARD_CONFIG.maxPartySize }, pikachu)
    expect(availableRewards([pikachu()])).toContain('recruit')
    expect(availableRewards(full)).not.toContain('recruit')
  })
})

describe('offerRewards', () => {
  it('offers no more than the configured number', () => {
    const offer = offerRewards(
      [downed(hurt(pikachu(), 0)), hurt(squirtle(), 5)],
      fixedRandom(0.3),
    )
    expect(offer.length).toBeLessThanOrEqual(REWARD_CONFIG.choices)
  })

  it('never repeats a reward', () => {
    const offer = offerRewards([downed(pikachu()), hurt(squirtle(), 5)], fixedRandom(0.5))
    expect(new Set(offer).size).toBe(offer.length)
  })

  it('only offers what is worth offering', () => {
    // A full-health party with nobody down: no healing, no revival.
    const offer = offerRewards([pikachu(), squirtle()], fixedRandom(0.3))
    const kinds = offer.map((entry) => entry.kind)
    expect(kinds).not.toContain('heal')
    expect(kinds).not.toContain('revive')
  })
})

describe('applyReward', () => {
  it('heals everyone still standing, and leaves the fallen where they are', () => {
    const before = [hurt(pikachu(), 10), downed(squirtle())]
    const after = applyReward(before, { kind: 'heal' })
    expect(after[0]?.currentHp).toBe(after[0]?.stats.hp)
    expect(after[1]?.currentHp).toBe(0)
  })

  it('brings one fainted Pokemon back at half health', () => {
    const before = [downed(pikachu()), downed(squirtle())]
    const after = applyReward(before, { kind: 'revive' })
    expect(after[0]?.currentHp).toBe(
      Math.floor(pikachu().stats.hp * REWARD_CONFIG.reviveFraction),
    )
    // Only one comes back.
    expect(after[1]?.currentHp).toBe(0)
  })

  it('clears the condition of the Pokemon it revives', () => {
    const before = [{ ...downed(pikachu()), status: { kind: 'burn' as const } }]
    expect(applyReward(before, { kind: 'revive' })[0]?.status).toBeNull()
  })

  it('does nothing on a revive when nobody is down', () => {
    const before = [pikachu()]
    expect(applyReward(before, { kind: 'revive' })).toEqual(before)
  })

  it('raises every level and recomputes the stats', () => {
    const before = [pikachu()]
    const after = applyReward(before, { kind: 'levelUp' })
    expect(after[0]?.level).toBe(50 + REWARD_CONFIG.levelsGained)
    expect(after[0]?.stats.hp).toBeGreaterThan(pikachu().stats.hp)
  })

  it('keeps the damage taken across a level up, so the gain is felt as healing', () => {
    const before = [hurt(pikachu(), pikachu().stats.hp - 20)]
    const after = applyReward(before, { kind: 'levelUp' })
    const member = after[0]
    if (!member) throw new Error('expected a member')
    expect(member.stats.hp - member.currentHp).toBe(20)
    expect(member.currentHp).toBeGreaterThan(before[0]!.currentHp)
  })

  it('does not stand a fainted Pokemon back up by levelling it', () => {
    const after = applyReward([downed(pikachu())], { kind: 'levelUp' })
    expect(isFainted(after[0]!)).toBe(true)
  })

  it('adds a Pokemon the party does not already have', () => {
    const before = [pikachu(), squirtle(), bulbasaur()]
    const after = applyReward(before, { kind: 'recruit' }, null, fixedRandom(0.3))
    expect(after).toHaveLength(4)
    const ids = after.map((m) => m.species.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('matches the recruit to the party it joins', () => {
    const veterans = [{ ...pikachu(), level: 62 }]
    const after = applyReward(veterans, { kind: 'recruit' }, null, fixedRandom(0.3))
    expect(after[1]?.level).toBe(62)
  })

  it('will not grow the party past the limit', () => {
    const full = Array.from({ length: REWARD_CONFIG.maxPartySize }, pikachu)
    expect(applyReward(full, { kind: 'recruit' }, null, fixedRandom(0.3))).toHaveLength(
      REWARD_CONFIG.maxPartySize,
    )
  })

  it('leaves the party it was given alone', () => {
    const before = [hurt(pikachu(), 10)]
    const snapshot = JSON.stringify(before)
    applyReward(before, { kind: 'heal' })
    applyReward(before, { kind: 'levelUp' })
    applyReward(before, { kind: 'recruit' }, null, scriptedRandom(0.2))
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('わざを おぼえる', () => {
  const teach = (move: Move) => ({ kind: 'teach' as const, move })

  it('swaps the chosen move for the one on offer', () => {
    const before = [pikachu()]
    const after = applyReward(before, teach(MOVES.uTurn), { member: 0, slot: 1 })
    expect(after[0]?.moves.map((m) => m.id)).toEqual([
      pikachu().moves[0]!.id,
      'uTurn',
      pikachu().moves[2]!.id,
      pikachu().moves[3]!.id,
    ])
  })

  it('leaves every other member alone', () => {
    const before = [pikachu(), squirtle()]
    const after = applyReward(before, teach(MOVES.uTurn), { member: 0, slot: 0 })
    expect(after[1]?.moves).toEqual(squirtle().moves)
  })

  it('does not touch the species, so the opposing party keeps its own moves', () => {
    const before = [pikachu()]
    applyReward(before, teach(MOVES.uTurn), { member: 0, slot: 0 })
    expect(SPECIES.pikachu.moves.map((m) => m.id)).not.toContain('uTurn')
    expect(createBattlePokemon(SPECIES.pikachu, 50).moves).toEqual(SPECIES.pikachu.moves)
  })

  it('does nothing without a target rather than guessing one', () => {
    const before = [pikachu()]
    expect(applyReward(before, teach(MOVES.uTurn))).toEqual(before)
  })

  it('ignores a member who is not there', () => {
    const before = [pikachu()]
    expect(applyReward(before, teach(MOVES.uTurn), { member: 7, slot: 0 })).toEqual(
      before,
    )
  })

  it('ignores a slot that is not there', () => {
    const before = [pikachu()]
    expect(applyReward(before, teach(MOVES.uTurn), { member: 0, slot: 9 })).toEqual(
      before,
    )
    expect(applyReward(before, teach(MOVES.uTurn), { member: 0, slot: -1 })).toEqual(
      before,
    )
  })

  it('refuses to teach a move the Pokemon already knows', () => {
    const known = pikachu().moves[0]!
    const before = [pikachu()]
    expect(applyReward(before, teach(known), { member: 0, slot: 2 })).toEqual(before)
  })

  it('will not aim at a fainted Pokemon', () => {
    const before = [downed(pikachu()), squirtle()]
    expect(targetsFor(teach(MOVES.uTurn), before)).toEqual([1])
    expect(applyReward(before, teach(MOVES.uTurn), { member: 0, slot: 0 })).toEqual(
      before,
    )
  })

  it('offers a move nobody in the party already has', () => {
    const party = [pikachu(), squirtle(), bulbasaur()]
    const known = new Set(party.flatMap((m) => m.moves.map((move) => move.id)))
    for (let i = 0; i < 60; i++) {
      const offer = offerRewards(party).find((entry) => entry.kind === 'teach')
      if (offer?.kind === 'teach') expect(known.has(offer.move.id)).toBe(false)
    }
  })

  it('leaves the party it was given alone', () => {
    const before = [pikachu()]
    const snapshot = JSON.stringify(before)
    applyReward(before, teach(MOVES.uTurn), { member: 0, slot: 0 })
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('もちものを もらう', () => {
  const give = (item: ItemKind) => ({ kind: 'item' as const, item })

  it('gives the item to the member the player pointed at', () => {
    const before = [pikachu(), squirtle()]
    const after = applyReward(before, give('leftovers'), { member: 1 })
    expect(after[0]?.item).toBeNull()
    expect(after[1]?.item).toBe('leftovers')
  })

  it('offers only members with empty hands', () => {
    const holding = { ...pikachu(), item: 'focusSash' as const }
    expect(targetsFor(give('leftovers'), [holding, squirtle()])).toEqual([1])
  })

  it('will not arm a fainted Pokemon', () => {
    expect(targetsFor(give('leftovers'), [downed(pikachu()), squirtle()])).toEqual([1])
  })

  it('falls back to the only sensible member when nobody was named', () => {
    const holding = { ...pikachu(), item: 'focusSash' as const }
    const after = applyReward([holding, squirtle()], give('leftovers'))
    expect(after[1]?.item).toBe('leftovers')
  })

  it('does nothing when the named member cannot take it', () => {
    const holding = { ...pikachu(), item: 'focusSash' as const }
    const before = [holding, squirtle()]
    expect(applyReward(before, give('leftovers'), { member: 0 })).toEqual(before)
  })
})

describe('an offer is compared by what it holds', () => {
  it('matches a copy that came back from a save', () => {
    expect(sameOffer({ kind: 'heal' }, { kind: 'heal' })).toBe(true)
    expect(
      sameOffer(
        { kind: 'teach', move: MOVES.uTurn },
        { kind: 'teach', move: MOVES.uTurn },
      ),
    ).toBe(true)
  })

  it('tells two of the same kind apart by what they give', () => {
    expect(
      sameOffer(
        { kind: 'teach', move: MOVES.uTurn },
        { kind: 'teach', move: MOVES.voltSwitch },
      ),
    ).toBe(false)
    expect(
      sameOffer({ kind: 'item', item: 'leftovers' }, { kind: 'item', item: 'focusSash' }),
    ).toBe(false)
  })

  it('never matches across kinds', () => {
    expect(sameOffer({ kind: 'heal' }, { kind: 'revive' })).toBe(false)
  })
})

describe('a reward that needs pointing at somebody', () => {
  it('is only the two that build a party', () => {
    expect(needsTarget({ kind: 'teach', move: MOVES.uTurn })).toBe(true)
    expect(needsTarget({ kind: 'item', item: 'leftovers' })).toBe(true)
    for (const kind of ['heal', 'revive', 'levelUp', 'recruit'] as const) {
      expect(needsTarget({ kind })).toBe(false)
    }
  })

  it('is never offered when there is nobody to aim it at', () => {
    // Everyone armed and holding every move the game has: neither can land.
    const armed = { ...pikachu(), item: 'leftovers' as const, moves: MOVE_LIST }
    for (let i = 0; i < 40; i++) {
      for (const offer of offerRewards([armed])) {
        expect(needsTarget(offer)).toBe(false)
      }
    }
  })
})
