import type { BattlePokemon, Side, Species, TeamState } from '../domain/entities'
import {
  activePokemon,
  createBattlePokemon,
  createTeam,
  withActive,
} from '../domain/entities'
import type { Status } from '../domain/status'
import type { ItemKind } from '../domain/items'
import { ITEM_KINDS } from '../domain/items'
import type { BattleState } from '../domain/battle'
import type { RunState } from '../domain/run'
import { isFinalBattle } from '../domain/run'
import { FIRST_TIER, clampTier } from '../domain/tiers'
import type { RewardOffer } from '../domain/rewards'
import { REWARD_CONFIG, REWARD_KINDS } from '../domain/rewards'
import { MOVE_LIST } from '../data/moves'
import type { DraftState } from '../domain/draft'
import { DRAFT_CONFIG } from '../domain/draft'
import { ALL_SPECIES, SPECIES } from '../data/species'

const KEY = 'pokemon-battle:run'
/** Bumped when the shape below changes, so an old save is dropped rather than misread. */
const VERSION = 1

interface StoredPokemon {
  readonly speciesId: string
  readonly level: number
  readonly currentHp: number
  readonly status: Status | null
  readonly item: ItemKind | null
}

interface StoredTeam {
  readonly members: readonly StoredPokemon[]
  readonly activeIndex: number
}

interface StoredOffer {
  readonly kind: string
  /** The move a teach offer hands over, or the item an item offer does. */
  readonly id?: string
}

interface StoredRun {
  readonly version: number
  readonly wins: number
  readonly finished: boolean
  /**
   * Saved so a reload while choosing does not reshuffle the rewards.
   *
   * Written as kind plus an id, not the whole move or item: the same rule the
   * party follows, so a save stays small and never goes stale against src/data.
   */
  readonly offer: readonly StoredOffer[] | null
  /** The move on offer beside the rewards, by id. */
  readonly moveOffer?: string | null
  /** Absent in saves written before the run had an ending; read as false. */
  readonly cleared?: boolean
  /** Absent in saves written before tiers existed; read as the first tier. */
  readonly tier?: number
  readonly winner: Side | null
  readonly awaitingSwitch: Side | null
  readonly player: StoredTeam
  readonly opponent: StoredTeam
}

/**
 * Only what cannot be rebuilt is written down: which species, at what level,
 * how hurt, and how the battle stands. Species and move data come back from
 * src/data on load, so a save stays small and never goes stale against them.
 *
 * The battle log is deliberately not saved. It is a record of what the player
 * already watched, and rebuilding it would mean storing every event of a run.
 */
const storeTeam = (team: TeamState): StoredTeam => ({
  activeIndex: team.activeIndex,
  members: team.members.map((member) => ({
    speciesId: member.species.id,
    level: member.level,
    currentHp: member.currentHp,
    status: member.status,
    item: member.item,
  })),
})

function restorePokemon(stored: StoredPokemon): BattlePokemon | null {
  // ALL_SPECIES, not the draft pool: a save taken during the last battle is
  // holding the boss, which is deliberately not in SPECIES.
  const species = ALL_SPECIES.find((entry) => entry.id === stored.speciesId)
  if (!species) return null
  if (!Number.isFinite(stored.level) || stored.level < 1) return null

  const base = createBattlePokemon(species, stored.level)
  const currentHp = Math.max(0, Math.min(base.stats.hp, stored.currentHp))
  if (!Number.isFinite(currentHp)) return null
  const item = ITEM_KINDS.includes(stored.item as ItemKind) ? stored.item : null
  return { ...base, currentHp, status: stored.status ?? null, item }
}

function restoreTeam(stored: StoredTeam): TeamState | null {
  if (!Array.isArray(stored?.members) || stored.members.length === 0) return null

  const members = stored.members.map(restorePokemon)
  if (members.some((member) => member === null)) return null

  const team = createTeam(members as BattlePokemon[])
  const index = stored.activeIndex
  if (!Number.isInteger(index) || index < 0 || index >= members.length) return null
  return withActive(team, index)
}

/**
 * An offer from a save, or null if it names something the game no longer has.
 *
 * Checked against REWARD_KINDS rather than a list copied out here, which had
 * gone stale once already and was quietly dropping a saved item reward.
 */
function restoreOffer(stored: StoredOffer): RewardOffer | null {
  const kind = stored?.kind
  if (!REWARD_KINDS.includes(kind as never)) return null

  if (kind === 'teach') {
    const move = MOVE_LIST.find((entry) => entry.id === stored.id)
    return move ? { kind, move } : null
  }
  if (kind === 'item') {
    return ITEM_KINDS.includes(stored.id as ItemKind)
      ? { kind, item: stored.id as ItemKind }
      : null
  }
  return { kind } as RewardOffer
}

export function saveRun(run: RunState, storage: Storage = localStorage): void {
  const payload: StoredRun = {
    version: VERSION,
    wins: run.wins,
    finished: run.finished,
    cleared: run.cleared,
    tier: run.tier,
    offer:
      run.offer?.map((offer) => ({
        kind: offer.kind,
        ...(offer.kind === 'teach'
          ? { id: offer.move.id }
          : offer.kind === 'item'
            ? { id: offer.item }
            : {}),
      })) ?? null,
    moveOffer: run.moveOffer?.id ?? null,
    winner: run.battle.winner,
    awaitingSwitch: run.battle.awaitingSwitch,
    player: storeTeam(run.battle.player),
    opponent: storeTeam(run.battle.opponent),
  }
  try {
    storage.setItem(KEY, JSON.stringify(payload))
  } catch {
    // A full or blocked store is not worth interrupting a battle over.
  }
}

/** The saved run, or null if there is none, it is unreadable, or it is stale. */
export function loadRun(storage: Storage = localStorage): RunState | null {
  let stored: StoredRun
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return null
    stored = JSON.parse(raw) as StoredRun
  } catch {
    return null
  }

  if (stored?.version !== VERSION) return null

  const player = restoreTeam(stored.player)
  const opponent = restoreTeam(stored.opponent)
  if (!player || !opponent) return null
  if (!Number.isInteger(stored.wins) || stored.wins < 0) return null

  const battle: BattleState = {
    player,
    opponent,
    events: [
      {
        kind: 'encounter',
        pokemon: activePokemon(opponent).species.name,
        final: isFinalBattle(stored.wins),
      },
    ],
    winner: stored.winner ?? null,
    awaitingSwitch: stored.awaitingSwitch ?? null,
  }
  const offer = Array.isArray(stored.offer)
    ? stored.offer
        .map(restoreOffer)
        .filter((entry): entry is RewardOffer => entry !== null)
    : null

  return {
    battle,
    wins: stored.wins,
    finished: stored.finished === true,
    cleared: stored.cleared === true,
    tier: clampTier(stored.tier ?? FIRST_TIER),
    moveOffer: MOVE_LIST.find((move) => move.id === stored.moveOffer) ?? null,
    offer: offer && offer.length > 0 ? offer.slice(0, REWARD_CONFIG.choices) : null,
  }
}

export function clearRun(storage: Storage = localStorage): void {
  try {
    storage.removeItem(KEY)
  } catch {
    // Nothing useful to do if the store refuses.
  }
}

const DRAFT_KEY = 'pokemon-battle:draft'

interface StoredDraft {
  readonly version: number
  readonly candidateIds: readonly string[]
  readonly pickedIds: readonly string[]
  /** Absent in drafts saved before tiers existed; read as the first tier. */
  readonly tier?: number
}

/**
 * The draft is saved the moment it is dealt, before a single pick.
 *
 * Otherwise a reload during the choice would deal six fresh candidates, and a
 * player who did not like their offer could reload until they did -- which
 * would put the run back in the hands of the draw the draft exists to tame.
 */
export function saveDraft(draft: DraftState, storage: Storage = localStorage): void {
  const payload: StoredDraft = {
    version: VERSION,
    candidateIds: draft.candidates.map((species) => species.id),
    pickedIds: draft.picked,
    tier: draft.tier,
  }
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(payload))
  } catch {
    // A blocked store costs a re-deal at worst; not worth blocking the screen.
  }
}

/** The draft in progress, or null if there is none or it cannot be read. */
export function loadDraft(storage: Storage = localStorage): DraftState | null {
  let stored: StoredDraft
  try {
    const raw = storage.getItem(DRAFT_KEY)
    if (!raw) return null
    stored = JSON.parse(raw) as StoredDraft
  } catch {
    return null
  }

  if (stored?.version !== VERSION) return null
  if (!Array.isArray(stored.candidateIds) || !Array.isArray(stored.pickedIds)) return null

  const candidates = stored.candidateIds.map((id) =>
    Object.values(SPECIES).find((species) => species.id === id),
  )
  if (candidates.length === 0 || candidates.some((species) => !species)) return null

  const found = candidates as Species[]
  const ids = new Set(found.map((species) => species.id))
  // A pick for a species not on the table would let a tampered save field
  // anything at all, so the picks are trusted only as far as the candidates go.
  const picked = stored.pickedIds
    .filter((id): id is string => typeof id === 'string' && ids.has(id))
    .slice(0, DRAFT_CONFIG.picks)

  return {
    candidates: found,
    picked: [...new Set(picked)],
    tier: clampTier(stored.tier ?? FIRST_TIER),
  }
}

export function clearDraft(storage: Storage = localStorage): void {
  try {
    storage.removeItem(DRAFT_KEY)
  } catch {
    // Nothing useful to do if the store refuses.
  }
}
