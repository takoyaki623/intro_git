import { describe, expect, it } from 'vitest'
import {
  FIRST_TIER,
  TIER_CONFIG,
  clampTier,
  highestUnlocked,
  isTierUnlocked,
  nextTier,
  tierHeldItems,
  tierLevelBonus,
} from './tiers'
import type { RunState } from './run'
import type { RewardOffer, RewardTarget } from './rewards'
import {
  RUN_CONFIG,
  advance,
  isFinalBattle,
  opponentLevel,
  startRun,
  takeReward,
} from './run'
import { fixedRandom } from '../test/rng'

/**
 * Spend the reward and take the first road, which is what `advance` did in one
 * call before a win started offering a choice of opponent.
 */
const settle = (
  run: RunState,
  reward: RewardOffer | null = null,
  target: RewardTarget | null = null,
  random = fixedRandom(0.3),
): RunState => advance(takeReward(run, reward, target, random), 0, random)

const ALL = Array.from({ length: TIER_CONFIG.max }, (_, i) => i + 1)

describe('tierLevelBonus', () => {
  it('costs nothing at the first tier', () => {
    expect(tierLevelBonus(FIRST_TIER)).toBe(0)
  })

  it('climbs a step at a time', () => {
    for (const tier of ALL) {
      expect(tierLevelBonus(tier)).toBe((tier - 1) * TIER_CONFIG.levelStep)
    }
  })

  it('never rewards a tier that does not exist', () => {
    expect(tierLevelBonus(0)).toBe(0)
    expect(tierLevelBonus(-3)).toBe(0)
    expect(tierLevelBonus(TIER_CONFIG.max + 5)).toBe(tierLevelBonus(TIER_CONFIG.max))
  })
})

describe('clampTier', () => {
  it('keeps a tier that exists', () => {
    for (const tier of ALL) expect(clampTier(tier)).toBe(tier)
  })

  it('pulls anything else back into range', () => {
    expect(clampTier(0)).toBe(FIRST_TIER)
    expect(clampTier(-1)).toBe(FIRST_TIER)
    expect(clampTier(99)).toBe(TIER_CONFIG.max)
    expect(clampTier(1.5)).toBe(FIRST_TIER)
    expect(clampTier(Number.NaN)).toBe(FIRST_TIER)
  })
})

describe('what is open', () => {
  it('starts with only the first tier', () => {
    expect(isTierUnlocked(1, 0)).toBe(true)
    expect(isTierUnlocked(2, 0)).toBe(false)
    expect(highestUnlocked(0)).toBe(FIRST_TIER)
  })

  it('opens exactly one step past the record', () => {
    expect(isTierUnlocked(3, 2)).toBe(true)
    expect(isTierUnlocked(4, 2)).toBe(false)
    expect(highestUnlocked(2)).toBe(3)
  })

  it('stops at the top rather than promising a tier that is not there', () => {
    expect(highestUnlocked(TIER_CONFIG.max)).toBe(TIER_CONFIG.max)
    expect(isTierUnlocked(TIER_CONFIG.max + 1, TIER_CONFIG.max)).toBe(false)
    expect(nextTier(TIER_CONFIG.max)).toBeNull()
    expect(nextTier(1)).toBe(2)
  })
})

describe('a run at a tier', () => {
  it('meets a stronger field the higher it goes', () => {
    for (const tier of ALL) {
      expect(opponentLevel(0, tier)).toBe(
        RUN_CONFIG.opponentStartingLevel + tierLevelBonus(tier),
      )
    }
  })

  it('keeps the same climb within a run', () => {
    for (const tier of ALL) {
      expect(opponentLevel(3, tier) - opponentLevel(0, tier)).toBe(
        3 * RUN_CONFIG.levelStepPerWin,
      )
    }
  })

  it('reads as the first tier when nobody said otherwise', () => {
    expect(opponentLevel(0)).toBe(opponentLevel(0, FIRST_TIER))
    expect(startRun(fixedRandom(0.3)).tier).toBe(FIRST_TIER)
  })

  it('fields the tier it was started at', () => {
    const run = startRun(fixedRandom(0.3), undefined, 3)
    expect(run.tier).toBe(3)
    expect(run.battle.opponent.members[0]!.level).toBe(opponentLevel(0, 3))
  })

  it('refuses a tier that does not exist rather than trusting it', () => {
    expect(startRun(fixedRandom(0.3), undefined, 99).tier).toBe(TIER_CONFIG.max)
    expect(startRun(fixedRandom(0.3), undefined, 0).tier).toBe(FIRST_TIER)
  })

  it('stays at its tier as the run goes on', () => {
    let run = startRun(fixedRandom(0.3), undefined, 4)
    run = { ...run, battle: { ...run.battle, winner: 'player' } }
    const next = settle(run)
    expect(next.tier).toBe(4)
    expect(next.battle.opponent.members[0]!.level).toBe(opponentLevel(1, 4))
  })
})

describe('held items climb with the tier', () => {
  it('arms nobody at the first tier', () => {
    expect(tierHeldItems(FIRST_TIER)).toBe(0)
    const run = startRun(fixedRandom(0.3))
    expect(run.battle.opponent.members.every((m) => m.item === null)).toBe(true)
  })

  it('arms one more of them for each tier above it', () => {
    for (const tier of ALL) {
      expect(tierHeldItems(tier)).toBe((tier - 1) * TIER_CONFIG.itemsPerTier)
    }
  })

  it('puts them on the opposing party a run at that tier meets', () => {
    const run = startRun(fixedRandom(0.3), undefined, 3)
    const holding = run.battle.opponent.members.filter((m) => m.item !== null)
    expect(holding).toHaveLength(Math.min(tierHeldItems(3), RUN_CONFIG.partySize))
  })

  it('leaves the player alone', () => {
    const run = startRun(fixedRandom(0.3), undefined, TIER_CONFIG.max)
    expect(run.battle.player.members.every((m) => m.item === null)).toBe(true)
  })

  it('arms the boss too, which is a party of one', () => {
    let run = startRun(fixedRandom(0.3), undefined, 4)
    while (!isFinalBattle(run.wins)) {
      run = settle({ ...run, battle: { ...run.battle, winner: 'player' } })
    }
    expect(run.battle.opponent.members).toHaveLength(1)
    expect(run.battle.opponent.members[0]?.item).not.toBeNull()
  })
})
