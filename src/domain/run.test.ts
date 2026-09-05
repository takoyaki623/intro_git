import { describe, expect, it } from 'vitest'
import {
  RUN_CONFIG,
  advance,
  readyToTravel,
  takeReward,
  canAdvance,
  isFinalBattle,
  opponentLevel,
  restBetweenBattles,
  startRun,
  withBattle,
  withOffer,
} from './run'
import type { RunState } from './run'
import { activePokemon, createBattlePokemon, isFainted } from './entities'
import { BOSS_LIST, SPECIES } from '../data/species'
import type { RewardKind, RewardOffer, RewardTarget } from './rewards'
import { fixedRandom, scriptedRandom } from '../test/rng'

const pikachu = createBattlePokemon(SPECIES.pikachu, 50)

/**
 * Spend the reward and take the first road, which is what `advance` did in one
 * call before a win started offering a choice of opponent.
 */
const settle = (
  run: RunState,
  reward: RewardOffer | null = null,
  target: RewardTarget | null = null,
  random = fixedRandom(0.3),
): RunState => advance(takeReward(run, reward, target, random), 0, random)

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
    expect(settle(fresh)).toBe(fresh)
    expect(canAdvance(won())).toBe(true)
  })

  it('counts the win and raises the opposing level', () => {
    const next = settle(won(), null, null, fixedRandom(0.3))
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
    const next = settle(withBattle(run, battered), null, null, fixedRandom(0.3))
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
    const next = settle(withBattle(run, firstDown), null, null, fixedRandom(0.3))
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
    const next = settle(withBattle(run, oneDown), null, null, fixedRandom(0.3))
    expect(next.battle.player.members[0]?.currentHp).toBe(0)
  })
})

describe('rewards across a run', () => {
  const wounded = () => {
    const run = startRun(fixedRandom(0.3))
    return {
      ...run,
      battle: {
        ...run.battle,
        player: {
          ...run.battle.player,
          members: run.battle.player.members.map((m, i) =>
            i === 0 ? { ...m, currentHp: 0 } : { ...m, currentHp: 5 },
          ),
        },
        winner: 'player' as const,
      },
    }
  }

  it('draws an offer the first time the win is seen', () => {
    const run = startRun(fixedRandom(0.3))
    expect(run.offer).toBeNull()
    const won = withBattle(run, { ...run.battle, winner: 'player' }, fixedRandom(0.3))
    expect(won.offer?.length).toBeGreaterThan(0)
  })

  it('holds the offer steady rather than redrawing it', () => {
    const run = startRun(fixedRandom(0.3))
    const won = withBattle(run, { ...run.battle, winner: 'player' }, fixedRandom(0.3))
    const again = withBattle(won, won.battle, fixedRandom(0.9))
    expect(again.offer).toEqual(won.offer)
  })

  it('draws an offer for a run restored after a win but before the draw', () => {
    // What a save written the moment the battle was won looks like.
    const run = startRun(fixedRandom(0.3))
    const restored = { ...run, battle: { ...run.battle, winner: 'player' as const } }
    expect(restored.offer).toBeNull()
    expect(withOffer(restored, fixedRandom(0.3)).offer?.length).toBeGreaterThan(0)
  })

  it('leaves a run that is still being fought without an offer', () => {
    const run = startRun(fixedRandom(0.3))
    expect(withOffer(run, fixedRandom(0.3)).offer).toBeNull()
  })

  it('offers nothing while the battle is still going', () => {
    const run = startRun(fixedRandom(0.3))
    expect(withBattle(run, run.battle, fixedRandom(0.3)).offer).toBeNull()
  })

  it('offers a revival when somebody is down', () => {
    const run = withBattle(wounded(), wounded().battle, fixedRandom(0.5))
    expect(run.offer?.map((entry) => entry.kind)).toContain('revive')
  })

  /** Pin the offer, so these do not ride on what the draw happened to give. */
  const offering = (...kinds: RewardKind[]) => ({
    ...wounded(),
    offer: kinds.map((kind) => ({ kind }) as RewardOffer),
  })

  it('applies the reward on the way to the next battle', () => {
    const next = settle(offering('levelUp'), { kind: 'levelUp' }, null, fixedRandom(0.3))
    const levels = next.battle.player.members.map((m) => m.level)
    expect(levels.every((level) => level > RUN_CONFIG.playerLevel)).toBe(true)
  })

  it('clears the offer once it is spent', () => {
    expect(
      settle(offering('levelUp'), { kind: 'levelUp' }, null, fixedRandom(0.3)).offer,
    ).toBeNull()
  })

  it('refuses a reward that was not offered', () => {
    const run = startRun(fixedRandom(0.3))
    const won = withBattle(run, { ...run.battle, winner: 'player' }, fixedRandom(0.3))
    const kinds = won.offer?.map((entry) => entry.kind) ?? []
    const notOffered = (['heal', 'revive', 'levelUp', 'recruit'] as const).find(
      (kind) => !kinds.includes(kind),
    )
    if (notOffered) {
      expect(() => settle(won, { kind: notOffered }, null, fixedRandom(0.3))).toThrow()
    }
  })

  it('still rests the party on top of the reward', () => {
    const next = settle(offering('levelUp'), { kind: 'levelUp' }, null, fixedRandom(0.3))
    // The survivors went in at 5 HP; levelling keeps the damage, resting undoes some.
    const survivor = next.battle.player.members[1]
    expect(survivor!.currentHp).toBeGreaterThan(5)
  })

  it('grows the party when the recruit is taken', () => {
    const before = offering('recruit')
    const next = settle(before, { kind: 'recruit' }, null, fixedRandom(0.3))
    expect(next.battle.player.members.length).toBe(
      before.battle.player.members.length + 1,
    )
  })
})

describe('the last battle', () => {
  /** Fast-forward to the run's final battle by winning everything before it. */
  const reachTheBoss = () => {
    let run = startRun(fixedRandom(0.3))
    while (!isFinalBattle(run.wins)) {
      run = settle(
        { ...run, battle: { ...run.battle, winner: 'player' } },
        null,
        null,
        fixedRandom(0.3),
      )
    }
    return run
  }

  it('is the one that would take the run to the clear', () => {
    expect(isFinalBattle(RUN_CONFIG.battlesToClear - 1)).toBe(true)
    expect(isFinalBattle(RUN_CONFIG.battlesToClear - 2)).toBe(false)
    expect(isFinalBattle(RUN_CONFIG.battlesToClear)).toBe(false)
  })

  it('fields the boss, alone', () => {
    const boss = reachTheBoss().battle.opponent
    expect(boss.members).toHaveLength(1)
    expect(BOSS_LIST.map((species) => species.id)).toContain(boss.members[0]!.species.id)
  })

  it('fields the boss at the level the ramp had reached', () => {
    const run = reachTheBoss()
    expect(run.battle.opponent.members[0]!.level).toBe(opponentLevel(run.wins))
  })

  it('is the only battle the boss appears in', () => {
    let run = startRun(fixedRandom(0.3))
    const bossIds = new Set(BOSS_LIST.map((species) => species.id))
    while (!isFinalBattle(run.wins)) {
      for (const member of run.battle.opponent.members) {
        expect(bossIds.has(member.species.id)).toBe(false)
      }
      run = settle(
        { ...run, battle: { ...run.battle, winner: 'player' } },
        null,
        null,
        fixedRandom(0.3),
      )
    }
    expect(run.battle.opponent.members).toHaveLength(1)
  })

  it('never drafts or recruits the boss', () => {
    // The player's side is dealt from SPECIES_LIST, which the boss is not in.
    const bossIds = new Set(BOSS_LIST.map((species) => species.id))
    for (let i = 0; i < 50; i++) {
      for (const member of startRun().battle.player.members) {
        expect(bossIds.has(member.species.id)).toBe(false)
      }
    }
  })
})

describe('clearing a run', () => {
  const wonFinal = () => {
    let run = startRun(fixedRandom(0.3))
    while (!isFinalBattle(run.wins)) {
      run = settle(
        { ...run, battle: { ...run.battle, winner: 'player' } },
        null,
        null,
        fixedRandom(0.3),
      )
    }
    return withBattle(run, { ...run.battle, winner: 'player' }, fixedRandom(0.3))
  }

  it('counts the last win and ends the run', () => {
    const run = wonFinal()
    expect(run.cleared).toBe(true)
    expect(run.finished).toBe(true)
    expect(run.wins).toBe(RUN_CONFIG.battlesToClear)
  })

  it('offers no reward for a run that is over', () => {
    const run = wonFinal()
    expect(run.offer).toBeNull()
    expect(canAdvance(run)).toBe(false)
  })

  it('cannot be advanced past', () => {
    const run = wonFinal()
    expect(settle(run, null, null, fixedRandom(0.3))).toEqual(run)
  })

  it('still draws a reward after every win before the last', () => {
    let run = startRun(fixedRandom(0.3))
    for (let i = 0; i < RUN_CONFIG.battlesToClear - 1; i++) {
      run = withBattle(run, { ...run.battle, winner: 'player' }, fixedRandom(0.3))
      expect(run.cleared).toBe(false)
      expect(run.offer).not.toBeNull()
      run = settle(run, run.offer?.[0] ?? null, null, fixedRandom(0.3))
    }
  })

  it('is a loss, not a clear, when the last battle goes the other way', () => {
    let run = startRun(fixedRandom(0.3))
    while (!isFinalBattle(run.wins)) {
      run = settle(
        { ...run, battle: { ...run.battle, winner: 'player' } },
        null,
        null,
        fixedRandom(0.3),
      )
    }
    const lost = withBattle(run, { ...run.battle, winner: 'opponent' }, fixedRandom(0.3))
    expect(lost.cleared).toBe(false)
    expect(lost.finished).toBe(true)
    expect(lost.wins).toBe(RUN_CONFIG.battlesToClear - 1)
  })

  it('starts every fresh run uncleared', () => {
    expect(startRun(fixedRandom(0.3)).cleared).toBe(false)
  })
})

describe('the fork out of a win', () => {
  const won = () => {
    const run = startRun(fixedRandom(0.3))
    return withOffer(
      { ...run, battle: { ...run.battle, winner: 'player' } },
      fixedRandom(0.3),
    )
  }

  it('draws two roads with the rewards, so a reload cannot re-roll them', () => {
    const run = won()
    expect(run.route).toHaveLength(2)
    expect(run.route?.map((road) => road.kind)).toEqual(['normal', 'elite'])
    // Drawn once: asking again leaves the same two standing.
    expect(withOffer(run, fixedRandom(0.7)).route).toBe(run.route)
  })

  it('owes one pick after an ordinary win and two after an elite', () => {
    expect(won().rewardsLeft).toBe(1)
    const afterElite = withOffer(
      {
        ...startRun(fixedRandom(0.3)),
        encounter: 'elite' as const,
        battle: { ...startRun(fixedRandom(0.3)).battle, winner: 'player' },
      },
      fixedRandom(0.3),
    )
    expect(afterElite.rewardsLeft).toBe(2)
  })

  it('will not travel until every pick is spent', () => {
    const run = won()
    expect(readyToTravel(run)).toBe(false)
    expect(advance(run, 0, fixedRandom(0.3))).toBe(run)

    const spent = takeReward(run, null, null, fixedRandom(0.3))
    expect(readyToTravel(spent)).toBe(true)
    expect(advance(spent, 0, fixedRandom(0.3)).wins).toBe(1)
  })

  it('draws a fresh offer for a second pick rather than an empty screen', () => {
    const elite = withOffer(
      { ...won(), encounter: 'elite' as const, offer: null, rewardsLeft: 0 },
      fixedRandom(0.3),
    )
    expect(elite.rewardsLeft).toBe(2)
    const once = takeReward(elite, null, null, fixedRandom(0.3))
    expect(once.rewardsLeft).toBe(1)
    expect(once.offer).not.toBeNull()
    expect(readyToTravel(once)).toBe(false)
  })

  it('fields exactly the party that was standing on the road taken', () => {
    const run = takeReward(won(), null, null, fixedRandom(0.3))
    const elite = run.route?.[1]
    const next = advance(run, 1, fixedRandom(0.3))
    expect(next.encounter).toBe('elite')
    expect(next.battle.opponent.members.map((m) => m.species.id)).toEqual(
      elite?.team.members.map((m) => m.species.id),
    )
  })

  it('takes the ordinary road when asked for one that is not there', () => {
    const run = takeReward(won(), null, null, fixedRandom(0.3))
    expect(advance(run, 9, fixedRandom(0.3)).encounter).toBe('normal')
  })

  it('offers no road before the last battle: the boss is not a choice', () => {
    let run = startRun(fixedRandom(0.3))
    while (!isFinalBattle(run.wins + 1)) {
      run = settle({ ...run, battle: { ...run.battle, winner: 'player' } })
    }
    const beforeTheBoss = withOffer(
      { ...run, battle: { ...run.battle, winner: 'player' } },
      fixedRandom(0.3),
    )
    expect(beforeTheBoss.route).toBeNull()

    const next = advance(
      takeReward(beforeTheBoss, null, null, fixedRandom(0.3)),
      0,
      fixedRandom(0.3),
    )
    expect(next.encounter).toBe('boss')
    expect(next.battle.opponent.members).toHaveLength(1)
  })

  it('clears the road and the picks once the run is won', () => {
    let run = startRun(fixedRandom(0.3))
    while (!isFinalBattle(run.wins)) {
      run = settle({ ...run, battle: { ...run.battle, winner: 'player' } })
    }
    const cleared = withBattle(run, { ...run.battle, winner: 'player' }, fixedRandom(0.3))
    expect(cleared.cleared).toBe(true)
    expect(cleared.route).toBeNull()
    expect(cleared.rewardsLeft).toBe(0)
  })
})
