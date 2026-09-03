import type { BattlePokemon, Species, TeamState } from './entities'
import { createBattlePokemon, createTeam, isFainted, withActive } from './entities'
import type { BattleState } from './battle'
import { createBattle } from './battle'
import type { Random } from './damage'
import { PLAYER_TEAM } from '../data/teams'
import { SPECIES_LIST } from '../data/species'

/**
 * The knobs that decide how long and how punishing a run is. Everything about
 * the difficulty curve lives here, so tuning it is a one-line change.
 */
export const RUN_CONFIG = {
  /** Level of the first opposing party. */
  startingLevel: 50,
  /** Added to the opponent's level for every win so far. */
  levelStepPerWin: 2,
  /** Fraction of maximum HP the party recovers between battles. */
  healingBetweenBattles: 0.25,
  /** How many Pokemon each side fields. */
  partySize: 3,
} as const

export interface RunState {
  readonly battle: BattleState
  /** Battles won so far. The score. */
  readonly wins: number
  /** Set once the player's party has been wiped. */
  readonly finished: boolean
}

/** Pick `count` distinct entries, without disturbing the pool it was given. */
function sample<T>(pool: readonly T[], count: number, random: Random): T[] {
  const remaining = [...pool]
  const picked: T[] = []
  while (picked.length < count && remaining.length > 0) {
    const [item] = remaining.splice(Math.floor(random() * remaining.length), 1)
    if (item) picked.push(item)
  }
  return picked
}

export function opponentLevel(wins: number): number {
  return RUN_CONFIG.startingLevel + wins * RUN_CONFIG.levelStepPerWin
}

function makeOpponent(wins: number, random: Random): TeamState {
  const level = opponentLevel(wins)
  const roster = sample(SPECIES_LIST, RUN_CONFIG.partySize, random)
  return createTeam(roster.map((species) => createBattlePokemon(species, level)))
}

function makePlayerTeam(): TeamState {
  const roster: readonly Species[] = PLAYER_TEAM.slice(0, RUN_CONFIG.partySize)
  return createTeam(
    roster.map((species) => createBattlePokemon(species, RUN_CONFIG.startingLevel)),
  )
}

/**
 * The breather between battles: a fraction of health back, and conditions
 * cured. A Pokemon that fainted stays down for the rest of the run -- that
 * countdown is what gives a streak its tension.
 */
export function restBetweenBattles(
  members: readonly BattlePokemon[],
): readonly BattlePokemon[] {
  return members.map((member) => {
    if (isFainted(member)) return member
    const restored = Math.floor(member.stats.hp * RUN_CONFIG.healingBetweenBattles)
    return {
      ...member,
      currentHp: Math.min(member.stats.hp, member.currentHp + restored),
      status: null,
    }
  })
}

export function startRun(random: Random = Math.random): RunState {
  return {
    battle: createBattle(makePlayerTeam(), makeOpponent(0, random)),
    wins: 0,
    finished: false,
  }
}

/** Fold a battle's new state back into the run, noticing a loss. */
export function withBattle(run: RunState, battle: BattleState): RunState {
  return { ...run, battle, finished: battle.winner === 'opponent' }
}

/** True once the player has won and the next opponent is waiting. */
export function canAdvance(run: RunState): boolean {
  return !run.finished && run.battle.winner === 'player'
}

/** Take the win, rest the party, and line up a tougher opponent. */
export function advance(run: RunState, random: Random = Math.random): RunState {
  if (!canAdvance(run)) return run

  const wins = run.wins + 1
  const members = restBetweenBattles(run.battle.player.members)
  // createTeam leads with the first member, which may well be one that fainted
  // in an earlier battle, so lead with the first that is still standing.
  const lead = members.findIndex((member) => !isFainted(member))
  const rested = withActive(createTeam(members), Math.max(0, lead))

  return {
    battle: createBattle(rested, makeOpponent(wins, random)),
    wins,
    finished: false,
  }
}
