import { describe, expect, it } from 'vitest'
import { ENCOUNTER_CONFIG, makeEncounter, makeRoute, rewardsFor } from './encounters'
import { createBattlePokemon, isFainted } from './entities'
import { BOSS_LIST, SPECIES_LIST } from '../data/species'
import { fixedRandom, scriptedRandom } from '../test/rng'

const ids = (list: readonly { species: { id: string } }[]) =>
  list.map((m) => m.species.id)

describe('the ordinary sort', () => {
  it('is a party of the configured size', () => {
    const team = makeEncounter('normal', 40, 0, fixedRandom(0.3))
    expect(team.members).toHaveLength(ENCOUNTER_CONFIG.partySize)
  })

  it('draws distinct species from the roster', () => {
    for (let i = 0; i < 40; i++) {
      const team = makeEncounter('normal', 40, 0, Math.random)
      expect(new Set(ids(team.members)).size).toBe(team.members.length)
    }
  })

  it('fields everyone at the level it was given', () => {
    const team = makeEncounter('normal', 47, 0, fixedRandom(0.3))
    for (const member of team.members) expect(member.level).toBe(47)
  })
})

describe('the elite', () => {
  const elite = (random = fixedRandom(0.3)) => makeEncounter('elite', 40, 0, random)

  it('is one Pokemon, not a party', () => {
    expect(elite().members).toHaveLength(1)
  })

  it('stands a few levels above the road it was found on', () => {
    expect(elite().members[0]!.level).toBe(40 + ENCOUNTER_CONFIG.eliteLevelBonus)
  })

  it('carries several times the health, which is what makes a fight last', () => {
    const one = elite().members[0]!
    const ordinary = createBattlePokemon(one.species, one.level)
    expect(one.stats.hp).toBe(
      Math.floor(ordinary.stats.hp * ENCOUNTER_CONFIG.eliteHealth),
    )
    // ...and it starts at that health rather than at the smaller maximum.
    expect(one.currentHp).toBe(one.stats.hp)
    expect(isFainted(one)).toBe(false)
  })

  it('leaves everything but health alone: it is deep, not stronger', () => {
    const one = elite().members[0]!
    const ordinary = createBattlePokemon(one.species, one.level)
    expect(one.stats.attack).toBe(ordinary.stats.attack)
    expect(one.stats.specialAttack).toBe(ordinary.stats.specialAttack)
    expect(one.stats.speed).toBe(ordinary.stats.speed)
  })

  it('comes from the ordinary roster, not the boss list', () => {
    const bosses = new Set(BOSS_LIST.map((species) => species.id))
    for (let i = 0; i < 40; i++) {
      expect(
        bosses.has(makeEncounter('elite', 40, 0, Math.random).members[0]!.species.id),
      ).toBe(false)
    }
  })

  it('is worth more picks than the ordinary road', () => {
    expect(rewardsFor('elite')).toBeGreaterThan(rewardsFor('normal'))
    expect(rewardsFor('boss')).toBe(rewardsFor('elite'))
  })
})

describe('the boss encounter', () => {
  it('is one of the boss species, alone', () => {
    const team = makeEncounter('boss', 44, 0, fixedRandom(0.3))
    expect(team.members).toHaveLength(1)
    expect(BOSS_LIST.map((s) => s.id)).toContain(team.members[0]!.species.id)
  })

  it('is not given the elite health, which would double up on two walls', () => {
    const one = makeEncounter('boss', 44, 0, fixedRandom(0.3)).members[0]!
    expect(one.stats.hp).toBe(createBattlePokemon(one.species, one.level).stats.hp)
  })
})

describe('held items on an encounter', () => {
  it('arms the front of the party and nobody else', () => {
    const team = makeEncounter('normal', 40, 2, scriptedRandom(0.1, 0.2, 0.3, 0.4, 0.5))
    expect(team.members[0]!.item).not.toBeNull()
    expect(team.members[1]!.item).not.toBeNull()
    expect(team.members[2]!.item).toBeNull()
  })

  it('arms nobody when the tier hands out none', () => {
    const team = makeEncounter('normal', 40, 0, fixedRandom(0.3))
    expect(team.members.every((m) => m.item === null)).toBe(true)
  })
})

describe('the fork', () => {
  it('offers one of each shape, both built', () => {
    const route = makeRoute(40, 0, fixedRandom(0.3))
    expect(route.map((road) => road.kind)).toEqual(['normal', 'elite'])
    for (const road of route) expect(road.team.members.length).toBeGreaterThan(0)
  })

  it('builds them from the roster the run actually has', () => {
    const known = new Set(SPECIES_LIST.map((species) => species.id))
    for (let i = 0; i < 30; i++) {
      for (const road of makeRoute(40, 0, Math.random)) {
        for (const member of road.team.members)
          expect(known.has(member.species.id)).toBe(true)
      }
    }
  })
})
