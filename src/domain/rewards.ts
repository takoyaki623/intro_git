import type { BattlePokemon, Move } from './entities'
import { createBattlePokemon, isFainted, statsAtLevel } from './entities'
import type { Random } from './damage'
import { SPECIES_LIST } from '../data/species'
import type { ItemKind } from './items'
import { ITEM_KINDS } from './items'
import { MOVE_LIST } from '../data/moves'
import { sample } from './sample'
import { canLearn } from './learnsets'

export type RewardKind = 'heal' | 'revive' | 'levelUp' | 'recruit' | 'item' | 'teach'

/** Every kind there is, for anything that has to validate one it was handed. */
export const REWARD_KINDS = [
  'heal',
  'revive',
  'levelUp',
  'recruit',
  'item',
  'teach',
] as const satisfies readonly RewardKind[]

/**
 * A reward as it sits on the table, with whatever it is actually giving.
 *
 * The kind alone was not enough once rewards started handing over specific
 * things. "わざを おぼえる" is a blind pick; "とんぼがえりを おぼえる" is a
 * decision, and the difference is whether the offer carries the move.
 */
export type RewardOffer =
  | { readonly kind: 'heal' }
  | { readonly kind: 'revive' }
  | { readonly kind: 'levelUp' }
  | { readonly kind: 'recruit' }
  | { readonly kind: 'item'; readonly item: ItemKind }
  | { readonly kind: 'teach'; readonly move: Move }

/**
 * Which member a reward is aimed at, and where.
 *
 * Only the two that build a party need one: the rest apply to everybody, or to
 * the only sensible candidate.
 */
export interface RewardTarget {
  readonly member: number
  /** Which of the four moves to overwrite. Only read by 'teach'. */
  readonly slot?: number
}

export const REWARD_CONFIG = {
  /** How many are put in front of the player after a win. */
  choices: 3,
  /** Levels the whole party gains from レベルアップ. */
  levelsGained: 2,
  /** Fraction of maximum HP a revived Pokemon comes back with. */
  reviveFraction: 0.5,
  /** The party cannot grow past this. */
  maxPartySize: 6,
  /** Moves a Pokemon knows at once, which is what makes teaching a trade. */
  movesKnown: 4,
} as const

/**
 * Whether two offers are the same offer.
 *
 * By value, not identity: an offer that has been through a save and back is a
 * different object holding the same thing, and refusing it would mean a reload
 * mid-choice left the player unable to take what is on the screen.
 */
export function sameOffer(a: RewardOffer, b: RewardOffer): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'teach' && b.kind === 'teach') return a.move.id === b.move.id
  if (a.kind === 'item' && b.kind === 'item') return a.item === b.item
  return true
}

/** True for a reward the player has to point at somebody. */
export function needsTarget(offer: RewardOffer): boolean {
  return offer.kind === 'teach' || offer.kind === 'item'
}

/** Members a given reward can sensibly be aimed at. */
export function targetsFor(
  offer: RewardOffer,
  members: readonly BattlePokemon[],
): readonly number[] {
  return (
    members
      .map((member, index) => ({ member, index }))
      // A fainted Pokemon is out of the run; teaching or arming it is a wasted
      // reward, so it is not offered as a target at all.
      .filter(({ member }) => !isFainted(member))
      .filter(({ member }) => {
        if (offer.kind === 'item') return member.item === null
        if (offer.kind === 'teach') {
          // Not just "does not know it" -- "could ever know it". Offering a
          // move a species never learns is not a hard choice, it is a wrong
          // one, and it was the first thing a player noticed.
          return (
            !member.moves.some((m) => m.id === offer.move.id) &&
            canLearn(member.species, offer.move)
          )
        }
        return true
      })
      .map(({ index }) => index)
  )
}

/**
 * Which rewards are worth offering for this party.
 *
 * A reward that would do nothing -- healing a party already at full health,
 * reviving when nobody is down -- is left out rather than offered as a dud.
 */
export function availableRewards(
  members: readonly BattlePokemon[],
): readonly RewardKind[] {
  // 'teach' is deliberately absent: it is offered beside the three rather than
  // as one of them. Measured, a run ends when the party runs out of bodies, so
  // a reward that does not keep one standing loses to そせい and なかま every
  // time (21% clears against 30%). Making the player trade a body for a move
  // is not a choice, it is a trap, so teaching does not cost the pick.
  const kinds: RewardKind[] = ['levelUp']
  if (members.some((m) => !isFainted(m) && m.currentHp < m.stats.hp)) kinds.push('heal')
  if (members.some(isFainted)) kinds.push('revive')
  if (members.length < REWARD_CONFIG.maxPartySize) kinds.push('recruit')
  // Only worth offering while somebody still has empty hands.
  if (members.some((m) => !isFainted(m) && m.item === null)) kinds.push('item')
  return kinds
}

/** Fill in what a kind is actually handing over, where it hands over anything. */
function dress(kind: RewardKind, random: Random): RewardOffer | null {
  if (kind === 'item') {
    const [item] = sample(ITEM_KINDS, 1, random)
    return item ? { kind, item } : null
  }
  return { kind } as RewardOffer
}

/**
 * A move to offer the party, or null if they already know everything.
 *
 * Drawn from what nobody in the party has, so the offer is never a dud, and
 * kept separate from the three rewards -- see `availableRewards`.
 */
export function offerMove(
  members: readonly BattlePokemon[],
  random: Random = Math.random,
): Move | null {
  // Somebody standing has to be able to take it, or the offer is a dud the
  // player cannot act on.
  const takers = members.filter((member) => !isFainted(member))
  const pool = MOVE_LIST.filter((move) =>
    takers.some(
      (member) =>
        !member.moves.some((known) => known.id === move.id) &&
        canLearn(member.species, move),
    ),
  )
  return sample(pool, 1, random)[0] ?? null
}

export function offerRewards(
  members: readonly BattlePokemon[],
  random: Random = Math.random,
): readonly RewardOffer[] {
  return sample(availableRewards(members), REWARD_CONFIG.choices, random)
    .map((kind) => dress(kind, random))
    .filter((offer): offer is RewardOffer => offer !== null)
    .filter((offer) => !needsTarget(offer) || targetsFor(offer, members).length > 0)
}

function healed(member: BattlePokemon): BattlePokemon {
  return isFainted(member) ? member : { ...member, currentHp: member.stats.hp }
}

function revived(member: BattlePokemon): BattlePokemon {
  return {
    ...member,
    currentHp: Math.max(1, Math.floor(member.stats.hp * REWARD_CONFIG.reviveFraction)),
    status: null,
  }
}

/**
 * A level up keeps the damage already taken rather than the HP figure, so the
 * larger maximum is felt as a little healing rather than a larger hole.
 */
function levelled(member: BattlePokemon): BattlePokemon {
  const level = member.level + REWARD_CONFIG.levelsGained
  const stats = statsAtLevel(member.species.baseStats, level)
  if (isFainted(member)) return { ...member, level, stats, currentHp: 0 }
  const missing = member.stats.hp - member.currentHp
  return { ...member, level, stats, currentHp: Math.max(1, stats.hp - missing) }
}

/** Swap one of a Pokemon's four moves for another. */
function taught(member: BattlePokemon, move: Move, slot: number): BattlePokemon {
  if (slot < 0 || slot >= member.moves.length) return member
  if (member.moves.some((known) => known.id === move.id)) return member
  if (!canLearn(member.species, move)) return member
  return {
    ...member,
    moves: member.moves.map((known, index) => (index === slot ? move : known)),
  }
}

/**
 * Take the move on offer, or leave the party as it is.
 *
 * Separate from `applyReward` because it is separate from the reward: taking a
 * move does not cost the pick, so it is not one of the three.
 */
export function teachMove(
  members: readonly BattlePokemon[],
  move: Move,
  target: RewardTarget,
): readonly BattlePokemon[] {
  const offer: RewardOffer = { kind: 'teach', move }
  if (!targetsFor(offer, members).includes(target.member)) return members
  return members.map((member, at) =>
    at === target.member ? taught(member, move, target.slot ?? 0) : member,
  )
}

/**
 * Apply the reward the player chose to the party going into the next battle.
 *
 * A target that does not make sense is ignored rather than forced somewhere
 * else: silently arming a different Pokemon than the one that was tapped is
 * worse than the reward doing nothing.
 */
export function applyReward(
  members: readonly BattlePokemon[],
  offer: RewardOffer,
  target: RewardTarget | null = null,
  random: Random = Math.random,
): readonly BattlePokemon[] {
  switch (offer.kind) {
    case 'heal':
      return members.map(healed)

    case 'revive': {
      const index = members.findIndex(isFainted)
      if (index === -1) return members
      return members.map((member, at) => (at === index ? revived(member) : member))
    }

    case 'levelUp':
      return members.map(levelled)

    case 'item': {
      const index = target?.member ?? targetsFor(offer, members)[0]
      if (index === undefined || !targetsFor(offer, members).includes(index)) {
        return members
      }
      return members.map((member, at) =>
        at === index ? { ...member, item: offer.item } : member,
      )
    }

    case 'teach': {
      const index = target?.member
      if (index === undefined || !targetsFor(offer, members).includes(index)) {
        return members
      }
      const slot = target?.slot ?? 0
      return members.map((member, at) =>
        at === index ? taught(member, offer.move, slot) : member,
      )
    }

    case 'recruit': {
      if (members.length >= REWARD_CONFIG.maxPartySize) return members
      // Someone the party does not already have, where the roster allows it.
      const held = new Set(members.map((m) => m.species.id))
      const pool = SPECIES_LIST.filter((species) => !held.has(species.id))
      const [species] = sample(pool.length > 0 ? pool : SPECIES_LIST, 1, random)
      if (!species) return members
      const level = members[0]?.level ?? 1
      return [...members, createBattlePokemon(species, level)]
    }
  }
}
