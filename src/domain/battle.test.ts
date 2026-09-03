import { describe, expect, it } from 'vitest'
import { chooseOpponentMove, createBattle, resolveTurn } from './battle'
import { createBattlePokemon, statsAtLevel } from './entities'
import { SPECIES } from '../data/species'
import { MOVES } from '../data/moves'
import { fixedRandom, scriptedRandom } from '../test/rng'

const pikachu = createBattlePokemon(SPECIES.pikachu, 50) // speed 95
const squirtle = createBattlePokemon(SPECIES.squirtle, 50) // speed 48

// A flat 0.9 hits any move with full accuracy, stays above the crit chance and
// rolls a high spread -- and unlike a scripted sequence it does not run out
// partway through a turn, which would silently make the second attacker miss.
const cleanHit = () => fixedRandom(0.9)

describe('statsAtLevel', () => {
  it('gives HP its own formula', () => {
    const stats = statsAtLevel(SPECIES.pikachu.baseStats, 50)
    expect(stats.hp).toBe(Math.floor((2 * 35 * 50) / 100) + 50 + 10)
    expect(stats.speed).toBe(Math.floor((2 * 90 * 50) / 100) + 5)
  })

  it('scales with level', () => {
    const low = statsAtLevel(SPECIES.pikachu.baseStats, 5)
    const high = statsAtLevel(SPECIES.pikachu.baseStats, 100)
    expect(high.hp).toBeGreaterThan(low.hp)
    expect(high.attack).toBeGreaterThan(low.attack)
  })
})

describe('createBattle', () => {
  it('starts at full health with no winner', () => {
    const state = createBattle(pikachu, squirtle)
    expect(state.winner).toBeNull()
    expect(state.player.currentHp).toBe(state.player.stats.hp)
    expect(state.log).toContain('A wild Squirtle appeared!')
  })
})

describe('resolveTurn', () => {
  it('lets the faster side move first', () => {
    const state = resolveTurn(
      createBattle(pikachu, squirtle),
      MOVES.thunderbolt,
      MOVES.surf,
      cleanHit(),
    )
    const used = state.log.filter((line) => line.includes('used'))
    expect(used[0]).toBe('Pikachu used Thunderbolt!')
    expect(used[1]).toBe('Squirtle used Surf!')
  })

  it('damages both sides when neither faints', () => {
    const state = resolveTurn(
      createBattle(pikachu, squirtle),
      MOVES.quickAttack,
      MOVES.tackle,
      cleanHit(),
    )
    expect(state.opponent.currentHp).toBeLessThan(state.opponent.stats.hp)
    expect(state.player.currentHp).toBeLessThan(state.player.stats.hp)
  })

  it('stops the turn when the first attack knocks the target out', () => {
    const nearlyDead = { ...squirtle, currentHp: 1 }
    const state = resolveTurn(
      createBattle(pikachu, nearlyDead),
      MOVES.thunderbolt,
      MOVES.surf,
      cleanHit(),
    )
    expect(state.winner).toBe('player')
    expect(state.opponent.currentHp).toBe(0)
    expect(state.log).toContain('Squirtle fainted!')
    // The opponent fainted before it could act.
    expect(state.log).not.toContain('Squirtle used Surf!')
    expect(state.player.currentHp).toBe(state.player.stats.hp)
  })

  it('reports a miss and deals no damage', () => {
    // accuracy 0.75 for Iron Tail, so a roll of 0.99 misses.
    const state = resolveTurn(
      createBattle(pikachu, squirtle),
      MOVES.ironTail,
      MOVES.surf,
      fixedRandom(0.99),
    )
    expect(state.log).toContain("Pikachu's attack missed!")
  })

  it('announces effectiveness', () => {
    const state = resolveTurn(
      createBattle(pikachu, squirtle),
      MOVES.thunderbolt,
      MOVES.surf,
      cleanHit(),
    )
    expect(state.log).toContain("It's super effective!")
  })

  it('is a no-op once the battle is over', () => {
    const finished = { ...createBattle(pikachu, squirtle), winner: 'player' as const }
    expect(resolveTurn(finished, MOVES.thunderbolt, MOVES.surf, cleanHit())).toBe(
      finished,
    )
  })

  it('does not mutate the state it was given', () => {
    const before = createBattle(pikachu, squirtle)
    const snapshot = JSON.stringify(before)
    resolveTurn(before, MOVES.thunderbolt, MOVES.surf, cleanHit())
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('breaks a speed tie with the coin flip', () => {
    const twin = createBattlePokemon(SPECIES.pikachu, 50)
    const playerFirst = resolveTurn(
      createBattle(twin, twin),
      MOVES.quickAttack,
      MOVES.ironTail,
      scriptedRandom(0.4, 0.9),
    )
    const opponentFirst = resolveTurn(
      createBattle(twin, twin),
      MOVES.quickAttack,
      MOVES.ironTail,
      scriptedRandom(0.6, 0.9),
    )
    expect(playerFirst.log.filter((l) => l.includes('used'))[0]).toContain('Quick Attack')
    expect(opponentFirst.log.filter((l) => l.includes('used'))[0]).toContain('Iron Tail')
  })
})

describe('chooseOpponentMove', () => {
  it('picks from the species move list', () => {
    expect(SPECIES.squirtle.moves).toContain(chooseOpponentMove(squirtle, fixedRandom(0)))
  })

  it('reaches the last move without running off the end', () => {
    const last = SPECIES.squirtle.moves[SPECIES.squirtle.moves.length - 1]
    expect(chooseOpponentMove(squirtle, fixedRandom(0.999))).toBe(last)
  })
})
