import { describe, expect, it } from 'vitest'
import type { BattlePokemon } from './entities'
import { createBattlePokemon, isFainted } from './entities'
import { REWARD_CONFIG, applyReward, availableRewards, offerRewards } from './rewards'
import { SPECIES } from '../data/species'
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
    expect(offer).not.toContain('heal')
    expect(offer).not.toContain('revive')
  })
})

describe('applyReward', () => {
  it('heals everyone still standing, and leaves the fallen where they are', () => {
    const before = [hurt(pikachu(), 10), downed(squirtle())]
    const after = applyReward(before, 'heal')
    expect(after[0]?.currentHp).toBe(after[0]?.stats.hp)
    expect(after[1]?.currentHp).toBe(0)
  })

  it('brings one fainted Pokemon back at half health', () => {
    const before = [downed(pikachu()), downed(squirtle())]
    const after = applyReward(before, 'revive')
    expect(after[0]?.currentHp).toBe(
      Math.floor(pikachu().stats.hp * REWARD_CONFIG.reviveFraction),
    )
    // Only one comes back.
    expect(after[1]?.currentHp).toBe(0)
  })

  it('clears the condition of the Pokemon it revives', () => {
    const before = [{ ...downed(pikachu()), status: { kind: 'burn' as const } }]
    expect(applyReward(before, 'revive')[0]?.status).toBeNull()
  })

  it('does nothing on a revive when nobody is down', () => {
    const before = [pikachu()]
    expect(applyReward(before, 'revive')).toEqual(before)
  })

  it('raises every level and recomputes the stats', () => {
    const before = [pikachu()]
    const after = applyReward(before, 'levelUp')
    expect(after[0]?.level).toBe(50 + REWARD_CONFIG.levelsGained)
    expect(after[0]?.stats.hp).toBeGreaterThan(pikachu().stats.hp)
  })

  it('keeps the damage taken across a level up, so the gain is felt as healing', () => {
    const before = [hurt(pikachu(), pikachu().stats.hp - 20)]
    const after = applyReward(before, 'levelUp')
    const member = after[0]
    if (!member) throw new Error('expected a member')
    expect(member.stats.hp - member.currentHp).toBe(20)
    expect(member.currentHp).toBeGreaterThan(before[0]!.currentHp)
  })

  it('does not stand a fainted Pokemon back up by levelling it', () => {
    const after = applyReward([downed(pikachu())], 'levelUp')
    expect(isFainted(after[0]!)).toBe(true)
  })

  it('adds a Pokemon the party does not already have', () => {
    const before = [pikachu(), squirtle(), bulbasaur()]
    const after = applyReward(before, 'recruit', fixedRandom(0.3))
    expect(after).toHaveLength(4)
    const ids = after.map((m) => m.species.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('matches the recruit to the party it joins', () => {
    const veterans = [{ ...pikachu(), level: 62 }]
    const after = applyReward(veterans, 'recruit', fixedRandom(0.3))
    expect(after[1]?.level).toBe(62)
  })

  it('will not grow the party past the limit', () => {
    const full = Array.from({ length: REWARD_CONFIG.maxPartySize }, pikachu)
    expect(applyReward(full, 'recruit', fixedRandom(0.3))).toHaveLength(
      REWARD_CONFIG.maxPartySize,
    )
  })

  it('leaves the party it was given alone', () => {
    const before = [hurt(pikachu(), 10)]
    const snapshot = JSON.stringify(before)
    applyReward(before, 'heal')
    applyReward(before, 'levelUp')
    applyReward(before, 'recruit', scriptedRandom(0.2))
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})
