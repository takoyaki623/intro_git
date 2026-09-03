import { describe, expect, it } from 'vitest'
import { POKEMON_TYPES, TYPE_CHART, typeEffectiveness } from './types'

describe('typeEffectiveness', () => {
  it('is neutral by default', () => {
    expect(typeEffectiveness('normal', ['fire'])).toBe(1)
  })

  it('doubles against a weakness', () => {
    expect(typeEffectiveness('water', ['fire'])).toBe(2)
  })

  it('halves against a resistance', () => {
    expect(typeEffectiveness('fire', ['water'])).toBe(0.5)
  })

  it('is zero against an immunity', () => {
    expect(typeEffectiveness('electric', ['ground'])).toBe(0)
    expect(typeEffectiveness('normal', ['ghost'])).toBe(0)
    expect(typeEffectiveness('dragon', ['fairy'])).toBe(0)
  })

  it('multiplies across a dual type', () => {
    // Ice is 2x on both grass and ground.
    expect(typeEffectiveness('ice', ['grass', 'ground'])).toBe(4)
    // Fire resists itself and water resists fire.
    expect(typeEffectiveness('fire', ['fire', 'water'])).toBe(0.25)
    // A weakness and a resistance cancel: 2x on grass, 0.5x on water.
    expect(typeEffectiveness('fire', ['grass', 'water'])).toBe(1)
    // Psychic is neutral on grass but 2x on poison.
    expect(typeEffectiveness('psychic', ['grass', 'poison'])).toBe(2)
  })

  it('lets an immunity win over a weakness on the other type', () => {
    // Ground is 2x on steel but has no effect on flying.
    expect(typeEffectiveness('ground', ['steel', 'flying'])).toBe(0)
  })
})

describe('TYPE_CHART', () => {
  it('covers every attacking type', () => {
    expect(Object.keys(TYPE_CHART).sort()).toEqual([...POKEMON_TYPES].sort())
  })

  it('never lists a type in more than one bucket', () => {
    for (const [attacking, matchup] of Object.entries(TYPE_CHART)) {
      const listed = [
        ...(matchup.double ?? []),
        ...(matchup.half ?? []),
        ...(matchup.zero ?? []),
      ]
      expect(new Set(listed).size, `${attacking} lists a type twice`).toBe(listed.length)
    }
  })

  it('only references known types', () => {
    for (const matchup of Object.values(TYPE_CHART)) {
      for (const type of [
        ...(matchup.double ?? []),
        ...(matchup.half ?? []),
        ...(matchup.zero ?? []),
      ]) {
        expect(POKEMON_TYPES).toContain(type)
      }
    }
  })
})
