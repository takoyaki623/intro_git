import { describe, expect, it } from 'vitest'
import {
  MAX_STAGE,
  MIN_STAGE,
  NO_STAGES,
  STAT_KEYS,
  changeStage,
  hasAnyStage,
  stageMultiplier,
  stagedStat,
} from './stages'

describe('stageMultiplier', () => {
  it('leaves an untouched stat alone', () => {
    expect(stageMultiplier(0)).toBe(1)
  })

  it('follows the main series table', () => {
    expect(stageMultiplier(1)).toBe(1.5)
    expect(stageMultiplier(2)).toBe(2)
    expect(stageMultiplier(6)).toBe(4)
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3)
    expect(stageMultiplier(-2)).toBe(0.5)
    expect(stageMultiplier(-6)).toBe(0.25)
  })

  it('clamps beyond the limits', () => {
    expect(stageMultiplier(99)).toBe(stageMultiplier(MAX_STAGE))
    expect(stageMultiplier(-99)).toBe(stageMultiplier(MIN_STAGE))
  })
})

describe('stagedStat', () => {
  it('doubles at +2 and halves at -2', () => {
    expect(stagedStat(100, 2)).toBe(200)
    expect(stagedStat(100, -2)).toBe(50)
  })

  it('never falls below 1', () => {
    expect(stagedStat(1, -6)).toBe(1)
  })
})

describe('changeStage', () => {
  it('moves the stat and reports how far', () => {
    const { stages, applied } = changeStage(NO_STAGES, 'attack', 2)
    expect(stages.attack).toBe(2)
    expect(applied).toBe(2)
  })

  it('leaves the other stats alone', () => {
    const { stages } = changeStage(NO_STAGES, 'speed', -1)
    expect(stages.attack).toBe(0)
    expect(stages.defense).toBe(0)
  })

  it('stops at the ceiling and says nothing moved', () => {
    const maxed = { ...NO_STAGES, attack: MAX_STAGE }
    const { stages, applied } = changeStage(maxed, 'attack', 2)
    expect(stages.attack).toBe(MAX_STAGE)
    expect(applied).toBe(0)
  })

  it('reports the part that fitted when only some of it did', () => {
    const nearly = { ...NO_STAGES, attack: MAX_STAGE - 1 }
    expect(changeStage(nearly, 'attack', 2).applied).toBe(1)
  })

  it('stops at the floor too', () => {
    const bottomed = { ...NO_STAGES, defense: MIN_STAGE }
    expect(changeStage(bottomed, 'defense', -1).applied).toBe(0)
  })

  it('does not mutate what it was given', () => {
    const before = { ...NO_STAGES }
    changeStage(before, 'attack', 2)
    expect(before.attack).toBe(0)
  })
})

describe('hasAnyStage', () => {
  it('is false for an untouched Pokemon', () => {
    expect(hasAnyStage(NO_STAGES)).toBe(false)
  })

  it('is true once any stat has moved', () => {
    for (const stat of STAT_KEYS) {
      expect(hasAnyStage({ ...NO_STAGES, [stat]: -1 })).toBe(true)
    }
  })
})
