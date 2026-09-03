import type { BattlePokemon, Move, Side, TeamState } from './entities'
import {
  activePokemon,
  effectiveSpeed,
  isFainted,
  isTeamDefeated,
  switchableIndexes,
  withActive,
  withMember,
} from './entities'
import type { BattleEvent } from './events'
import { createStatus, endOfTurnDamage, gateAction, isImmuneTo } from './status'
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

function withActiveMember(
  state: BattleState,
  side: Side,
  pokemon: BattlePokemon,
): BattleState {
  const team = state[side]
  return { ...state, [side]: withMember(team, team.activeIndex, pokemon) }
}

function damaged(pokemon: BattlePokemon, amount: number): BattlePokemon {
  return { ...pokemon, currentHp: Math.max(0, pokemon.currentHp - amount) }
}

/** Who acts first. Faster acts first; a speed tie is broken by the coin flip. */
function turnOrder(state: BattleState, random: Random): [Side, Side] {
  const difference =
    effectiveSpeed(activePokemon(state.player)) -
    effectiveSpeed(activePokemon(state.opponent))
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

/**
 * A move's parting gift, if it has one. Draws once for the chance and, for
 * sleep, once more for how long it lasts. A target that is already afflicted,
 * immune by type, or down takes nothing.
 */
function applyEffect(
  state: BattleState,
  targetSide: Side,
  move: Move,
  random: Random,
): BattleState {
  if (!move.effect) return state

  const landed = random() < move.effect.chance
  const target = activePokemon(state[targetSide])
  if (!landed || target.status || isFainted(target)) return state
  if (isImmuneTo(move.effect.status, target.species.types)) return state

  const status = createStatus(move.effect.status, random)
  return {
    ...withActiveMember(state, targetSide, { ...target, status }),
    events: [
      ...state.events,
      {
        kind: 'statusInflicted',
        side: targetSide,
        pokemon: target.species.name,
        status: move.effect.status,
      },
    ],
  }
}

function attack(
  state: BattleState,
  attackerSide: Side,
  move: Move,
  random: Random,
): BattleState {
  const defenderSide = other(attackerSide)
  const attackerTeam = state[attackerSide]
  const attacker = activePokemon(attackerTeam)

  // A condition gets its say before the move does. Waking or thawing lets the
  // Pokemon act on the same turn, as it does in the games.
  const gate = gateAction(attacker.status, random)
  const gated =
    gate.status === attacker.status
      ? state
      : withActiveMember(state, attackerSide, { ...attacker, status: gate.status })

  const events: BattleEvent[] = [...gated.events]
  if (gate.ended) {
    events.push({
      kind: 'statusEnded',
      side: attackerSide,
      pokemon: attacker.species.name,
      status: gate.ended,
    })
  }
  if (gate.blockedBy) {
    events.push({
      kind: 'immobilised',
      side: attackerSide,
      pokemon: attacker.species.name,
      status: gate.blockedBy,
    })
    return { ...gated, events }
  }

  events.push({
    kind: 'useMove',
    side: attackerSide,
    pokemon: attacker.species.name,
    move: move.name,
  })

  if (random() >= move.accuracy) {
    events.push({ kind: 'miss', side: attackerSide, pokemon: attacker.species.name })
    return { ...gated, events }
  }

  // A status move never deals damage; it exists only for its effect.
  if (move.category === 'status') {
    return applyEffect({ ...gated, events }, defenderSide, move, random)
  }

  const defenderTeam = gated[defenderSide]
  const defender = activePokemon(defenderTeam)
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

  const struck: BattleState = {
    ...gated,
    [defenderSide]: nextTeam,
    events,
    // A faint only ends the battle once the whole party is down.
    winner: fainted && isTeamDefeated(nextTeam) ? attackerSide : gated.winner,
  }

  return fainted ? struck : applyEffect(struck, defenderSide, move, random)
}

/** Poison and burn bite once both sides have finished acting. */
function endOfTurn(state: BattleState, order: readonly Side[]): BattleState {
  return order.reduce<BattleState>((current, side) => {
    if (current.winner) return current

    const team = current[side]
    const pokemon = activePokemon(team)
    const amount = endOfTurnDamage(pokemon.status, pokemon.stats.hp)
    if (isFainted(pokemon) || amount === 0 || !pokemon.status) return current

    const hurt = damaged(pokemon, amount)
    const nextTeam = withMember(team, team.activeIndex, hurt)
    const events: BattleEvent[] = [
      ...current.events,
      {
        kind: 'statusDamage',
        side,
        pokemon: pokemon.species.name,
        status: pokemon.status.kind,
        amount,
      },
    ]
    if (isFainted(hurt)) {
      events.push({ kind: 'faint', side, pokemon: hurt.species.name })
    }

    return {
      ...current,
      [side]: nextTeam,
      events,
      winner: isFainted(hurt) && isTeamDefeated(nextTeam) ? other(side) : current.winner,
    }
  }, state)
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
 * Resolve one full turn: switches, then moves, then the conditions that bite
 * at the end. A Pokemon that faints partway through does not get to act.
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

  return settleFaints(endOfTurn(attacked, order))
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
