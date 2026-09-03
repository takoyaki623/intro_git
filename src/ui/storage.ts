import type { BattlePokemon, Side, TeamState } from '../domain/entities'
import {
  activePokemon,
  createBattlePokemon,
  createTeam,
  withActive,
} from '../domain/entities'
import type { Status } from '../domain/status'
import type { BattleState } from '../domain/battle'
import type { RunState } from '../domain/run'
import type { RewardKind } from '../domain/rewards'
import { REWARD_CONFIG } from '../domain/rewards'
import { SPECIES } from '../data/species'

const KEY = 'pokemon-battle:run'
/** Bumped when the shape below changes, so an old save is dropped rather than misread. */
const VERSION = 1

interface StoredPokemon {
  readonly speciesId: string
  readonly level: number
  readonly currentHp: number
  readonly status: Status | null
}

interface StoredTeam {
  readonly members: readonly StoredPokemon[]
  readonly activeIndex: number
}

interface StoredRun {
  readonly version: number
  readonly wins: number
  readonly finished: boolean
  /** Saved so a reload while choosing does not reshuffle the rewards. */
  readonly offer: readonly RewardKind[] | null
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
  })),
})

function restorePokemon(stored: StoredPokemon): BattlePokemon | null {
  const species = Object.values(SPECIES).find((entry) => entry.id === stored.speciesId)
  if (!species) return null
  if (!Number.isFinite(stored.level) || stored.level < 1) return null

  const base = createBattlePokemon(species, stored.level)
  const currentHp = Math.max(0, Math.min(base.stats.hp, stored.currentHp))
  if (!Number.isFinite(currentHp)) return null
  return { ...base, currentHp, status: stored.status ?? null }
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

export function saveRun(run: RunState, storage: Storage = localStorage): void {
  const payload: StoredRun = {
    version: VERSION,
    wins: run.wins,
    finished: run.finished,
    offer: run.offer,
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
    events: [{ kind: 'encounter', pokemon: activePokemon(opponent).species.name }],
    winner: stored.winner ?? null,
    awaitingSwitch: stored.awaitingSwitch ?? null,
  }
  const kinds: readonly RewardKind[] = ['heal', 'revive', 'levelUp', 'recruit']
  const offer = Array.isArray(stored.offer)
    ? stored.offer.filter((kind): kind is RewardKind => kinds.includes(kind))
    : null

  return {
    battle,
    wins: stored.wins,
    finished: stored.finished === true,
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
