import type { BattlePokemon, Move } from './entities'
import { activePokemon, switchableIndexes } from './entities'
import type { BattleState, TurnAction } from './battle'
import { calculateDamage, type Random } from './damage'
import { isImmuneTo } from './status'

/**
 * How the opponent plays. Tuned here rather than scattered through the
 * scoring, so the difficulty can be moved in one place.
 */
export const AI_CONFIG = {
  /**
   * How often it plays its best move. Below 1 it sometimes picks at random
   * instead, which keeps it from being perfectly predictable -- and keeps a
   * player from learning one safe answer to every matchup.
   */
  skill: 0.85,
  /** Landing the knockout is worth more than the raw damage suggests. */
  koBonus: 1.5,
  /** Roughly what inflicting a condition is worth, in HP. */
  statusValue: 35,
  /** Roughly what one step of a stat stage is worth, in HP. */
  stageValue: 12,
  /** Only switch when a benched Pokemon scores this many times better. */
  switchThreshold: 1.6,
} as const

/**
 * The middle of the damage spread with no critical: calculateDamage rolls the
 * critical first, then the spread, and 0.5 clears the critical chance and
 * lands mid-band. Reusing the real formula this way keeps the AI's estimate
 * honest -- it cannot drift from the damage the game actually deals.
 */
const AVERAGE_ROLL: Random = () => 0.5

/** What a move is worth against this target, in HP-equivalent terms. */
export function scoreMove(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
): number {
  if (move.category === 'status') {
    const stages = move.stageChange
      ? AI_CONFIG.stageValue * Math.abs(move.stageChange.delta) * move.accuracy
      : 0
    if (!move.effect) return stages
    if (defender.status || isImmuneTo(move.effect.status, defender.species.types)) {
      return stages
    }
    return stages + AI_CONFIG.statusValue * move.effect.chance * move.accuracy
  }

  const { damage, effectiveness } = calculateDamage(
    attacker,
    defender,
    move,
    AVERAGE_ROLL,
  )
  if (effectiveness === 0) return 0

  const expected = damage * move.accuracy
  const worth = damage >= defender.currentHp ? expected * AI_CONFIG.koBonus : expected

  // Recoil is subtracted in the same HP-equivalent terms the damage is counted
  // in, so a move that hurts the user as much as the target scores as nothing.
  // Without this the AI would happily knock itself out on a resisted hit.
  const cost = move.recoil ? damage * move.recoil * move.accuracy : 0
  return worth - cost
}

function bestMove(
  attacker: BattlePokemon,
  defender: BattlePokemon,
): { move: Move; score: number } | null {
  return attacker.species.moves.reduce<{ move: Move; score: number } | null>(
    (best, move) => {
      const score = scoreMove(attacker, defender, move)
      return !best || score > best.score ? { move, score } : best
    },
    null,
  )
}

/**
 * The opponent's turn.
 *
 * It scores every move it knows against what is in front of it and takes the
 * best, and switches when a Pokemon on the bench would do markedly better --
 * which is what makes the type chart cut both ways. Some of the time, set by
 * `skill`, it picks at random instead.
 */
export function chooseOpponentAction(
  state: BattleState,
  random: Random = Math.random,
): TurnAction {
  const attacker = activePokemon(state.opponent)
  const defender = activePokemon(state.player)
  const moves = attacker.species.moves

  const fallback = (): TurnAction => {
    const move = moves[Math.floor(random() * moves.length)]
    if (!move) throw new Error('the opposing Pokemon has no moves')
    return { type: 'move', move }
  }

  // An off day: play something at random, and never switch.
  if (random() >= AI_CONFIG.skill) return fallback()

  const current = bestMove(attacker, defender)
  if (!current) return fallback()

  const alternative = switchableIndexes(state.opponent).reduce<{
    index: number
    score: number
  } | null>((best, index) => {
    const member = state.opponent.members[index]
    if (!member) return best
    const option = bestMove(member, defender)
    if (!option) return best
    return !best || option.score > best.score ? { index, score: option.score } : best
  }, null)

  const worthSwitching =
    alternative !== null && alternative.score > current.score * AI_CONFIG.switchThreshold

  if (worthSwitching) return { type: 'switch', index: alternative.index }

  // A move that switches its user out still needs somebody to come in. The one
  // that would do best against what is on the field is the obvious pick, and
  // it is free: the attack happens either way.
  return {
    type: 'move',
    move: current.move,
    ...(current.move.switchesOut && alternative !== null
      ? { switchTo: alternative.index }
      : {}),
  }
}
