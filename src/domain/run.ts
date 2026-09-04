import type { BattlePokemon, Species, TeamState } from './entities'
import { createBattlePokemon, createTeam, isFainted, withActive } from './entities'
import type { BattleState } from './battle'
import { createBattle } from './battle'
import type { Random } from './damage'
import type { RewardOffer, RewardTarget } from './rewards'
import type { Move } from './entities'
import { applyReward, offerMove, offerRewards, sameOffer } from './rewards'
import { teachMove } from './rewards'
import { sample } from './sample'
import { FIRST_TIER, clampTier, tierLevelBonus } from './tiers'
import { BOSS_LIST, SPECIES_LIST } from '../data/species'

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
   *
   * Raised to 44 when the draft arrived, then dropped to 40 when the move list
   * grew. More power on both sides is not a wash in a run: the opposing party
   * is replaced every battle while the player's carries its damage forward, so
   * shorter, swingier battles cost the side that has to persist. Measured, the
   * same bot fell from 20% clears to 8% on the moves alone, and four levels
   * put it back.
   */
  opponentStartingLevel: 40,
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
  /**
   * Battles in a run. Win them all and the run is cleared.
   *
   * A streak with no finish line only ever answers "how long until you die",
   * which makes every reward a question about surviving one more battle. A
   * fixed length turns it into "what do I need by the last one".
   *
   * Six, measured rather than guessed. A competent run reaches the last battle
   * about one time in three and wins it about one in five, so most runs still
   * end short -- but the boss is content, and at eight battles only one run in
   * five ever saw it.
   */
  battlesToClear: 6,
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
  readonly offer: readonly RewardOffer[] | null
  /**
   * A move the party may take on, drawn with the rewards and taken beside one
   * rather than instead of one. Null once it has been taken or passed up.
   */
  readonly moveOffer: Move | null
  /** Set once the last battle has been won. The run is over, and it was won. */
  readonly cleared: boolean
  /** Which difficulty tier this run is being played at. */
  readonly tier: number
}

export function opponentLevel(wins: number, tier: number = FIRST_TIER): number {
  return (
    RUN_CONFIG.opponentStartingLevel +
    tierLevelBonus(tier) +
    wins * RUN_CONFIG.levelStepPerWin
  )
}

/**
 * True while the battle in front of a player on `wins` wins is the last one.
 *
 * Takes the wins rather than the run so the UI, the opponent maker and the
 * clear check all read the same rule off the same number.
 */
export function isFinalBattle(wins: number): boolean {
  return wins === RUN_CONFIG.battlesToClear - 1
}

/**
 * The last battle is one Pokemon, not three.
 *
 * Three at the same level would just be a slightly longer version of the seven
 * battles before it. One that outclasses anything the player can draft reads as
 * a wall, and the party's three bodies against its one is what makes the fight
 * winnable -- the player spends Pokemon to get through it.
 */
function makeOpponent(wins: number, tier: number, random: Random): TeamState {
  const level = opponentLevel(wins, tier)
  if (isFinalBattle(wins)) {
    const [boss] = sample(BOSS_LIST, 1, random)
    if (boss) return createTeam([createBattlePokemon(boss, level)])
  }
  const roster = sample(SPECIES_LIST, RUN_CONFIG.partySize, random)
  return createTeam(roster.map((species) => createBattlePokemon(species, level)))
}

/**
 * The player's party.
 *
 * A drafted roster is used as given, in the order it was picked. Without one --
 * a test, or a run started outside the draft -- the party is dealt at random,
 * which is where the run started before the draft existed.
 */
function makePlayerTeam(random: Random, roster?: readonly Species[]): TeamState {
  const chosen =
    roster && roster.length > 0
      ? roster
      : sample(SPECIES_LIST, RUN_CONFIG.partySize, random)
  return createTeam(
    chosen.map((species) => createBattlePokemon(species, RUN_CONFIG.playerLevel)),
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

export function startRun(
  random: Random = Math.random,
  roster?: readonly Species[],
  tier: number = FIRST_TIER,
): RunState {
  const safe = clampTier(tier)
  return {
    battle: createBattle(
      makePlayerTeam(random, roster),
      makeOpponent(0, safe, random),
      isFinalBattle(0),
    ),
    wins: 0,
    finished: false,
    offer: null,
    moveOffer: null,
    cleared: false,
    tier: safe,
  }
}

/**
 * True once the player has won and the next opponent is waiting.
 *
 * False after the last battle: there is no next opponent, and no reward worth
 * choosing for a run that is already over.
 */
export function canAdvance(run: RunState): boolean {
  return !run.finished && !run.cleared && run.battle.winner === 'player'
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
  return {
    ...run,
    offer: offerRewards(run.battle.player.members, random),
    moveOffer: offerMove(run.battle.player.members, random),
  }
}

/**
 * Take the move on offer for one of the party.
 *
 * The run stays where it is: the win is still unspent, and the player goes on
 * to pick their reward afterwards.
 */
export function takeMove(run: RunState, target: RewardTarget): RunState {
  if (!run.moveOffer || !canAdvance(run)) return run
  const members = teachMove(run.battle.player.members, run.moveOffer, target)
  if (members === run.battle.player.members) return run
  return {
    ...run,
    moveOffer: null,
    battle: { ...run.battle, player: { ...run.battle.player, members } },
  }
}

/** Leave the move where it is and get on with the reward. */
export function passMove(run: RunState): RunState {
  return run.moveOffer ? { ...run, moveOffer: null } : run
}

/**
 * Fold a battle's new state back into the run, noticing a win, a loss, or the
 * clear.
 *
 * Winning the last battle counts the win here rather than in `advance`, because
 * there is nothing to advance to: the run ends on the victory itself.
 */
export function withBattle(
  run: RunState,
  battle: BattleState,
  random: Random = Math.random,
): RunState {
  if (
    !run.finished &&
    !run.cleared &&
    battle.winner === 'player' &&
    isFinalBattle(run.wins)
  ) {
    return {
      ...run,
      battle,
      wins: run.wins + 1,
      cleared: true,
      finished: true,
      offer: null,
    }
  }
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
  reward: RewardOffer | null = null,
  target: RewardTarget | null = null,
  random: Random = Math.random,
): RunState {
  if (!canAdvance(run)) return run
  if (reward && run.offer && !run.offer.some((entry) => sameOffer(entry, reward))) {
    throw new Error(`${reward.kind} was not on offer`)
  }

  const wins = run.wins + 1
  const rewarded = reward
    ? applyReward(run.battle.player.members, reward, target, random)
    : run.battle.player.members
  const members = restBetweenBattles(rewarded)
  // createTeam leads with the first member, which may well be one that fainted
  // in an earlier battle, so lead with the first that is still standing.
  const lead = members.findIndex((member) => !isFainted(member))
  const rested = withActive(createTeam(members), Math.max(0, lead))

  return {
    battle: createBattle(
      rested,
      makeOpponent(wins, run.tier, random),
      isFinalBattle(wins),
    ),
    wins,
    finished: false,
    offer: null,
    moveOffer: null,
    cleared: false,
    tier: run.tier,
  }
}
