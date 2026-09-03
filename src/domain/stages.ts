export type StatKey = 'attack' | 'defense' | 'specialAttack' | 'specialDefense' | 'speed'

/** How far each stat has been pushed, from -6 to +6. */
export type StatStages = Readonly<Record<StatKey, number>>

export const STAT_KEYS: readonly StatKey[] = [
  'attack',
  'defense',
  'specialAttack',
  'specialDefense',
  'speed',
]

export const NO_STAGES: StatStages = {
  attack: 0,
  defense: 0,
  specialAttack: 0,
  specialDefense: 0,
  speed: 0,
}

export const MAX_STAGE = 6
export const MIN_STAGE = -6

/**
 * What a stage is worth, following the main series: each step up adds a half
 * to the numerator, each step down adds one to the denominator. +2 is double,
 * -2 is half.
 */
export function stageMultiplier(stage: number): number {
  const clamped = Math.max(MIN_STAGE, Math.min(MAX_STAGE, stage))
  return clamped >= 0 ? (2 + clamped) / 2 : 2 / (2 - clamped)
}

/** A stat after its stage is taken into account. */
export function stagedStat(base: number, stage: number): number {
  return Math.max(1, Math.floor(base * stageMultiplier(stage)))
}

export interface StageChange {
  readonly stages: StatStages
  /**
   * How much actually moved. Zero when the stat was already at its limit,
   * which the battle log calls out rather than passing over in silence.
   */
  readonly applied: number
}

export function changeStage(
  stages: StatStages,
  stat: StatKey,
  delta: number,
): StageChange {
  const next = Math.max(MIN_STAGE, Math.min(MAX_STAGE, stages[stat] + delta))
  return { stages: { ...stages, [stat]: next }, applied: next - stages[stat] }
}

export function hasAnyStage(stages: StatStages): boolean {
  return STAT_KEYS.some((key) => stages[key] !== 0)
}
