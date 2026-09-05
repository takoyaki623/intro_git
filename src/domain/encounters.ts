import type { BattlePokemon, Species, TeamState } from './entities'
import { createBattlePokemon, createTeam } from './entities'
import type { Random } from './damage'
import { sample } from './sample'
import { ITEM_KINDS } from './items'
import { BOSS_LIST, SPECIES_LIST } from '../data/species'

/** What shape the next battle takes. */
export type EncounterKind = 'normal' | 'elite' | 'boss'

export const ENCOUNTER_CONFIG = {
  /** How many of the ordinary sort a party faces at once. */
  partySize: 3,
  /**
   * The elite: one Pokemon, a few levels up, with several times the health.
   *
   * Health rather than power, and deliberately. Measured, this game punishes
   * every kind of investment -- setting up, inflicting a condition, teaching a
   * move -- for one reason: the opposing party is replaced every battle, so
   * anything spent on it evaporates before it pays. A bot that never touched a
   * status move cleared as often as one that used them well (19.8% against
   * 19.5%), which makes nine of the forty-nine moves decoration.
   *
   * A fight that lasts is where setting up has room to pay for itself, which
   * is why the health comes first. The levels are what stop the road being
   * free: at three levels up it cleared 40.6% of runs against 19.4% for the
   * ordinary road -- easier *and* worth two rewards, which is not a choice.
   * At ten it clears 15.6%, so taking one is buying rewards with risk, and
   * taking every one of them is a worse plan than picking your moments.
   */
  eliteLevelBonus: 10,
  eliteHealth: 2.6,
  /** Rewards for beating one. The reason to take the harder road. */
  eliteRewards: 2,
  normalRewards: 1,
} as const

/** How many reward picks beating this encounter is worth. */
export function rewardsFor(kind: EncounterKind): number {
  return kind === 'normal'
    ? ENCOUNTER_CONFIG.normalRewards
    : ENCOUNTER_CONFIG.eliteRewards
}

/** Give a Pokemon the deep health that makes a fight last. */
function enlarged(pokemon: BattlePokemon, multiplier: number): BattlePokemon {
  const hp = Math.floor(pokemon.stats.hp * multiplier)
  return { ...pokemon, stats: { ...pokemon.stats, hp }, currentHp: hp }
}

/**
 * Hand out held items to the front of the party.
 *
 * The front, not at random, so the player meets the item rather than finding
 * out about it on the third Pokemon of a battle already decided.
 */
function armed(
  members: readonly BattlePokemon[],
  count: number,
  random: Random,
): readonly BattlePokemon[] {
  if (count <= 0) return members
  return members.map((member, index) => {
    if (index >= count) return member
    const [item] = sample(ITEM_KINDS, 1, random)
    return item ? { ...member, item } : member
  })
}

/** The party waiting on the other side, for an encounter of this shape. */
export function makeEncounter(
  kind: EncounterKind,
  level: number,
  items: number,
  random: Random,
): TeamState {
  if (kind === 'boss') {
    const [boss] = sample(BOSS_LIST, 1, random)
    const species = boss ?? SPECIES_LIST[0]
    if (!species) throw new Error('no species to build an encounter from')
    return createTeam(armed([createBattlePokemon(species, level)], items, random))
  }

  if (kind === 'elite') {
    const [species] = sample(SPECIES_LIST, 1, random)
    if (!species) throw new Error('no species to build an encounter from')
    const raised = createBattlePokemon(species, level + ENCOUNTER_CONFIG.eliteLevelBonus)
    return createTeam(
      armed([enlarged(raised, ENCOUNTER_CONFIG.eliteHealth)], items, random),
    )
  }

  const roster: readonly Species[] = sample(
    SPECIES_LIST,
    ENCOUNTER_CONFIG.partySize,
    random,
  )
  return createTeam(
    armed(
      roster.map((species) => createBattlePokemon(species, level)),
      items,
      random,
    ),
  )
}

/**
 * The two roads out of a win, built rather than named.
 *
 * Built, because a blind choice is not a choice: the player picks between
 * "イワーク が 1 ぴき" and three faces they can read, and the whole point is
 * deciding whether their party wants a long fight or a short one.
 */
export function makeRoute(
  level: number,
  items: number,
  random: Random,
): readonly { readonly kind: EncounterKind; readonly team: TeamState }[] {
  return [
    { kind: 'normal' as const, team: makeEncounter('normal', level, items, random) },
    { kind: 'elite' as const, team: makeEncounter('elite', level, items, random) },
  ]
}
