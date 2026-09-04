import type { Move, Species } from './entities'

/**
 * Moves anything can be taught.
 *
 * The plain normal-type ones, plus どくどく -- the machine moves that in the
 * main series almost every Pokemon can pick up. Keeping them out of the type
 * rule below would leave several species with nothing to learn at all.
 */
export const UNIVERSAL_MOVE_IDS: readonly string[] = [
  'tackle',
  'scratch',
  'quickAttack',
  'doubleEdge',
  'leer',
  'growl',
  'swordsDance',
  'toxic',
]

/**
 * Whether this species could ever know this move.
 *
 * Three ways in, in order of how obvious they are:
 *
 * 1. it already knows it,
 * 2. the move is one of its own types -- a Pokemon can nearly always use the
 *    element it is made of,
 * 3. the species names it in `learns`, which is where the machine moves live:
 *    ピカチュウ and アイアンテール, ミニリュウ and れいとうビーム.
 *
 * The rule exists because the reward that teaches a move was drawing from all
 * forty-nine of them. Offering コイル a じゃれつく is not a hard choice, it is
 * a wrong one, and it was the first thing a player noticed.
 */
export function canLearn(species: Species, move: Move): boolean {
  if (species.moves.some((known) => known.id === move.id)) return true
  if (species.types.includes(move.type)) return true
  if (UNIVERSAL_MOVE_IDS.includes(move.id)) return true
  return species.learns?.includes(move.id) === true
}
