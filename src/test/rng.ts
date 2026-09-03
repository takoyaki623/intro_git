import type { Random } from '../domain/damage'

/** Yields the given values in order, then repeats the last one. */
export function scriptedRandom(...values: number[]): Random {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}

/** Always returns the same value -- handy for pinning one roll. */
export function fixedRandom(value: number): Random {
  return () => value
}
