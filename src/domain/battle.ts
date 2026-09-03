import type { BattlePokemon, Move, Side } from './entities'
import { isFainted } from './entities'
import type { BattleEvent } from './events'
import { calculateDamage, type Random } from './damage'

export type { Side }

export interface BattleState {
  readonly player: BattlePokemon
  readonly opponent: BattlePokemon
  readonly events: readonly BattleEvent[]
  readonly winner: Side | null
}

export function createBattle(
  player: BattlePokemon,
  opponent: BattlePokemon,
): BattleState {
  return {
    player,
    opponent,
    events: [{ kind: 'encounter', pokemon: opponent.species.name }],
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

  const events: BattleEvent[] = [
    ...state.events,
    {
      kind: 'useMove',
      side: attackerSide,
      pokemon: attacker.species.name,
      move: move.name,
    },
  ]

  if (random() >= move.accuracy) {
    events.push({ kind: 'miss', side: attackerSide, pokemon: attacker.species.name })
    return { ...state, events }
  }

  const result = calculateDamage(attacker, defender, move, random)
  const hit = damaged(defender, result.damage)
  const fainted = isFainted(hit)

  if (result.critical && result.damage > 0) events.push({ kind: 'critical' })
  events.push({
    kind: 'effectiveness',
    multiplier: result.effectiveness,
    target: defender.species.name,
  })
  events.push({
    kind: 'damage',
    side: defenderSide,
    pokemon: defender.species.name,
    amount: result.damage,
  })
  if (fainted) {
    events.push({ kind: 'faint', side: defenderSide, pokemon: hit.species.name })
  }

  return {
    ...state,
    [defenderSide]: hit,
    events,
    winner: fainted ? attackerSide : state.winner,
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
