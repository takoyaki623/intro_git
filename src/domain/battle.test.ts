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
import { createBattle, forceSwitch, resolveTurn } from './battle'
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
    expect(state.events).toEqual([
      { kind: 'encounter', pokemon: 'ゼニガメ', final: false },
    ])
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
describe('resolveTurn — status conditions', () => {
  const afflict = (
    state: BattleState,
    side: 'player' | 'opponent',
    status: NonNullable<BattlePokemon['status']>,
  ): BattleState => ({
    ...state,
    [side]: {
      ...state[side],
      members: state[side].members.map((m, i) =>
        i === state[side].activeIndex ? { ...m, status } : m,
      ),
    },
  })

  const statuses = (state: BattleState) =>
    state.events.flatMap((event) =>
      event.kind === 'statusInflicted' ? [event.status] : [],
    )

  it('lands a status move on the target', () => {
    // でんじは is 0.9 accuracy and always paralyses; 0.5 hits and lands it.
    const state = resolveTurn(
      battle(),
      attackWith(MOVES.thunderWave),
      attackWith(MOVES.surf),
      fixedRandom(0.5),
    )
    expect(statuses(state)).toEqual(['paralysis'])
    expect(activePokemon(state.opponent).status).toEqual({ kind: 'paralysis' })
  })

  it('deals no damage with a status move', () => {
    const state = resolveTurn(
      battle(),
      attackWith(MOVES.thunderWave),
      attackWith(MOVES.surf),
      fixedRandom(0.5),
    )
    // ゼニガメ took なみのり's turn but nothing from でんじは itself.
    expect(kinds(state).filter((k) => k === 'damage')).toHaveLength(1)
  })

  it('will not paralyse an electric type', () => {
    const mirror = createBattle(playerTeam(), playerTeam())
    const state = resolveTurn(
      mirror,
      attackWith(MOVES.thunderWave),
      attackWith(MOVES.quickAttack),
      fixedRandom(0.5),
    )
    expect(statuses(state)).toEqual([])
    expect(activePokemon(state.opponent).status).toBeNull()
  })

  it('rolls a secondary effect only when the chance comes up', () => {
    // 10まんボルト paralyses 10% of the time; 0.9 is well clear of that.
    const missed = resolveTurn(
      battle(),
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(statuses(missed)).toEqual([])
  })

  it('poisons at the end of the turn for an eighth of maximum HP', () => {
    const poisoned = afflict(battle(), 'opponent', { kind: 'poison' })
    const before = activePokemon(poisoned.opponent).currentHp
    const state = resolveTurn(
      poisoned,
      attackWith(MOVES.dig),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    const tick = state.events.find((event) => event.kind === 'statusDamage')
    expect(tick).toMatchObject({ status: 'poison', amount: Math.floor(104 / 8) })
    expect(activePokemon(state.opponent).currentHp).toBeLessThan(before)
  })

  it('bites after both sides have acted, not before', () => {
    const poisoned = afflict(battle(), 'opponent', { kind: 'poison' })
    const state = resolveTurn(
      poisoned,
      attackWith(MOVES.dig),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    const order = kinds(state)
    expect(order.lastIndexOf('useMove')).toBeLessThan(order.indexOf('statusDamage'))
  })

  it('keeps a paralysed Pokemon from moving on an unlucky roll', () => {
    const stunned = afflict(battle(), 'player', { kind: 'paralysis' })
    const state = resolveTurn(
      stunned,
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.surf),
      fixedRandom(0),
    )
    expect(state.events).toContainEqual({
      kind: 'immobilised',
      side: 'player',
      pokemon: 'ピカチュウ',
      status: 'paralysis',
    })
    expect(movesUsed(state)).not.toContain('10まんボルト')
  })

  it('halves speed when paralysed, handing the opponent the first move', () => {
    // ピカチュウ 95 vs ゼニガメ 48: paralysis drops it to 47.
    const stunned = afflict(battle(), 'player', { kind: 'paralysis' })
    const state = resolveTurn(
      stunned,
      attackWith(MOVES.quickAttack),
      attackWith(MOVES.surf),
      fixedRandom(0.9),
    )
    expect(movesUsed(state)[0]).toBe('なみのり')
  })

  it('counts sleep down, then wakes and acts the same turn', () => {
    const asleep = afflict(battle(), 'player', { kind: 'sleep', turns: 2 })
    const first = resolveTurn(
      asleep,
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(kinds(first)).toContain('immobilised')
    expect(activePokemon(first.player).status).toEqual({ kind: 'sleep', turns: 1 })

    const second = resolveTurn(
      first,
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(second.events).toContainEqual({
      kind: 'statusEnded',
      side: 'player',
      pokemon: 'ピカチュウ',
      status: 'sleep',
    })
    expect(activePokemon(second.player).status).toBeNull()
    expect(movesUsed(second)).toContain('10まんボルト')
  })

  it('softens a physical hit from a burned attacker', () => {
    const healthy = resolveTurn(
      battle(),
      attackWith(MOVES.quickAttack),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    const burned = resolveTurn(
      afflict(battle(), 'player', { kind: 'burn' }),
      attackWith(MOVES.quickAttack),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    const dealt = (state: BattleState) =>
      state.events.find((event) => event.kind === 'damage' && event.side === 'opponent')
    expect(dealt(burned)).toMatchObject({ kind: 'damage' })
    const healthyHit = dealt(healthy)
    const burnedHit = dealt(burned)
    if (healthyHit?.kind !== 'damage' || burnedHit?.kind !== 'damage') {
      throw new Error('expected damage events')
    }
    expect(burnedHit.amount).toBeLessThan(healthyHit.amount)
  })

  it('does not soften a special hit from a burned attacker', () => {
    const dealt = (state: BattleState) => {
      const event = state.events.find((e) => e.kind === 'damage' && e.side === 'opponent')
      if (event?.kind !== 'damage') throw new Error('expected damage')
      return event.amount
    }
    const healthy = resolveTurn(
      battle(),
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    const burned = resolveTurn(
      afflict(battle(), 'player', { kind: 'burn' }),
      attackWith(MOVES.thunderbolt),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(dealt(burned)).toBe(dealt(healthy))
  })

  it('carries a condition across a switch', () => {
    const poisoned = afflict(battle(), 'player', { kind: 'poison' })
    const state = resolveTurn(poisoned, swap(1), attackWith(MOVES.surf), cleanHit())
    expect(state.player.members[0]?.status).toEqual({ kind: 'poison' })
    expect(activePokemon(state.player).status).toBeNull()
  })

  it('can lose the battle to end-of-turn damage', () => {
    const start = afflict(battle(), 'opponent', { kind: 'poison' })
    const doomed: BattleState = {
      ...start,
      opponent: {
        ...start.opponent,
        members: start.opponent.members.map((m, i) =>
          i === 0 ? { ...m, currentHp: 1 } : { ...m, currentHp: 0 },
        ),
      },
    }
    const state = resolveTurn(doomed, swap(1), attackWith(MOVES.surf), cleanHit())
    expect(state.winner).toBe('player')
  })
})

describe('resolveTurn — stat stages', () => {
  const stageEvents = (state: BattleState) =>
    state.events.flatMap((event) => (event.kind === 'statStage' ? [event] : []))

  it("raises the user's own stat", () => {
    // ヒトカゲ knows つるぎのまい, and leads so it gets a turn: switching it in
    // would hand ゼニガメ a free なみのり, which is 2x and knocks it straight out.
    const state = resolveTurn(
      createBattle(team([SPECIES.charmander]), opponentTeam()),
      attackWith(MOVES.swordsDance),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(stageEvents(state)[0]).toMatchObject({
      side: 'player',
      stat: 'attack',
      applied: 2,
    })
    expect(activePokemon(state.player).stages.attack).toBe(2)
  })

  it('lowers the target when the move aims at them', () => {
    const eevee = team([SPECIES.eevee])
    const state = resolveTurn(
      createBattle(eevee, opponentTeam()),
      attackWith(MOVES.leer),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(stageEvents(state)[0]).toMatchObject({
      side: 'opponent',
      stat: 'defense',
      applied: -1,
    })
  })

  it('makes the attack land harder once it is raised', () => {
    const plain = resolveTurn(
      battle(),
      attackWith(MOVES.quickAttack),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    const boosted = resolveTurn(
      {
        ...battle(),
        player: {
          ...playerTeam(),
          members: playerTeam().members.map((m, i) =>
            i === 0 ? { ...m, stages: { ...m.stages, attack: 2 } } : m,
          ),
        },
      },
      attackWith(MOVES.quickAttack),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    const dealt = (state: BattleState) => {
      const event = state.events.find((e) => e.kind === 'damage' && e.side === 'opponent')
      if (event?.kind !== 'damage') throw new Error('expected damage')
      return event.amount
    }
    expect(dealt(boosted)).toBeGreaterThan(dealt(plain))
  })

  it('says so when a stat will not move any further', () => {
    const maxed = {
      ...createBattle(team([SPECIES.charmander]), opponentTeam()),
    }
    const atCeiling = {
      ...maxed,
      player: {
        ...maxed.player,
        members: maxed.player.members.map((m) => ({
          ...m,
          stages: { ...m.stages, attack: 6 },
        })),
      },
    }
    const state = resolveTurn(
      atCeiling,
      attackWith(MOVES.swordsDance),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(stageEvents(state)[0]?.applied).toBe(0)
  })

  it('lets a lowered speed change who moves first', () => {
    // ピカチュウ 95 against ゼニガメ 48: -2 speed drops it to 47.
    const slowed = {
      ...battle(),
      player: {
        ...playerTeam(),
        members: playerTeam().members.map((m, i) =>
          i === 0 ? { ...m, stages: { ...m.stages, speed: -2 } } : m,
        ),
      },
    }
    const state = resolveTurn(
      slowed,
      attackWith(MOVES.quickAttack),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    expect(movesUsed(state)[0]).toBe('なみのり')
  })

  it('clears the stages of a Pokemon that leaves the field', () => {
    const boosted = {
      ...battle(),
      player: {
        ...playerTeam(),
        members: playerTeam().members.map((m, i) =>
          i === 0 ? { ...m, stages: { ...m.stages, attack: 4 } } : m,
        ),
      },
    }
    const state = resolveTurn(boosted, swap(1), attackWith(MOVES.surf), cleanHit())
    expect(state.player.members[0]?.stages.attack).toBe(0)
    expect(activePokemon(state.player).stages.attack).toBe(0)
  })

  it('clears them on a forced switch too', () => {
    const start = battle()
    const boostedAndDying = {
      ...start,
      player: {
        ...start.player,
        members: start.player.members.map((m, i) =>
          i === 0 ? { ...m, currentHp: 1, stages: { ...m.stages, attack: 3 } } : m,
        ),
      },
    }
    const owed = resolveTurn(
      boostedAndDying,
      attackWith(MOVES.dig),
      attackWith(MOVES.surf),
      cleanHit(),
    )
    const after = forceSwitch(owed, 'player', 1)
    expect(after.player.members[0]?.stages.attack).toBe(0)
  })
})

describe('the last battle announces itself', () => {
  it('opens with a different line when it is the final one', () => {
    const state = createBattle(playerTeam(), opponentTeam(), true)
    expect(state.events[0]).toEqual({
      kind: 'encounter',
      pokemon: 'ゼニガメ',
      final: true,
    })
  })

  it('changes nothing else about the battle', () => {
    const ordinary = createBattle(playerTeam(), opponentTeam())
    const last = createBattle(playerTeam(), opponentTeam(), true)
    expect({ ...last, events: [] }).toEqual({ ...ordinary, events: [] })
  })
})
