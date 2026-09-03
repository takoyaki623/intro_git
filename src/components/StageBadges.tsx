import type { StatStages } from '../domain/stages'
import { STAT_KEYS } from '../domain/stages'
import { STAT_NAMES } from '../ui/messages'

interface Props {
  stages: StatStages
}

/** The stats currently pushed away from normal, and by how far. */
export function StageBadges({ stages }: Props) {
  const moved = STAT_KEYS.filter((stat) => stages[stat] !== 0)
  if (moved.length === 0) return null

  return (
    <>
      {moved.map((stat) => {
        const steps = stages[stat]
        const arrow = steps > 0 ? '↑' : '↓'
        return (
          <span key={stat} className="stage" data-direction={steps > 0 ? 'up' : 'down'}>
            {STAT_NAMES[stat]}
            <span aria-hidden="true">{arrow.repeat(Math.min(3, Math.abs(steps)))}</span>
            <span className="sr-only">{steps > 0 ? `+${steps}` : steps}</span>
          </span>
        )
      })}
    </>
  )
}
