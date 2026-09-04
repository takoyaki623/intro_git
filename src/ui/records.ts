import type { BattlePokemon } from '../domain/entities'
import type { RunState } from '../domain/run'
import { ALL_SPECIES } from '../data/species'

const KEY = 'pokemon-battle:best'
/** Bumped when the shape below changes, so an old record is dropped, not misread. */
const VERSION = 1

export interface RecordedPokemon {
  readonly speciesId: string
  readonly name: string
  readonly level: number
}

/** The best streak so far, and the party that managed it. */
export interface BestRun {
  readonly wins: number
  readonly party: readonly RecordedPokemon[]
  /** ISO date, for showing when the record was set. */
  readonly achievedOn: string
  /** Whether the run went all the way. Absent in older records; read as false. */
  readonly cleared: boolean
}

interface StoredBest extends BestRun {
  readonly version: number
}

const record = (member: BattlePokemon): RecordedPokemon => ({
  speciesId: member.species.id,
  name: member.species.name,
  level: member.level,
})

export function loadBest(storage: Storage = localStorage): BestRun | null {
  let stored: StoredBest
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return null
    stored = JSON.parse(raw) as StoredBest
  } catch {
    return null
  }

  if (stored?.version !== VERSION) return null
  if (!Number.isInteger(stored.wins) || stored.wins < 0) return null
  if (!Array.isArray(stored.party)) return null
  // The name is stored so a record survives a species being renamed, but fall
  // back to the current data when it is missing.
  const party = stored.party.map((member) => ({
    ...member,
    name:
      member.name ??
      ALL_SPECIES.find((s) => s.id === member.speciesId)?.name ??
      member.speciesId,
  }))
  return {
    wins: stored.wins,
    party,
    achievedOn: stored.achievedOn,
    cleared: stored.cleared === true,
  }
}

/**
 * Write the run down if it beat the standing record.
 *
 * Returns whatever the record is afterwards, so a caller can tell a new best
 * from an unchanged one by comparing.
 */
export function recordRun(
  run: RunState,
  storage: Storage = localStorage,
  today: () => Date = () => new Date(),
): BestRun | null {
  const best = loadBest(storage)
  // A run that won nothing is not a record. Writing it down would put "best: 0"
  // on the screen, which tells the player nothing and reads as a bug.
  if (run.wins === 0) return best
  if (best && run.wins <= best.wins) return best

  const fresh: StoredBest = {
    version: VERSION,
    wins: run.wins,
    party: run.battle.player.members.map(record),
    achievedOn: today().toISOString().slice(0, 10),
    cleared: run.cleared,
  }
  try {
    storage.setItem(KEY, JSON.stringify(fresh))
  } catch {
    // A blocked store should not interrupt the end of a run.
    return best
  }
  return fresh
}

export function clearBest(storage: Storage = localStorage): void {
  try {
    storage.removeItem(KEY)
  } catch {
    // Nothing useful to do if the store refuses.
  }
}
