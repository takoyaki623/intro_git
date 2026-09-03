import type { BattlePokemon, Move, Side, TeamState } from './entities'
import {
  activePokemon,
  isFainted,
  isTeamDefeated,
  switchableIndexes,
  withActive,
  withMember,
} from './entities'
import type { BattleEvent } from './events'
import { calculateDamage, type Random } from './damage'

export type { Side }

/** What a side does with its turn. Switching costs the whole turn. */
export type TurnAction =
  | { readonly type: 'move'; readonly move: Move }
  | { readonly type: 'switch'; readonly index: number }

export interface BattleState {
  readonly player: TeamState
  readonly opponent: TeamState
  readonly events: readonly BattleEvent[]
  readonly winner: Side | null
  /**
   * Set when the player's active Pokemon has fainted and a replacement is
   * owed. No turn can be taken until `forceSwitch` clears it. The opponent
   * never sets this -- it picks its own replacement as the turn settles.
   */
  readonly awaitingSwitch: Side | null
}

const other = (side: Side): Side => (side === 'player' ? 'opponent' : 'player')

export function createBattle(player: TeamState, opponent: TeamState): BattleState {
  return {
    player,
    opponent,
    events: [{ kind: 'encounter', pokemon: activePokemon(opponent).species.name }],
    winner: null,
    awaitingSwitch: null,
  }
}

function damaged(pokemon: BattlePokemon, amount: number): BattlePokemon {
  return { ...pokemon, currentHp: Math.max(0, pokemon.currentHp - amount) }
}

/** Who acts first. Faster acts first; a speed tie is broken by the coin flip. */
function turnOrder(state: BattleState, random: Random): [Side, Side] {
  const difference =
    activePokemon(state.player).stats.speed - activePokemon(state.opponent).stats.speed
  if (difference > 0) return ['player', 'opponent']
  if (difference < 0) return ['opponent', 'player']
  return random() < 0.5 ? ['player', 'opponent'] : ['opponent', 'player']
}

/**
 * Send out a different member. A replacement for a fainted Pokemon is `forced`
 * and skips the recall line, the way the games do.
 */
function applySwitch(
  state: BattleState,
  side: Side,
  index: number,
  forced: boolean,
): BattleState {
  const team = state[side]
  const incoming = team.members[index]
  if (!incoming) throw new Error(`no Pokemon at index ${index}`)

  const events: BattleEvent[] = [...state.events]
  if (!forced) {
    events.push({ kind: 'withdraw', side, pokemon: activePokemon(team).species.name })
  }
  events.push({ kind: 'sendOut', side, pokemon: incoming.species.name })

  return { ...state, [side]: withActive(team, index), events }
}

function attack(
  state: BattleState,
  attackerSide: Side,
  move: Move,
  random: Random,
): BattleState {
  const defenderSide = other(attackerSide)
  const defenderTeam = state[defenderSide]
  const attacker = activePokemon(state[attackerSide])
  const defender = activePokemon(defenderTeam)

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
  const nextTeam = withMember(defenderTeam, defenderTeam.activeIndex, hit)
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
    [defenderSide]: nextTeam,
    events,
    // A faint only ends the battle once the whole party is down.
    winner: fainted && isTeamDefeated(nextTeam) ? attackerSide : state.winner,
  }
}

/**
 * After the turn: a side whose active Pokemon fainted either loses, sends out
 * its own replacement (the opponent), or is asked for one (the player).
 */
function settleFaints(state: BattleState): BattleState {
  const sides: readonly Side[] = ['player', 'opponent']
  return sides.reduce((current, side) => {
    if (current.winner) return current
    if (!isFainted(activePokemon(current[side]))) return current
    if (isTeamDefeated(current[side])) return { ...current, winner: other(side) }
    if (side === 'player') return { ...current, awaitingSwitch: 'player' }

    const [index] = switchableIndexes(current[side])
    return index === undefined ? current : applySwitch(current, side, index, true)
  }, state)
}

/**
 * Resolve one full turn. Switches happen before any move, and a Pokemon that
 * faints partway through does not get to act.
 */
export function resolveTurn(
  state: BattleState,
  playerAction: TurnAction,
  opponentAction: TurnAction,
  random: Random = Math.random,
): BattleState {
  if (state.winner || state.awaitingSwitch) return state

  const actions: Record<Side, TurnAction> = {
    player: playerAction,
    opponent: opponentAction,
  }
  // Order is read once, before anything moves. A side that switches gives up
  // its attack, so at most one side can still be attacking afterwards and
  // recomputing the order after the switches could not change anything.
  const order = turnOrder(state, random)

  const switched = order.reduce<BattleState>((current, side) => {
    const action = actions[side]
    return action.type === 'switch'
      ? applySwitch(current, side, action.index, false)
      : current
  }, state)

  const attacked = order.reduce<BattleState>((current, side) => {
    const action = actions[side]
    if (current.winner || action.type !== 'move') return current
    if (isFainted(activePokemon(current[side]))) return current
    return attack(current, side, action.move, random)
  }, switched)

  return settleFaints(attacked)
}

/** Send out the replacement the player owes after a faint. */
export function forceSwitch(state: BattleState, side: Side, index: number): BattleState {
  if (state.awaitingSwitch !== side) {
    throw new Error(`${side} is not owed a switch`)
  }
  if (!switchableIndexes(state[side]).includes(index)) {
    throw new Error(`${side} cannot send out the Pokemon at index ${index}`)
  }
  return { ...applySwitch(state, side, index, true), awaitingSwitch: null }
}

/** The opponent's turn. It only attacks for now; switching AI comes later. */
export function chooseOpponentAction(
  state: BattleState,
  random: Random = Math.random,
): TurnAction {
  const moves = activePokemon(state.opponent).species.moves
  const move = moves[Math.floor(random() * moves.length)]
  if (!move) throw new Error('the opposing Pokemon has no moves')
  return { type: 'move', move }
}
