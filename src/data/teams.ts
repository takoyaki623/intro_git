import type { Species } from '../domain/entities'
import { SPECIES } from './species'

/**
 * The two parties. Picked so the type chart actually bites: フシギダネ walls
 * ゼニガメ, ピカチュウ handles ズバット, and イシツブテ punishes ピカチュウ --
 * which is what makes switching a decision rather than a formality.
 */
export const PLAYER_TEAM: readonly Species[] = [
  SPECIES.pikachu,
  SPECIES.charmander,
  SPECIES.bulbasaur,
]

export const OPPONENT_TEAM: readonly Species[] = [
  SPECIES.squirtle,
  SPECIES.zubat,
  SPECIES.geodude,
]
