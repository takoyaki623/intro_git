import type { Random } from './damage'

/**
 * Pick `count` distinct entries, without disturbing the pool it was given.
 *
 * Shared rather than copied: the run, the reward offer and the draft all deal
 * from a roster, and three copies of the same loop would drift apart the first
 * time one of them was tuned.
 */
export function sample<T>(pool: readonly T[], count: number, random: Random): T[] {
  const remaining = [...pool]
  const picked: T[] = []
  while (picked.length < count && remaining.length > 0) {
    const [item] = remaining.splice(Math.floor(random() * remaining.length), 1)
    if (item) picked.push(item)
  }
  return picked
}
