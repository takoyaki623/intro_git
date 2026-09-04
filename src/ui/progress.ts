import { FIRST_TIER, TIER_CONFIG, clampTier } from '../domain/tiers'

const KEY = 'pokemon-battle:progress'
/** Bumped when the shape below changes, so an old record is dropped, not misread. */
const VERSION = 1

interface StoredProgress {
  readonly version: number
  /** The highest tier cleared. Zero means none yet, so only tier 1 is open. */
  readonly cleared: number
}

/**
 * How far the player has got, kept apart from any one run.
 *
 * A run is thrown away every time one ends; what tiers are open has to outlive
 * that, so it lives in its own key rather than riding along with the save.
 */
export function loadProgress(storage: Storage = localStorage): number {
  let stored: StoredProgress
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return 0
    stored = JSON.parse(raw) as StoredProgress
  } catch {
    return 0
  }

  if (stored?.version !== VERSION) return 0
  if (!Number.isInteger(stored.cleared) || stored.cleared < 0) return 0
  return Math.min(TIER_CONFIG.max, stored.cleared)
}

/**
 * Record that a tier was cleared, and return what is unlocked afterwards.
 *
 * Never moves backwards: clearing tier 1 again after reaching tier 4 does not
 * take the later tiers away.
 */
export function recordClear(tier: number, storage: Storage = localStorage): number {
  const standing = loadProgress(storage)
  const cleared = Math.max(standing, clampTier(tier))
  if (cleared === standing) return standing

  try {
    storage.setItem(
      KEY,
      JSON.stringify({ version: VERSION, cleared } satisfies StoredProgress),
    )
  } catch {
    // A blocked store costs the unlock, not the run that earned it.
    return standing
  }
  return cleared
}

export function clearProgress(storage: Storage = localStorage): void {
  try {
    storage.removeItem(KEY)
  } catch {
    // Nothing useful to do if the store refuses.
  }
}

export { FIRST_TIER }
