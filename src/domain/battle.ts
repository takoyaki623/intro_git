import type { BattlePokemon, Move } from './entities'
import { isFainted } from './entities'
import { calculateDamage, type Random } from './damage'
import { effectivenessMessage } from './types'

export type Side = 'player' | 'opponent'

export interface BattleState {
  readonly player: BattlePokemon
  readonly opponent: BattlePokemon
  readonly log: readonly string[]
  readonly winner: Side | null
}

export function createBattle(
  player: BattlePokemon,
  opponent: BattlePokemon,
): BattleState {
  return {
    player,
    opponent,
    log: [`A wild ${opponent.species.name} appeared!`],
    winner: null,
  }
}

function damaged(pokemon: BattlePokemon, amount: number): BattlePokemon {
  return { ...pokemon, currentHp: Math.max(0, pokemon.currentHp - amount) }
}

/** Who moves first. Faster acts first; a speed tie is broken by the coin flip. */
function turnOrder(state: BattleState, random: Random): [Side, Side] {
  const difference = state.player.stats.speed - state.opponent.stats.speed
  if (difference > 0) return ['player', 'opponent']
  if (difference < 0) return ['opponent', 'player']
  return random() < 0.5 ? ['player', 'opponent'] : ['opponent', 'player']
}

function attack(
  state: BattleState,
  attackerSide: Side,
  move: Move,
  random: Random,
): BattleState {
  const defenderSide: Side = attackerSide === 'player' ? 'opponent' : 'player'
  const attacker = state[attackerSide]
  const defender = state[defenderSide]
  const log = [...state.log, `${attacker.species.name} used ${move.name}!`]

  if (random() >= move.accuracy) {
    return { ...state, log: [...log, `${attacker.species.name}'s attack missed!`] }
  }

  const result = calculateDamage(attacker, defender, move, random)
  const hit = damaged(defender, result.damage)

  if (result.critical && result.damage > 0) log.push('A critical hit!')
  const message = effectivenessMessage(result.effectiveness)
  if (message) log.push(message)
  if (isFainted(hit)) log.push(`${hit.species.name} fainted!`)

  return {
    ...state,
    [defenderSide]: hit,
    log,
    winner: isFainted(hit) ? attackerSide : state.winner,
  }
}

/**
 * Resolve one full turn: both sides act, faster first, and a side that faints
 * mid-turn does not get to move.
 */
export function resolveTurn(
  state: BattleState,
  playerMove: Move,
  opponentMove: Move,
  random: Random = Math.random,
): BattleState {
  if (state.winner) return state

  const moves: Record<Side, Move> = { player: playerMove, opponent: opponentMove }

  return turnOrder(state, random).reduce<BattleState>(
    (current, side) =>
      current.winner ? current : attack(current, side, moves[side], random),
    state,
  )
}

/** The opponent's move choice. Random for now; smarter AI slots in here. */
export function chooseOpponentMove(
  opponent: BattlePokemon,
  random: Random = Math.random,
): Move {
  const moves = opponent.species.moves
  const move = moves[Math.floor(random() * moves.length)]
  if (!move) throw new Error(`${opponent.species.name} has no moves`)
  return move
}
