import type { BattlePokemon } from './entities'
import { createBattlePokemon, isFainted, statsAtLevel } from './entities'
import type { Random } from './damage'
import { SPECIES_LIST } from '../data/species'

export type RewardKind = 'heal' | 'revive' | 'levelUp' | 'recruit'

export const REWARD_CONFIG = {
  /** How many are put in front of the player after a win. */
  choices: 3,
  /** Levels the whole party gains from レベルアップ. */
  levelsGained: 2,
  /** Fraction of maximum HP a revived Pokemon comes back with. */
  reviveFraction: 0.5,
  /** The party cannot grow past this. */
  maxPartySize: 6,
} as const

/**
 * Which rewards are worth offering for this party.
 *
 * A reward that would do nothing -- healing a party already at full health,
 * reviving when nobody is down -- is left out rather than offered as a dud.
 */
export function availableRewards(
  members: readonly BattlePokemon[],
): readonly RewardKind[] {
  const kinds: RewardKind[] = ['levelUp']
  if (members.some((m) => !isFainted(m) && m.currentHp < m.stats.hp)) kinds.push('heal')
  if (members.some(isFainted)) kinds.push('revive')
  if (members.length < REWARD_CONFIG.maxPartySize) kinds.push('recruit')
  return kinds
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

export function offerRewards(
  members: readonly BattlePokemon[],
  random: Random = Math.random,
): readonly RewardKind[] {
  return sample(availableRewards(members), REWARD_CONFIG.choices, random)
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

/** Apply the reward the player chose to the party going into the next battle. */
export function applyReward(
  members: readonly BattlePokemon[],
  kind: RewardKind,
  random: Random = Math.random,
): readonly BattlePokemon[] {
  switch (kind) {
    case 'heal':
      return members.map(healed)

    case 'revive': {
      const target = members.findIndex(isFainted)
      if (target === -1) return members
      return members.map((member, index) => (index === target ? revived(member) : member))
    }

    case 'levelUp':
      return members.map(levelled)

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
