import type { BattlePokemon, TeamState } from './entities'
import { createBattlePokemon, createTeam, isFainted, withActive } from './entities'
import type { BattleState } from './battle'
import { createBattle } from './battle'
import type { Random } from './damage'
import type { RewardKind } from './rewards'
import { applyReward, offerRewards } from './rewards'
import { SPECIES_LIST } from '../data/species'

/**
 * The knobs that decide how long and how punishing a run is. Everything about
 * the difficulty curve lives here, so tuning it is a one-line change.
 */
export const RUN_CONFIG = {
  /** The player's party is this level for the whole run. */
  playerLevel: 50,
  /**
   * The first opposing party starts below the player and climbs past them.
   *
   * Starting at parity makes every battle roughly a coin flip, and a coin flip
   * from the first turn gives an expected streak of about one -- measured, not
   * guessed. Opening below the player buys a few battles of room before the
   * ramp catches up and overtakes.
   */
  opponentStartingLevel: 42,
  /** Added to the opponent's level for every win so far. */
  levelStepPerWin: 2,
  /**
   * Fraction of maximum HP the party recovers between battles. Worth less than
   * it looks: it cannot help with a battle already under way, so it lengthens a
   * streak rather than starting one.
   */
  healingBetweenBattles: 0.35,
  /** How many Pokemon each side fields. */
  partySize: 3,
} as const

export interface RunState {
  readonly battle: BattleState
  /** Battles won so far. The score. */
  readonly wins: number
  /** Set once the player's party has been wiped. */
  readonly finished: boolean
  /**
   * The rewards on offer after a win, drawn once and held.
   *
   * In state rather than derived because it is a draw: recomputing it on every
   * render would reshuffle the choices under the player's finger.
   */
  readonly offer: readonly RewardKind[] | null
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
  return RUN_CONFIG.opponentStartingLevel + wins * RUN_CONFIG.levelStepPerWin
}

function makeOpponent(wins: number, random: Random): TeamState {
  const level = opponentLevel(wins)
  const roster = sample(SPECIES_LIST, RUN_CONFIG.partySize, random)
  return createTeam(roster.map((species) => createBattlePokemon(species, level)))
}

/**
 * The player's party, drawn fresh for each run.
 *
 * A fixed trio makes every run open the same way and turns the type chart into
 * a solved problem. Dealing it means adapting to what came up, which is the
 * point of a run -- and sometimes the hand is poor, which is also the point.
 */
function makePlayerTeam(random: Random): TeamState {
  const roster = sample(SPECIES_LIST, RUN_CONFIG.partySize, random)
  return createTeam(
    roster.map((species) => createBattlePokemon(species, RUN_CONFIG.playerLevel)),
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
    battle: createBattle(makePlayerTeam(random), makeOpponent(0, random)),
    wins: 0,
    finished: false,
    offer: null,
  }
}

/** True once the player has won and the next opponent is waiting. */
export function canAdvance(run: RunState): boolean {
  return !run.finished && run.battle.winner === 'player'
}

/**
 * Draw the rewards for a won run that has none yet, and leave every other run
 * alone.
 *
 * Also covers a run restored from a save written before the draw happened --
 * a reload right after a win would otherwise skip the reward entirely.
 */
export function withOffer(run: RunState, random: Random = Math.random): RunState {
  if (!canAdvance(run) || run.offer) return run
  return { ...run, offer: offerRewards(run.battle.player.members, random) }
}

/** Fold a battle's new state back into the run, noticing a win or a loss. */
export function withBattle(
  run: RunState,
  battle: BattleState,
  random: Random = Math.random,
): RunState {
  return withOffer({ ...run, battle, finished: battle.winner === 'opponent' }, random)
}

/**
 * Take the win, apply the chosen reward, rest the party, and line up a tougher
 * opponent.
 *
 * The rest happens whatever the player picked: it is what keeps a run moving,
 * and the reward is the choice on top of it.
 */
export function advance(
  run: RunState,
  reward: RewardKind | null = null,
  random: Random = Math.random,
): RunState {
  if (!canAdvance(run)) return run
  if (reward && run.offer && !run.offer.includes(reward)) {
    throw new Error(`${reward} was not on offer`)
  }

  const wins = run.wins + 1
  const rewarded = reward
    ? applyReward(run.battle.player.members, reward, random)
    : run.battle.player.members
  const members = restBetweenBattles(rewarded)
  // createTeam leads with the first member, which may well be one that fainted
  // in an earlier battle, so lead with the first that is still standing.
  const lead = members.findIndex((member) => !isFainted(member))
  const rested = withActive(createTeam(members), Math.max(0, lead))

  return {
    battle: createBattle(rested, makeOpponent(wins, random)),
    wins,
    finished: false,
    offer: null,
  }
}
