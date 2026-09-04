import { describe, expect, it } from 'vitest'
import { ALL_SPECIES, BOSS_LIST, BOSS_SPECIES, SPECIES, SPECIES_LIST } from './species'
import { MOVES } from './moves'
import { POKEMON_TYPES, typeEffectiveness } from '../domain/types'
import type { Move } from '../domain/entities'
import { baseStatTotal, createBattlePokemon } from '../domain/entities'

// MOVES is `as const`, so Object.values gives a union of literal shapes rather
// than Move; widen it once here.
const ALL_MOVES: readonly Move[] = Object.values(MOVES)

describe('the roster', () => {
  it('is big enough that a run does not draw the same faces every time', () => {
    expect(SPECIES_LIST.length).toBeGreaterThanOrEqual(15)
  })

  it('covers every type, so the chart is exercised rather than decorative', () => {
    const covered = new Set(SPECIES_LIST.flatMap((species) => species.types))
    const missing = POKEMON_TYPES.filter((type) => !covered.has(type))
    expect(missing).toEqual([])
  })

  it('keys each entry by its own id', () => {
    for (const [key, species] of Object.entries(SPECIES)) {
      expect(species.id).toBe(key)
    }
  })

  it('gives every species a name and a distinct one', () => {
    const names = SPECIES_LIST.map((species) => species.name)
    expect(names.every(Boolean)).toBe(true)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('every species is fit to fight', () => {
  // ALL_SPECIES, so the boss is held to the same standard as the roster.
  it.each(ALL_SPECIES.map((species) => [species.name, species] as const))(
    '%s',
    (_name, species) => {
      expect(species.types.length).toBeGreaterThanOrEqual(1)
      expect(species.types.length).toBeLessThanOrEqual(2)
      expect(new Set(species.types).size).toBe(species.types.length)

      expect(species.moves).toHaveLength(4)
      expect(new Set(species.moves.map((m) => m.id)).size).toBe(4)
      // A party of status moves alone could never win a battle.
      expect(species.moves.some((move) => move.power > 0)).toBe(true)

      for (const stat of Object.values(species.baseStats)) {
        expect(stat).toBeGreaterThan(0)
      }

      const fighter = createBattlePokemon(species, 50)
      expect(fighter.currentHp).toBe(fighter.stats.hp)
      expect(fighter.stats.hp).toBeGreaterThan(0)
    },
  )
})

describe('the move list', () => {
  it('keys each move by its own id', () => {
    for (const [key, move] of Object.entries<Move>(MOVES)) {
      expect(move.id).toBe(key)
    }
  })

  it('gives damaging moves power and status moves none', () => {
    for (const move of ALL_MOVES) {
      if (move.category === 'status') expect(move.power).toBe(0)
      else expect(move.power).toBeGreaterThan(0)
    }
  })

  it('keeps every accuracy a real chance', () => {
    for (const move of ALL_MOVES) {
      expect(move.accuracy).toBeGreaterThan(0)
      expect(move.accuracy).toBeLessThanOrEqual(1)
    }
  })

  it('gives a status move something to do', () => {
    for (const move of ALL_MOVES) {
      if (move.category !== 'status') continue
      expect(
        move.effect || move.stageChange,
        `${move.name} would do nothing at all`,
      ).toBeTruthy()
    }
  })

  it('is all reachable from some species', () => {
    const known = new Set(ALL_SPECIES.flatMap((s) => s.moves.map((m) => m.id)))
    const orphans = ALL_MOVES.filter((move) => !known.has(move.id)).map(
      (move) => move.name,
    )
    expect(orphans).toEqual([])
  })
})

describe('the boss', () => {
  it('is kept out of everything a run draws from', () => {
    const roster = new Set(SPECIES_LIST.map((species) => species.id))
    for (const boss of BOSS_LIST) expect(roster.has(boss.id)).toBe(false)
  })

  it('exists, and appears in the full list alongside the roster', () => {
    expect(BOSS_LIST.length).toBeGreaterThan(0)
    expect(ALL_SPECIES).toHaveLength(SPECIES_LIST.length + BOSS_LIST.length)
  })

  it('outclasses anything the player can draft', () => {
    const strongest = Math.max(...SPECIES_LIST.map(baseStatTotal))
    for (const boss of BOSS_LIST) expect(baseStatTotal(boss)).toBeGreaterThan(strongest)
  })

  it('is answerable: something in the roster hits it hard', () => {
    for (const boss of BOSS_LIST) {
      const answers = SPECIES_LIST.filter((species) =>
        species.moves.some(
          (move) =>
            move.category !== 'status' && typeEffectiveness(move.type, boss.types) > 1,
        ),
      )
      // Not every draft will offer one, which is the point of the coverage
      // line on the draft cards -- but the answer has to exist to be looked for.
      expect(answers.length).toBeGreaterThan(2)
    }
  })

  it('keys each entry by its own id', () => {
    for (const [key, species] of Object.entries(BOSS_SPECIES)) {
      expect(species.id).toBe(key)
    }
  })
})
