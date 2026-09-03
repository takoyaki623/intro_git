import { describe, expect, it } from 'vitest'
import { CRITICAL_CHANCE, calculateDamage } from './damage'
import { createBattlePokemon } from './entities'
import { SPECIES } from '../data/species'
import { MOVES } from '../data/moves'
import { fixedRandom, scriptedRandom } from '../test/rng'

const pikachu = createBattlePokemon(SPECIES.pikachu, 50)
const squirtle = createBattlePokemon(SPECIES.squirtle, 50)

// No crit (first roll above the crit chance), maximum spread (second roll 1).
const noCritMaxRoll = scriptedRandom(1, 1)

describe('calculateDamage', () => {
  it('is deterministic for a given random sequence', () => {
    const a = calculateDamage(pikachu, squirtle, MOVES.thunderbolt, noCritMaxRoll)
    const b = calculateDamage(pikachu, squirtle, MOVES.thunderbolt, noCritMaxRoll)
    expect(a).toEqual(b)
  })

  it('reports the type multiplier it used', () => {
    const result = calculateDamage(pikachu, squirtle, MOVES.thunderbolt, noCritMaxRoll)
    expect(result.effectiveness).toBe(2)
  })

  it('deals no damage into an immunity', () => {
    const result = calculateDamage(pikachu, squirtle, MOVES.dig, noCritMaxRoll)
    // Squirtle is pure water, so Dig is neutral, not immune -- sanity check the setup.
    expect(result.effectiveness).toBe(1)

    const intoGround = calculateDamage(
      pikachu,
      createBattlePokemon({ ...SPECIES.squirtle, types: ['ground'] }, 50),
      MOVES.thunderbolt,
      noCritMaxRoll,
    )
    expect(intoGround).toEqual({
      damage: 0,
      effectiveness: 0,
      critical: false,
      absorbed: null,
    })
  })

  it('applies STAB', () => {
    // Normal is neutral to both electric and poison, so type effectiveness is
    // held at 1x and STAB is the only thing left to separate the two moves.
    const neutral = createBattlePokemon({ ...SPECIES.squirtle, types: ['normal'] }, 50)
    const stab = calculateDamage(pikachu, neutral, MOVES.thunderbolt, noCritMaxRoll)
    const noStab = calculateDamage(pikachu, neutral, MOVES.sludgeBomb, noCritMaxRoll)
    // Same power and both special, so only STAB separates them.
    expect(MOVES.thunderbolt.power).toBe(MOVES.sludgeBomb.power)
    expect(stab.effectiveness).toBe(noStab.effectiveness)
    expect(stab.damage).toBeGreaterThan(noStab.damage)
  })

  it('hits harder on a critical', () => {
    const crit = calculateDamage(
      pikachu,
      squirtle,
      MOVES.thunderbolt,
      scriptedRandom(0, 1),
    )
    const normal = calculateDamage(pikachu, squirtle, MOVES.thunderbolt, noCritMaxRoll)
    expect(crit.critical).toBe(true)
    expect(normal.critical).toBe(false)
    expect(crit.damage).toBeGreaterThan(normal.damage)
  })

  it('rolls a critical below the crit chance and not at or above it', () => {
    expect(
      calculateDamage(pikachu, squirtle, MOVES.thunderbolt, fixedRandom(CRITICAL_CHANCE))
        .critical,
    ).toBe(false)
    expect(
      calculateDamage(
        pikachu,
        squirtle,
        MOVES.thunderbolt,
        scriptedRandom(CRITICAL_CHANCE - 0.001, 1),
      ).critical,
    ).toBe(true)
  })

  it('spreads damage between 85% and 100% of the roll', () => {
    const low = calculateDamage(
      pikachu,
      squirtle,
      MOVES.thunderbolt,
      scriptedRandom(1, 0),
    )
    const high = calculateDamage(pikachu, squirtle, MOVES.thunderbolt, noCritMaxRoll)
    expect(low.damage).toBeLessThan(high.damage)
    expect(low.damage / high.damage).toBeGreaterThanOrEqual(0.84)
  })

  it('always takes at least 1 HP when it connects', () => {
    const tank = createBattlePokemon(
      {
        ...SPECIES.squirtle,
        baseStats: { ...SPECIES.squirtle.baseStats, specialDefense: 255 },
      },
      100,
    )
    const weakling = createBattlePokemon(
      {
        ...SPECIES.pikachu,
        baseStats: { ...SPECIES.pikachu.baseStats, specialAttack: 1 },
      },
      1,
    )
    const result = calculateDamage(weakling, tank, MOVES.confusion, scriptedRandom(1, 0))
    expect(result.damage).toBeGreaterThanOrEqual(1)
  })
})
