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
    if (!move.effect || defender.status) return 0
    if (isImmuneTo(move.effect.status, defender.species.types)) return 0
    return AI_CONFIG.statusValue * move.effect.chance * move.accuracy
  }

  const { damage, effectiveness } = calculateDamage(
    attacker,
    defender,
    move,
    AVERAGE_ROLL,
  )
  if (effectiveness === 0) return 0

  const expected = damage * move.accuracy
  return damage >= defender.currentHp ? expected * AI_CONFIG.koBonus : expected
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

  return worthSwitching
    ? { type: 'switch', index: alternative.index }
    : { type: 'move', move: current.move }
}
