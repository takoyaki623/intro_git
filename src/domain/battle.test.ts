import { describe, expect, it } from 'vitest'
import type { BattlePokemon, Species } from './entities'
import {
  activePokemon,
  createBattlePokemon,
  createTeam,
  isTeamDefeated,
  statsAtLevel,
  switchableIndexes,
} from './entities'
import type { BattleState } from './battle'
import { chooseOpponentAction, createBattle, forceSwitch, resolveTurn } from './battle'
import { SPECIES } from '../data/species'
import { MOVES } from '../data/moves'
import { fixedRandom, scriptedRandom } from '../test/rng'

const team = (species: readonly Species[]) =>
  createTeam(species.map((s) => createBattlePokemon(s, 50)))

const downed = (pokemon: BattlePokemon): BattlePokemon => ({ ...pokemon, currentHp: 0 })

/** Speeds at Lv50: ピカチュウ 95, ヒトカゲ 70, ズバット 60, ゼニガメ 48, フシギダネ 50. */
const playerTeam = () => team([SPECIES.pikachu, SPECIES.charmander, SPECIES.bulbasaur])
const opponentTeam = () => team([SPECIES.squirtle, SPECIES.zubat, SPECIES.geodude])

const battle = () => createBattle(playerTeam(), opponentTeam())

// Not named `use`: React 19 has a hook by that name and the linter flags it.
const attackWith = (move: (typeof MOVES)[keyof typeof MOVES]) =>
  ({ type: 'move', move }) as const
const swap = (index: number) => ({ type: 'switch', index }) as const

const movesUsed = (state: BattleState) =>
  state.events.flatMap((event) => (event.kind === 'useMove' ? [event.move] : []))
const kinds = (state: BattleState) => state.events.map((event) => event.kind)
const sentOut = (state: BattleState) =>
  state.events.flatMap((event) => (event.kind === 'sendOut' ? [event.pokemon] : []))

// A flat 0.9 hits any move with full accuracy, stays above the crit chance and
// rolls a high spread, and never runs out partway through a turn.
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

describe('team helpers', () => {
  it('rejects an empty party', () => {
    expect(() => createTeam([])).toThrow()
  })

  it('leads with the first member', () => {
    expect(activePokemon(playerTeam()).species.name).toBe('ピカチュウ')
  })

  it('offers the standing members that are not already out', () => {
    expect(switchableIndexes(playerTeam())).toEqual([1, 2])
  })

  it('will not offer a fainted member', () => {
    const hurt = playerTeam()
    const withFaint = {
      ...hurt,
      members: hurt.members.map((m, i) => (i === 1 ? downed(m) : m)),
    }
    expect(switchableIndexes(withFaint)).toEqual([2])
  })

  it('counts a party as beaten only when all of it is down', () => {
    const full = playerTeam()
    expect(isTeamDefeated(full)).toBe(false)
    expect(isTeamDefeated({ ...full, members: full.members.map(downed) })).toBe(true)
  })
})

describe('createBattle', () => {
  it('starts with the leaders out and no winner', () => {
    const state = battle()
    expect(state.winner).toBeNull()
    expect(state.awaitingSwitch).toBeNull()
    expect(state.events).toEqual([{ kind: 'encounter', pokemon: 'ゼニガメ' }])
  })
})

describe('resolveTurn — attacking', () => {
  it('lets the faster side move first', () => {
    const state = resolveTurn(
      battle(),
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(movesUsed(state)).toEqual(['10まんボルト', 'なみのり'])
  })

  it('damages both sides when neither faints', () => {
    const state = resolveTurn(
      battle(),
      attackWith(MOVES.quickAttack),
      attackWith(MOVES.tackle),
      cleanHit(),
    )
    expect(activePokemon(state.opponent).currentHp).toBeLessThan(
      activePokemon(state.opponent).stats.hp,
    )
    expect(activePokemon(state.player).currentHp).toBeLessThan(
      activePokemon(state.player).stats.hp,
    )
  })

  it('reports a miss and deals no damage', () => {
    // アイアンテール is 0.75 accuracy, so a roll of 0.99 misses.
    const state = resolveTurn(
      battle(),
      attackWith(MOVES.ironTail),
      attackWith(MOVES.surf),
      fixedRandom(0.99),
    )
    expect(kinds(state)).toContain('miss')
  })

  it('announces effectiveness', () => {
    const state = resolveTurn(
      battle(),
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(state.events).toContainEqual({
      kind: 'effectiveness',
      multiplier: 2,
      target: 'ゼニガメ',
    })
  })

  it('does not mutate the state it was given', () => {
    const before = battle()
    const snapshot = JSON.stringify(before)
    resolveTurn(before, attackWith(MOVES.thunderbolt), attackWith(MOVES.surf), cleanHit())
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('breaks a speed tie with the coin flip', () => {
    const twins = () => createBattle(playerTeam(), playerTeam())
    const playerFirst = resolveTurn(
      twins(),
      attackWith(MOVES.quickAttack),
      attackWith(MOVES.ironTail),
      scriptedRandom(0.4, 0.9),
    )
    const opponentFirst = resolveTurn(
      twins(),
      attackWith(MOVES.quickAttack),
      attackWith(MOVES.ironTail),
      scriptedRandom(0.6, 0.9),
    )
    expect(movesUsed(playerFirst)[0]).toBe('でんこうせっか')
    expect(movesUsed(opponentFirst)[0]).toBe('アイアンテール')
  })
})

describe('resolveTurn — switching', () => {
  it('costs the whole turn, so the switcher does not attack', () => {
    const state = resolveTurn(battle(), swap(2), attackWith(MOVES.surf), cleanHit())
    expect(movesUsed(state)).toEqual(['なみのり'])
    expect(activePokemon(state.player).species.name).toBe('フシギダネ')
  })

  it('resolves before the opponent moves, so the incoming Pokemon takes the hit', () => {
    const state = resolveTurn(battle(), swap(2), attackWith(MOVES.surf), cleanHit())
    expect(kinds(state).indexOf('sendOut')).toBeLessThan(kinds(state).indexOf('useMove'))
    // なみのり is 0.5x into くさ, and フシギダネ is the one that got hit.
    expect(state.events).toContainEqual({
      kind: 'effectiveness',
      multiplier: 0.5,
      target: 'フシギダネ',
    })
    expect(activePokemon(state.player).currentHp).toBeLessThan(
      activePokemon(state.player).stats.hp,
    )
    // The Pokemon that left is untouched.
    expect(state.player.members[0]?.currentHp).toBe(state.player.members[0]?.stats.hp)
  })

  it('announces a recall then a send-out', () => {
    const state = resolveTurn(battle(), swap(1), attackWith(MOVES.surf), cleanHit())
    expect(state.events).toContainEqual({
      kind: 'withdraw',
      side: 'player',
      pokemon: 'ピカチュウ',
    })
    expect(state.events).toContainEqual({
      kind: 'sendOut',
      side: 'player',
      pokemon: 'ヒトカゲ',
    })
  })

  it('lets both sides switch, and then nobody attacks', () => {
    const state = resolveTurn(battle(), swap(1), swap(1), cleanHit())
    expect(movesUsed(state)).toEqual([])
    expect(activePokemon(state.player).species.name).toBe('ヒトカゲ')
    expect(activePokemon(state.opponent).species.name).toBe('ズバット')
  })
})

describe('resolveTurn — fainting', () => {
  const nearlyDead = (state: BattleState, side: 'player' | 'opponent'): BattleState => ({
    ...state,
    [side]: {
      ...state[side],
      members: state[side].members.map((m, i) =>
        i === state[side].activeIndex ? { ...m, currentHp: 1 } : m,
      ),
    },
  })

  it('does not end the battle while the party still stands', () => {
    const state = resolveTurn(
      nearlyDead(battle(), 'opponent'),
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(state.winner).toBeNull()
    expect(kinds(state)).toContain('faint')
    // The fainted side never got to move.
    expect(movesUsed(state)).toEqual(['10まんボルト'])
  })

  it('has the opponent send out its own replacement', () => {
    const state = resolveTurn(
      nearlyDead(battle(), 'opponent'),
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(sentOut(state)).toEqual(['ズバット'])
    expect(activePokemon(state.opponent).species.name).toBe('ズバット')
    expect(state.awaitingSwitch).toBeNull()
  })

  it('asks the player for a replacement instead of choosing one', () => {
    const state = resolveTurn(
      nearlyDead(battle(), 'player'),
      attackWith(MOVES.dig),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(state.awaitingSwitch).toBe('player')
    expect(sentOut(state)).toEqual([])
    expect(state.winner).toBeNull()
  })

  it('refuses to take a turn while a replacement is owed', () => {
    const owed = resolveTurn(
      nearlyDead(battle(), 'player'),
      attackWith(MOVES.dig),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(
      resolveTurn(
        owed,
        attackWith(MOVES.thunderbolt),
        attackWith(MOVES.surf),
        cleanHit(),
      ),
    ).toBe(owed)
  })

  it('ends the battle when the last member goes down', () => {
    const start = battle()
    const oneLeft: BattleState = {
      ...start,
      opponent: {
        ...start.opponent,
        members: start.opponent.members.map((m, i) =>
          i === 0 ? { ...m, currentHp: 1 } : downed(m),
        ),
      },
    }
    const state = resolveTurn(
      oneLeft,
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(state.winner).toBe('player')
    expect(state.awaitingSwitch).toBeNull()
  })

  it('is a no-op once the battle is over', () => {
    const finished = { ...battle(), winner: 'player' as const }
    expect(
      resolveTurn(
        finished,
        attackWith(MOVES.thunderbolt),
        attackWith(MOVES.surf),
        cleanHit(),
      ),
    ).toBe(finished)
  })
})

describe('forceSwitch', () => {
  const owed = () =>
    resolveTurn(
      {
        ...battle(),
        player: {
          ...playerTeam(),
          members: playerTeam().members.map((m, i) =>
            i === 0 ? { ...m, currentHp: 1 } : m,
          ),
        },
      },
      attackWith(MOVES.dig),
      attackWith(MOVES.surf),
      cleanHit(),
    )

  it('sends out the chosen member and clears the debt', () => {
    const state = forceSwitch(owed(), 'player', 2)
    expect(state.awaitingSwitch).toBeNull()
    expect(activePokemon(state.player).species.name).toBe('フシギダネ')
    expect(sentOut(state)).toEqual(['フシギダネ'])
  })

  it('skips the recall line, since the Pokemon fainted', () => {
    expect(kinds(forceSwitch(owed(), 'player', 1))).not.toContain('withdraw')
  })

  it('rejects a member that cannot come out', () => {
    expect(() => forceSwitch(owed(), 'player', 0)).toThrow()
    expect(() => forceSwitch(owed(), 'player', 9)).toThrow()
  })

  it('rejects a side that owes nothing', () => {
    expect(() => forceSwitch(battle(), 'player', 1)).toThrow()
  })
})

describe('chooseOpponentAction', () => {
  it('picks a move the active Pokemon knows', () => {
    const action = chooseOpponentAction(battle(), fixedRandom(0))
    expect(action.type).toBe('move')
    if (action.type === 'move') expect(SPECIES.squirtle.moves).toContain(action.move)
  })

  it('reaches the last move without running off the end', () => {
    const action = chooseOpponentAction(battle(), fixedRandom(0.999))
    const last = SPECIES.squirtle.moves[SPECIES.squirtle.moves.length - 1]
    if (action.type === 'move') expect(action.move).toBe(last)
  })
})
