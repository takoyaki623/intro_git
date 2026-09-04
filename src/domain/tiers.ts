/**
 * Difficulty tiers: the same six battles, met by a stronger field.
 *
 * A run that can be cleared is a run that stops asking anything once it has
 * been cleared. Tiers give the clear somewhere to go: beating one opens the
 * next, and the party that carried tier 1 is not the party that survives
 * tier 5.
 *
 * Level is the whole escalation, deliberately. It is the one knob the
 * difficulty has already been measured against, it lifts the opposing party
 * and the boss together, and it needs no new rules for the player to learn --
 * the game they cleared is the game they are playing, wound tighter.
 */
export const TIER_CONFIG = {
  /** Tier 1 is where everyone starts; there is nothing above this one. */
  max: 5,
  /**
   * Added to the opposing party's starting level for each tier above the first.
   *
   * Three was the first try and made the top tier a wall: the same bot cleared
   * tier 5 in 0.2% of runs, which is not difficulty, it is a closed door. At
   * two the ladder roughly halves each step -- 26 / 14 / 8 / 4 / 4 percent --
   * so every tier is harder than the last and none of them is impossible.
   */
  levelStep: 2,
} as const

export const FIRST_TIER = 1

/** Levels the opposition starts ahead by, for a run at this tier. */
export function tierLevelBonus(tier: number): number {
  return (clampTier(tier) - FIRST_TIER) * TIER_CONFIG.levelStep
}

/** A tier that exists, whatever it was handed -- a bad save, or a stale link. */
export function clampTier(tier: number): number {
  if (!Number.isInteger(tier)) return FIRST_TIER
  return Math.max(FIRST_TIER, Math.min(TIER_CONFIG.max, tier))
}

/**
 * Which tiers can be played, given the highest one cleared so far.
 *
 * One step ahead of the record and no further: the point is that each tier is
 * earned, and skipping to the top would just be a wall with no run behind it.
 */
export function isTierUnlocked(tier: number, cleared: number): boolean {
  return tier >= FIRST_TIER && tier <= Math.min(TIER_CONFIG.max, cleared + 1)
}

/** The hardest tier the player is allowed into right now. */
export function highestUnlocked(cleared: number): number {
  return clampTier(cleared + 1)
}

/** Tier N+1, or null when there is nothing above what was just cleared. */
export function nextTier(tier: number): number | null {
  return tier < TIER_CONFIG.max ? tier + 1 : null
}
