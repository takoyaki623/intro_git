import { describe, expect, it } from 'vitest'
import type { Move, Species } from './entities'
import { createBattlePokemon, createTeam } from './entities'
import { createBattle } from './battle'
import { AI_CONFIG, chooseOpponentAction, scoreMove } from './ai'
import { SPECIES } from '../data/species'
import { MOVES } from '../data/moves'
import { fixedRandom } from '../test/rng'

const team = (species: readonly Species[]) =>
  createTeam(species.map((s) => createBattlePokemon(s, 50)))

const fight = (player: readonly Species[], opponent: readonly Species[]) =>
  createBattle(team(player), team(opponent))

/** A stand-in species with a chosen typing and a single move. */
const dummy = (id: string, types: Species['types'], moves: readonly Move[]): Species => ({
  ...SPECIES.eevee,
  id,
  name: id,
  types,
  moves,
})

// Below the skill threshold, so the AI plays its best rather than at random.
const thinking = fixedRandom(0.1)
// At or above it, so the AI plays at random.
const distracted = fixedRandom(0.99)

const moveOf = (action: ReturnType<typeof chooseOpponentAction>) => {
  if (action.type !== 'move') throw new Error(`expected a move, got a ${action.type}`)
  return action.move
}

describe('scoreMove', () => {
  const pikachu = createBattlePokemon(SPECIES.pikachu, 50)
  const geodude = createBattlePokemon(SPECIES.geodude, 50)
  const squirtle = createBattlePokemon(SPECIES.squirtle, 50)

  it('is zero against an immunity', () => {
    expect(scoreMove(pikachu, geodude, MOVES.thunderbolt)).toBe(0)
  })

  it('rates a super-effective move above a resisted one', () => {
    expect(scoreMove(pikachu, squirtle, MOVES.thunderbolt)).toBeGreaterThan(
      scoreMove(pikachu, geodude, MOVES.quickAttack),
    )
  })

  it('discounts a move by its accuracy', () => {
    const reliable = { ...MOVES.ironTail, accuracy: 1 }
    expect(scoreMove(pikachu, squirtle, MOVES.ironTail)).toBeLessThan(
      scoreMove(pikachu, squirtle, reliable),
    )
  })

  it('rewards a finishing blow', () => {
    const nearlyDead = { ...squirtle, currentHp: 1 }
    expect(scoreMove(pikachu, nearlyDead, MOVES.quickAttack)).toBeGreaterThan(
      scoreMove(pikachu, squirtle, MOVES.quickAttack),
    )
  })

  it('values a status move only while the target is clean', () => {
    expect(scoreMove(pikachu, squirtle, MOVES.thunderWave)).toBeGreaterThan(0)
    const afflicted = { ...squirtle, status: { kind: 'burn' } as const }
    expect(scoreMove(pikachu, afflicted, MOVES.thunderWave)).toBe(0)
  })

  it('will not try a status move on a type that shrugs it off', () => {
    // でんじは cannot paralyse an electric type.
    expect(scoreMove(pikachu, pikachu, MOVES.thunderWave)).toBe(0)
  })
})

describe('chooseOpponentAction', () => {
  it('avoids a move the target is immune to', () => {
    // ピカチュウ against イシツブテ: でんき does nothing to じめん, so it must
    // reach for あなをほる instead.
    const state = fight([SPECIES.geodude], [SPECIES.pikachu])
    expect(moveOf(chooseOpponentAction(state, thinking))).toBe(MOVES.dig)
  })

  it('takes the super-effective option', () => {
    // ゼニガメ against フシギダネ: なみのり is resisted, れいとうビーム is not.
    const state = fight([SPECIES.bulbasaur], [SPECIES.squirtle])
    expect(moveOf(chooseOpponentAction(state, thinking))).toBe(MOVES.iceBeam)
  })

  it('goes for the knockout when one is available', () => {
    const state = fight([SPECIES.bulbasaur], [SPECIES.squirtle])
    const nearlyDead = {
      ...state,
      player: {
        ...state.player,
        members: state.player.members.map((m) => ({ ...m, currentHp: 1 })),
      },
    }
    // Any move finishes it, so the cheapest reliable one is fine -- what
    // matters is that it attacks rather than switching.
    expect(chooseOpponentAction(nearlyDead, thinking).type).toBe('move')
  })

  it('switches when a benched Pokemon does far better', () => {
    const feeble = dummy('feeble', ['normal'], [{ ...MOVES.tackle, power: 10 }])
    const strong = dummy('strong', ['water'], [MOVES.surf])
    // The player fields a fire type, so surf is 2x while tackle is neutral.
    const state = fight([SPECIES.charmander], [feeble, strong])

    const action = chooseOpponentAction(state, thinking)
    expect(action).toEqual({ type: 'switch', index: 1 })
  })

  it('stays in when the bench is no better', () => {
    const good = dummy('good', ['water'], [MOVES.surf])
    const spare = dummy('spare', ['normal'], [{ ...MOVES.tackle, power: 10 }])
    const state = fight([SPECIES.charmander], [good, spare])
    expect(chooseOpponentAction(state, thinking).type).toBe('move')
  })

  it('will not switch to a Pokemon that has fainted', () => {
    const feeble = dummy('feeble', ['normal'], [{ ...MOVES.tackle, power: 10 }])
    const strong = dummy('strong', ['water'], [MOVES.surf])
    const state = fight([SPECIES.charmander], [feeble, strong])
    const benchDown = {
      ...state,
      opponent: {
        ...state.opponent,
        members: state.opponent.members.map((m, i) =>
          i === 1 ? { ...m, currentHp: 0 } : m,
        ),
      },
    }
    expect(chooseOpponentAction(benchDown, thinking).type).toBe('move')
  })

  it('sometimes plays at random, and never switches then', () => {
    const feeble = dummy('feeble', ['normal'], [{ ...MOVES.tackle, power: 10 }])
    const strong = dummy('strong', ['water'], [MOVES.surf])
    const state = fight([SPECIES.charmander], [feeble, strong])

    const action = chooseOpponentAction(state, distracted)
    expect(action.type).toBe('move')
    expect(moveOf(action).power).toBe(10)
  })

  it('picks a move the active Pokemon knows, whichever path it takes', () => {
    const state = fight([SPECIES.bulbasaur], [SPECIES.squirtle])
    for (const random of [thinking, distracted, fixedRandom(0.5)]) {
      const action = chooseOpponentAction(state, random)
      if (action.type === 'move') {
        expect(SPECIES.squirtle.moves).toContain(action.move)
      }
    }
  })

  it('still acts when every move is useless', () => {
    // Nothing scores above zero, but it has to do something.
    const helpless = dummy('helpless', ['normal'], [MOVES.thunderbolt])
    const state = fight([SPECIES.geodude], [helpless])
    expect(chooseOpponentAction(state, thinking).type).toBe('move')
  })
})

describe('AI_CONFIG', () => {
  it('leaves room for the occasional random move', () => {
    expect(AI_CONFIG.skill).toBeGreaterThan(0)
    expect(AI_CONFIG.skill).toBeLessThan(1)
  })
})
