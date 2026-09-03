export type ItemKind = 'leftovers' | 'focusSash' | 'expertBelt' | 'sitrusBerry'

export const ITEM_KINDS: readonly ItemKind[] = [
  'leftovers',
  'focusSash',
  'expertBelt',
  'sitrusBerry',
]

/** Healed at the end of every turn by たべのこし. */
export const LEFTOVERS_FRACTION = 1 / 16
/** Restored by オボンのみ, once, when health falls below the threshold. */
export const SITRUS_FRACTION = 1 / 4
export const SITRUS_THRESHOLD = 1 / 2
/** How much たつじんのおび adds to a super-effective hit. */
export const EXPERT_BELT_MULTIPLIER = 1.2

/** Whether the item holds a Pokemon at 1 HP through a fatal blow. */
export function enduresWith(item: ItemKind | null): boolean {
  return item === 'focusSash'
}

export function healsEachTurn(item: ItemKind | null): boolean {
  return item === 'leftovers'
}

/** The multiplier the item adds, given how effective the move was. */
export function damageMultiplier(item: ItemKind | null, effectiveness: number): number {
  return item === 'expertBelt' && effectiveness > 1 ? EXPERT_BELT_MULTIPLIER : 1
}

/**
 * How much オボンのみ restores, or zero when it should not fire.
 *
 * It waits for health to fall below the threshold, so it is spent on a blow
 * that mattered rather than on the first scratch.
 */
export function berryHealing(
  item: ItemKind | null,
  currentHp: number,
  maxHp: number,
): number {
  if (item !== 'sitrusBerry' || currentHp <= 0) return 0
  if (currentHp >= maxHp * SITRUS_THRESHOLD) return 0
  return Math.max(1, Math.floor(maxHp * SITRUS_FRACTION))
}
