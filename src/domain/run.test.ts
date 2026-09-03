import { describe, expect, it } from 'vitest'
import {
  RUN_CONFIG,
  advance,
  canAdvance,
  opponentLevel,
  restBetweenBattles,
  startRun,
  withBattle,
} from './run'
import { activePokemon, createBattlePokemon, isFainted } from './entities'
import { SPECIES } from '../data/species'
import { fixedRandom, scriptedRandom } from '../test/rng'

const pikachu = createBattlePokemon(SPECIES.pikachu, 50)

describe('startRun', () => {
  it('opens with a full party and nothing won yet', () => {
    const run = startRun(fixedRandom(0))
    expect(run.wins).toBe(0)
    expect(run.finished).toBe(false)
    expect(run.battle.player.members).toHaveLength(RUN_CONFIG.partySize)
    expect(run.battle.opponent.members).toHaveLength(RUN_CONFIG.partySize)
    expect(run.battle.player.members.every((m) => m.currentHp === m.stats.hp)).toBe(true)
  })

  it('fields distinct opponents', () => {
    const ids = startRun(scriptedRandom(0.1, 0.6, 0.3)).battle.opponent.members.map(
      (m) => m.species.id,
    )
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('opponentLevel', () => {
  it('starts below the player, so the opening battles are winnable', () => {
    expect(RUN_CONFIG.opponentStartingLevel).toBeLessThan(RUN_CONFIG.playerLevel)
  })

  it('overtakes the player after enough wins', () => {
    const catchUp = Math.ceil(
      (RUN_CONFIG.playerLevel - RUN_CONFIG.opponentStartingLevel) /
        RUN_CONFIG.levelStepPerWin,
    )
    expect(opponentLevel(catchUp)).toBeGreaterThanOrEqual(RUN_CONFIG.playerLevel)
  })

  it('climbs with every win', () => {
    expect(opponentLevel(0)).toBe(RUN_CONFIG.opponentStartingLevel)
    expect(opponentLevel(3)).toBe(
      RUN_CONFIG.opponentStartingLevel + 3 * RUN_CONFIG.levelStepPerWin,
    )
  })
})

describe('restBetweenBattles', () => {
  it('gives back a slice of maximum HP', () => {
    const hurt = { ...pikachu, currentHp: 10 }
    const [rested] = restBetweenBattles([hurt])
    expect(rested?.currentHp).toBe(10 + Math.floor(95 * RUN_CONFIG.healingBetweenBattles))
  })

  it('never heals past full', () => {
    const nearlyFull = { ...pikachu, currentHp: 94 }
    expect(restBetweenBattles([nearlyFull])[0]?.currentHp).toBe(95)
  })

  it('cures conditions', () => {
    const poisoned = { ...pikachu, currentHp: 40, status: { kind: 'poison' } as const }
    expect(restBetweenBattles([poisoned])[0]?.status).toBeNull()
  })

  it('leaves a fainted Pokemon down for the rest of the run', () => {
    const down = { ...pikachu, currentHp: 0, status: { kind: 'burn' } as const }
    const [after] = restBetweenBattles([down])
    expect(after?.currentHp).toBe(0)
    expect(after?.status).toEqual({ kind: 'burn' })
  })
})

describe('withBattle', () => {
  it('ends the run when the player is wiped', () => {
    const run = startRun(fixedRandom(0))
    const lost = withBattle(run, { ...run.battle, winner: 'opponent' })
    expect(lost.finished).toBe(true)
    expect(lost.wins).toBe(0)
  })

  it('does not end the run on a win', () => {
    const run = startRun(fixedRandom(0))
    expect(withBattle(run, { ...run.battle, winner: 'player' }).finished).toBe(false)
  })
})

describe('advance', () => {
  const won = (random = fixedRandom(0.3)) => {
    const run = startRun(random)
    return withBattle(run, { ...run.battle, winner: 'player' })
  }

  it('only moves on after a win', () => {
    const fresh = startRun(fixedRandom(0.3))
    expect(canAdvance(fresh)).toBe(false)
    expect(advance(fresh)).toBe(fresh)
    expect(canAdvance(won())).toBe(true)
  })

  it('counts the win and raises the opposing level', () => {
    const next = advance(won(), fixedRandom(0.3))
    expect(next.wins).toBe(1)
    expect(activePokemon(next.battle.opponent).level).toBe(opponentLevel(1))
    expect(next.battle.winner).toBeNull()
  })

  it('carries the party over, rested but not restored', () => {
    const run = startRun(fixedRandom(0.3))
    const battered = {
      ...run.battle,
      player: {
        ...run.battle.player,
        members: run.battle.player.members.map((m) => ({ ...m, currentHp: 10 })),
      },
      winner: 'player' as const,
    }
    const next = advance(withBattle(run, battered), fixedRandom(0.3))
    for (const member of next.battle.player.members) {
      expect(member.currentHp).toBeGreaterThan(10)
      expect(member.currentHp).toBeLessThan(member.stats.hp)
    }
  })

  it('leads with a Pokemon that can actually fight', () => {
    const run = startRun(fixedRandom(0.3))
    const firstDown = {
      ...run.battle,
      player: {
        ...run.battle.player,
        members: run.battle.player.members.map((m, i) =>
          i === 0 ? { ...m, currentHp: 0 } : m,
        ),
      },
      winner: 'player' as const,
    }
    const next = advance(withBattle(run, firstDown), fixedRandom(0.3))
    expect(isFainted(activePokemon(next.battle.player))).toBe(false)
    expect(next.battle.player.activeIndex).toBe(1)
  })

  it('keeps the fainted member on the bench', () => {
    const run = startRun(fixedRandom(0.3))
    const oneDown = {
      ...run.battle,
      player: {
        ...run.battle.player,
        members: run.battle.player.members.map((m, i) =>
          i === 0 ? { ...m, currentHp: 0 } : m,
        ),
      },
      winner: 'player' as const,
    }
    const next = advance(withBattle(run, oneDown), fixedRandom(0.3))
    expect(next.battle.player.members[0]?.currentHp).toBe(0)
  })
})
