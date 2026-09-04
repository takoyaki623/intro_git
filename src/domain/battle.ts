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
import { NO_STAGES, changeStage, hasAnyStage } from './stages'
import { ABSORB_FRACTION, INTIMIDATE_DELTA, enduresWith, intimidates } from './abilities'
import {
  LEFTOVERS_FRACTION,
  berryHealing,
  enduresWith as itemEndures,
  healsEachTurn,
} from './items'
import { calculateDamage, type Random } from './damage'

export type { Side }

/** What a side does with its turn. Switching costs the whole turn. */
export type TurnAction =
  | {
      readonly type: 'move'
      readonly move: Move
      /**
       * Who comes in afterwards, for a move that switches its user out.
       *
       * Chosen up front rather than asked for mid-turn: the turn stays one
       * atomic call, and the player picks the replacement themselves instead
       * of having one assigned. Ignored by every other move, and a missing or
       * unusable index simply means no switch.
       */
      readonly switchTo?: number
    }
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

/**
 * `final` only reaches the opening line. The battle itself plays the same
 * either way -- what makes the last one hard is who is standing in it, not a
 * rule change -- so the rest of this file never looks at it.
 */
export function createBattle(
  player: TeamState,
  opponent: TeamState,
  final = false,
): BattleState {
  const opening: BattleState = {
    player,
    opponent,
    events: [{ kind: 'encounter', pokemon: activePokemon(opponent).species.name, final }],
    winner: null,
    awaitingSwitch: null,
  }
  // Both leads are entering the field, so both abilities get to speak.
  return announceAbility(announceAbility(opening, 'opponent'), 'player')
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

function healed(pokemon: BattlePokemon, amount: number): BattlePokemon {
  return {
    ...pokemon,
    currentHp: Math.min(pokemon.stats.hp, pokemon.currentHp + amount),
  }
}

/**
 * いかく: the foe's attack drops as this Pokemon comes out.
 *
 * Runs on every send-out, the opening lead included, so an ability that reads
 * "on entering the field" actually does.
 */
function announceAbility(state: BattleState, side: Side): BattleState {
  const pokemon = activePokemon(state[side])
  const ability = pokemon.species.ability
  if (!intimidates(ability) || !ability) return state

  const foeSide = other(side)
  const foe = activePokemon(state[foeSide])
  if (isFainted(foe)) return state

  const { stages, applied } = changeStage(foe.stages, 'attack', INTIMIDATE_DELTA)
  const events: BattleEvent[] = [
    ...state.events,
    {
      kind: 'ability',
      side,
      pokemon: pokemon.species.name,
      ability,
      outcome: 'announced',
    },
    {
      kind: 'statStage',
      side: foeSide,
      pokemon: foe.species.name,
      stat: 'attack',
      delta: INTIMIDATE_DELTA,
      applied,
    },
  ]
  return { ...withActiveMember(state, foeSide, { ...foe, stages }), events }
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

  const outgoing = activePokemon(team)
  const events: BattleEvent[] = [...state.events]
  if (!forced) {
    events.push({ kind: 'withdraw', side, pokemon: outgoing.species.name })
  }
  events.push({ kind: 'sendOut', side, pokemon: incoming.species.name })

  // Stat stages belong to a Pokemon's time on the field, so they go with it.
  // This is what stops a boosted sweeper from banking its work and coming back.
  const cleared = hasAnyStage(outgoing.stages)
    ? withMember(team, team.activeIndex, { ...outgoing, stages: NO_STAGES })
    : team

  return announceAbility({ ...state, [side]: withActive(cleared, index), events }, side)
}

/**
 * A move's parting gift, if it has one. Draws once for the chance and, for
 * sleep, once more for how long it lasts. A target that is already afflicted,
 * immune by type, or down takes nothing.
 */
/** Push a stat up or down on whichever side the move aims at. */
function applyStageChange(
  state: BattleState,
  attackerSide: Side,
  move: Move,
): BattleState {
  if (!move.stageChange) return state

  const { target, stat, delta } = move.stageChange
  const side: Side = target === 'self' ? attackerSide : other(attackerSide)
  const pokemon = activePokemon(state[side])
  if (isFainted(pokemon)) return state

  const { stages, applied } = changeStage(pokemon.stages, stat, delta)
  return {
    ...withActiveMember(state, side, { ...pokemon, stages }),
    events: [
      ...state.events,
      { kind: 'statStage', side, pokemon: pokemon.species.name, stat, delta, applied },
    ],
  }
}

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

/**
 * The user takes back a fraction of what it dealt.
 *
 * Rounded up to at least 1 whenever the move connected, so a recoil move is
 * never quietly free against something that barely felt it.
 */
function applyRecoil(
  state: BattleState,
  side: Side,
  move: Move,
  dealt: number,
): BattleState {
  if (!move.recoil || dealt <= 0) return state

  const pokemon = activePokemon(state[side])
  if (isFainted(pokemon)) return state

  const amount = Math.max(1, Math.floor(dealt * move.recoil))
  const hurt = damaged(pokemon, amount)
  const team = state[side]
  const nextTeam = withMember(team, team.activeIndex, hurt)
  const events: BattleEvent[] = [
    ...state.events,
    { kind: 'recoil', side, pokemon: pokemon.species.name, amount },
  ]
  if (isFainted(hurt)) events.push({ kind: 'faint', side, pokemon: hurt.species.name })

  return {
    ...state,
    [side]: nextTeam,
    events,
    // Fainting to your own recoil hands the battle over, same as any other faint.
    winner: isFainted(hurt) && isTeamDefeated(nextTeam) ? other(side) : state.winner,
  }
}

/**
 * とんぼがえり: the user leaves after the blow lands.
 *
 * Nothing happens if the move missed (the caller returns before this), if the
 * user is down, if the battle is already decided, or if there is nobody left to
 * come in -- in which case the move was simply an attack.
 */
function applySwitchOut(
  state: BattleState,
  side: Side,
  move: Move,
  switchTo: number | undefined,
): BattleState {
  if (!move.switchesOut || state.winner) return state
  if (isFainted(activePokemon(state[side]))) return state
  if (switchTo === undefined || !switchableIndexes(state[side]).includes(switchTo)) {
    return state
  }
  return applySwitch(state, side, switchTo, false)
}

function attack(
  state: BattleState,
  attackerSide: Side,
  move: Move,
  random: Random,
  switchTo?: number,
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

  // A status move never deals damage; it exists only for its effects.
  if (move.category === 'status') {
    const withStages = applyStageChange({ ...gated, events }, attackerSide, move)
    return applyEffect(withStages, defenderSide, move, random)
  }

  const defenderTeam = gated[defenderSide]
  const defender = activePokemon(defenderTeam)
  const result = calculateDamage(attacker, defender, move, random)

  // ふゆう and ちょすい answer the move rather than taking it.
  if (result.absorbed) {
    const ability = defender.species.ability
    if (ability) {
      events.push({
        kind: 'ability',
        side: defenderSide,
        pokemon: defender.species.name,
        ability,
        outcome: result.absorbed,
      })
    }
    if (result.absorbed === 'heal') {
      const amount = Math.max(1, Math.floor(defender.stats.hp * ABSORB_FRACTION))
      return {
        ...withActiveMember(gated, defenderSide, healed(defender, amount)),
        events,
      }
    }
    return { ...gated, events }
  }

  const struckDown = damaged(defender, result.damage)
  // がんじょう and きあいのタスキ: a blow from full health leaves 1 HP behind.
  const fromFull = defender.currentHp === defender.stats.hp
  const abilityEndures = fromFull && enduresWith(defender.species.ability)
  const itemEndured = fromFull && !abilityEndures && itemEndures(defender.item)
  const endured = isFainted(struckDown) && (abilityEndures || itemEndured)

  const held = endured
    ? { ...struckDown, currentHp: 1, item: itemEndured ? null : struckDown.item }
    : struckDown

  const berry = berryHealing(held.item, held.currentHp, held.stats.hp)
  const hit = berry > 0 ? { ...healed(held, berry), item: null } : held

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
  if (abilityEndures && endured && defender.species.ability) {
    events.push({
      kind: 'ability',
      side: defenderSide,
      pokemon: defender.species.name,
      ability: defender.species.ability,
      outcome: 'endured',
    })
  }
  if (itemEndured && endured && defender.item) {
    events.push({
      kind: 'item',
      side: defenderSide,
      pokemon: defender.species.name,
      item: defender.item,
      outcome: 'endured',
    })
  }
  if (berry > 0 && held.item) {
    events.push({
      kind: 'item',
      side: defenderSide,
      pokemon: defender.species.name,
      item: held.item,
      outcome: 'healed',
      amount: berry,
    })
  }
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

  // A target that fell takes no lingering effect, but the user still pays its
  // own recoil and still leaves the field if the move says so.
  const settled = fainted
    ? struck
    : applyEffect(
        applyStageChange(struck, attackerSide, move),
        defenderSide,
        move,
        random,
      )

  return applySwitchOut(
    applyRecoil(settled, attackerSide, move, result.damage),
    attackerSide,
    move,
    switchTo,
  )
}

/** Held items and lingering conditions settle once both sides have acted. */
function endOfTurn(state: BattleState, order: readonly Side[]): BattleState {
  return order.reduce<BattleState>((current, side) => {
    if (current.winner) return current

    const pokemon = activePokemon(current[side])
    if (isFainted(pokemon)) return current

    // たべのこし gives a little back before the conditions take theirs.
    const restored =
      healsEachTurn(pokemon.item) && pokemon.currentHp < pokemon.stats.hp
        ? Math.max(1, Math.floor(pokemon.stats.hp * LEFTOVERS_FRACTION))
        : 0
    const fed = restored > 0 ? healed(pokemon, restored) : pokemon
    const withFood: BattleState =
      restored > 0 && pokemon.item
        ? {
            ...withActiveMember(current, side, fed),
            events: [
              ...current.events,
              {
                kind: 'item',
                side,
                pokemon: pokemon.species.name,
                item: pokemon.item,
                outcome: 'healed',
                amount: restored,
              },
            ],
          }
        : current

    const amount = endOfTurnDamage(fed.status, fed.stats.hp)
    if (amount === 0 || !fed.status) return withFood

    const hurt = damaged(fed, amount)
    const team = withFood[side]
    const nextTeam = withMember(team, team.activeIndex, hurt)
    const events: BattleEvent[] = [
      ...withFood.events,
      {
        kind: 'statusDamage',
        side,
        pokemon: fed.species.name,
        status: fed.status.kind,
        amount,
      },
    ]
    if (isFainted(hurt)) {
      events.push({ kind: 'faint', side, pokemon: hurt.species.name })
    }

    return {
      ...withFood,
      [side]: nextTeam,
      events,
      winner: isFainted(hurt) && isTeamDefeated(nextTeam) ? other(side) : withFood.winner,
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
  // Order is read once, before anything moves, and is not revisited -- not
  // after a switch, and not after a switch-out move brings in something faster.
  // The games work the same way: who acts first is settled at the top of the
  // turn, so a Pokemon cannot be overtaken by a replacement that arrives
  // mid-turn.
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
    return attack(current, side, action.move, random, action.switchTo)
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
