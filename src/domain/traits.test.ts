import { describe, expect, it } from 'vitest'
import type { BattlePokemon, Species } from './entities'
import { activePokemon, createBattlePokemon, createTeam } from './entities'
import type { BattleState } from './battle'
import { createBattle, forceSwitch, resolveTurn } from './battle'
import { calculateDamage } from './damage'
import { ABSORB_FRACTION } from './abilities'
import {
  EXPERT_BELT_MULTIPLIER,
  LEFTOVERS_FRACTION,
  SITRUS_FRACTION,
  berryHealing,
  damageMultiplier,
} from './items'
import { SPECIES } from '../data/species'
import { MOVES } from '../data/moves'
import { fixedRandom } from '../test/rng'

const team = (species: readonly Species[]) =>
  createTeam(species.map((s) => createBattlePokemon(s, 50)))

const attackWith = (move: (typeof MOVES)[keyof typeof MOVES]) =>
  ({ type: 'move', move }) as const
const swap = (index: number) => ({ type: 'switch', index }) as const
const cleanHit = () => fixedRandom(0.9)

const holding = (pokemon: BattlePokemon, item: BattlePokemon['item']) => ({
  ...pokemon,
  item,
})

const withPlayer = (state: BattleState, members: readonly BattlePokemon[]) => ({
  ...state,
  player: { ...state.player, members },
})

const kinds = (state: BattleState) => state.events.map((event) => event.kind)
const abilityEvents = (state: BattleState) =>
  state.events.flatMap((event) => (event.kind === 'ability' ? [event] : []))
const itemEvents = (state: BattleState) =>
  state.events.flatMap((event) => (event.kind === 'item' ? [event] : []))

describe('item helpers', () => {
  it('adds nothing unless the hit was super effective', () => {
    expect(damageMultiplier('expertBelt', 2)).toBe(EXPERT_BELT_MULTIPLIER)
    expect(damageMultiplier('expertBelt', 1)).toBe(1)
    expect(damageMultiplier('expertBelt', 0.5)).toBe(1)
    expect(damageMultiplier('leftovers', 2)).toBe(1)
    expect(damageMultiplier(null, 2)).toBe(1)
  })

  it('waits for health to fall below half before spending the berry', () => {
    expect(berryHealing('sitrusBerry', 60, 100)).toBe(0)
    expect(berryHealing('sitrusBerry', 50, 100)).toBe(0)
    expect(berryHealing('sitrusBerry', 49, 100)).toBe(Math.floor(100 * SITRUS_FRACTION))
  })

  it('does not fire on a Pokemon already down, or without the berry', () => {
    expect(berryHealing('sitrusBerry', 0, 100)).toBe(0)
    expect(berryHealing('leftovers', 10, 100)).toBe(0)
    expect(berryHealing(null, 10, 100)).toBe(0)
  })
})

describe('ふゆう', () => {
  it('shrugs off a ground move entirely', () => {
    // ゴース has ふゆう, and あなをほる would otherwise be neutral into it.
    const gastly = createBattlePokemon(SPECIES.gastly, 50)
    const pikachu = createBattlePokemon(SPECIES.pikachu, 50)
    const result = calculateDamage(pikachu, gastly, MOVES.dig, cleanHit())
    expect(result).toMatchObject({ damage: 0, effectiveness: 0, absorbed: 'immune' })
  })

  it('says so in the log, and the target takes nothing', () => {
    const state = resolveTurn(
      createBattle(team([SPECIES.pikachu]), team([SPECIES.gastly])),
      attackWith(MOVES.dig),
      attackWith(MOVES.confusion),
      cleanHit(),
    )
    expect(abilityEvents(state)).toContainEqual(
      expect.objectContaining({ ability: 'levitate', outcome: 'immune' }),
    )
    expect(activePokemon(state.opponent).currentHp).toBe(
      activePokemon(state.opponent).stats.hp,
    )
  })
})

describe('ちょすい', () => {
  it('turns a water move into health', () => {
    const start = createBattle(team([SPECIES.squirtle]), team([SPECIES.dewgong]))
    const hurt: BattleState = {
      ...start,
      opponent: {
        ...start.opponent,
        members: start.opponent.members.map((m) => ({ ...m, currentHp: 20 })),
      },
    }
    const state = resolveTurn(
      hurt,
      attackWith(MOVES.surf),
      attackWith(MOVES.growl),
      cleanHit(),
    )
    const dewgong = activePokemon(state.opponent)
    expect(dewgong.currentHp).toBe(20 + Math.floor(dewgong.stats.hp * ABSORB_FRACTION))
    expect(abilityEvents(state)).toContainEqual(
      expect.objectContaining({ ability: 'waterAbsorb', outcome: 'heal' }),
    )
  })

  it('never heals past full', () => {
    const state = resolveTurn(
      createBattle(team([SPECIES.squirtle]), team([SPECIES.dewgong])),
      attackWith(MOVES.surf),
      attackWith(MOVES.growl),
      cleanHit(),
    )
    const dewgong = activePokemon(state.opponent)
    expect(dewgong.currentHp).toBe(dewgong.stats.hp)
  })
})

describe('がんじょう', () => {
  it('holds on at 1 HP through a blow from full health', () => {
    // イシツブテ has がんじょう; なみのり is 4x into rock/ground.
    const state = resolveTurn(
      createBattle(team([SPECIES.squirtle]), team([SPECIES.geodude])),
      attackWith(MOVES.surf),
      attackWith(MOVES.tackle),
      cleanHit(),
    )
    expect(activePokemon(state.opponent).currentHp).toBe(1)
    expect(abilityEvents(state)).toContainEqual(
      expect.objectContaining({ ability: 'sturdy', outcome: 'endured' }),
    )
  })

  it('does not save a Pokemon that was already hurt', () => {
    const start = createBattle(team([SPECIES.squirtle]), team([SPECIES.geodude]))
    const grazed: BattleState = {
      ...start,
      opponent: {
        ...start.opponent,
        members: start.opponent.members.map((m) => ({ ...m, currentHp: m.stats.hp - 1 })),
      },
    }
    const state = resolveTurn(
      grazed,
      attackWith(MOVES.surf),
      attackWith(MOVES.tackle),
      cleanHit(),
    )
    expect(activePokemon(state.opponent).currentHp).toBe(0)
    expect(kinds(state)).toContain('faint')
  })
})

describe('いかく', () => {
  it("drops the foe's attack as it comes out", () => {
    // ストライク has いかく and leads, so it speaks at the start of the battle.
    const state = createBattle(team([SPECIES.pikachu]), team([SPECIES.scyther]))
    expect(abilityEvents(state)).toContainEqual(
      expect.objectContaining({ ability: 'intimidate', outcome: 'announced' }),
    )
    expect(activePokemon(state.player).stages.attack).toBe(-1)
  })

  it('speaks again when it is switched in', () => {
    const start = createBattle(
      team([SPECIES.pikachu]),
      team([SPECIES.squirtle, SPECIES.scyther]),
    )
    expect(activePokemon(start.player).stages.attack).toBe(0)
    const state = resolveTurn(start, attackWith(MOVES.quickAttack), swap(1), cleanHit())
    expect(activePokemon(state.player).stages.attack).toBe(-1)
  })
})

describe('たべのこし', () => {
  it('gives a little back at the end of every turn', () => {
    const start = createBattle(team([SPECIES.pikachu]), team([SPECIES.squirtle]))
    const fed = withPlayer(
      start,
      start.player.members.map((m) => holding({ ...m, currentHp: 20 }, 'leftovers')),
    )
    const state = resolveTurn(
      fed,
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.growl),
      cleanHit(),
    )
    const pikachu = activePokemon(state.player)
    expect(pikachu.currentHp).toBe(20 + Math.floor(pikachu.stats.hp * LEFTOVERS_FRACTION))
    expect(itemEvents(state)).toContainEqual(
      expect.objectContaining({ item: 'leftovers', outcome: 'healed' }),
    )
  })

  it('stays quiet at full health', () => {
    const start = createBattle(team([SPECIES.pikachu]), team([SPECIES.squirtle]))
    const fed = withPlayer(
      start,
      start.player.members.map((m) => holding(m, 'leftovers')),
    )
    const state = resolveTurn(
      fed,
      attackWith(MOVES.thunderWave),
      attackWith(MOVES.growl),
      cleanHit(),
    )
    expect(itemEvents(state).filter((e) => e.item === 'leftovers')).toEqual([])
  })
})

describe('きあいのタスキ', () => {
  it('holds on at 1 HP and is spent doing it', () => {
    const start = createBattle(team([SPECIES.pikachu]), team([SPECIES.squirtle]))
    const braced = withPlayer(
      start,
      start.player.members.map((m) => holding(m, 'focusSash')),
    )
    // Squirtle's なみのり is not enough on its own, so hand it a huge hit instead.
    const glass = withPlayer(
      braced,
      braced.player.members.map((m) => ({
        ...m,
        stats: { ...m.stats, hp: 12, defense: 1, specialDefense: 1 },
        currentHp: 12,
      })),
    )
    const state = resolveTurn(
      glass,
      attackWith(MOVES.thunderWave),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    const pikachu = activePokemon(state.player)
    expect(pikachu.currentHp).toBe(1)
    expect(pikachu.item).toBeNull()
    expect(itemEvents(state)).toContainEqual(
      expect.objectContaining({ item: 'focusSash', outcome: 'endured' }),
    )
  })
})

describe('オボンのみ', () => {
  it('fires once health falls below half, and is eaten', () => {
    const start = createBattle(team([SPECIES.dewgong]), team([SPECIES.pikachu]))
    const carrying = withPlayer(
      start,
      start.player.members.map((m) => holding(m, 'sitrusBerry')),
    )
    const state = resolveTurn(
      carrying,
      attackWith(MOVES.growl),
      attackWith(MOVES.thunderbolt),
      cleanHit(),
    )
    const dewgong = activePokemon(state.player)
    if (dewgong.currentHp >= dewgong.stats.hp / 2) return
    expect(dewgong.item).toBeNull()
    expect(itemEvents(state)).toContainEqual(
      expect.objectContaining({ item: 'sitrusBerry', outcome: 'healed' }),
    )
  })
})

describe('a held item survives the run', () => {
  it('stays with the Pokemon across a switch', () => {
    const start = createBattle(
      team([SPECIES.pikachu, SPECIES.bulbasaur]),
      team([SPECIES.squirtle]),
    )
    const carrying = withPlayer(
      start,
      start.player.members.map((m) => holding(m, 'leftovers')),
    )
    const state = resolveTurn(carrying, swap(1), attackWith(MOVES.tackle), cleanHit())
    expect(state.player.members[0]?.item).toBe('leftovers')
    expect(activePokemon(state.player).item).toBe('leftovers')
  })

  it('stays through a forced switch', () => {
    const start = createBattle(
      team([SPECIES.pikachu, SPECIES.bulbasaur]),
      team([SPECIES.squirtle]),
    )
    const carrying = withPlayer(
      start,
      start.player.members.map((m, i) =>
        i === 0 ? holding({ ...m, currentHp: 1 }, 'leftovers') : holding(m, 'expertBelt'),
      ),
    )
    const owed = resolveTurn(
      carrying,
      attackWith(MOVES.dig),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    if (owed.awaitingSwitch !== 'player') return
    const after = forceSwitch(owed, 'player', 1)
    expect(activePokemon(after.player).item).toBe('expertBelt')
  })
})
