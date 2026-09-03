import type { Side, TeamState } from '../domain/entities'
import { isFainted } from '../domain/entities'

interface Props {
  team: TeamState
  side: Side
}

/** The party at a glance: one pip per member, dimmed once it is down. */
export function TeamBar({ team, side }: Props) {
  const standing = team.members.filter((member) => !isFainted(member)).length

  return (
    <p
      className="team-bar"
      data-testid={`${side}-team`}
      aria-label={`${side === 'player' ? 'てもち' : 'あいての てもち'} のこり ${standing}`}
    >
      {team.members.map((member, index) => (
        <span
          key={member.species.id}
          className="pip"
          data-down={isFainted(member) || undefined}
          data-active={index === team.activeIndex || undefined}
          aria-hidden="true"
        >
          ●
        </span>
      ))}
    </p>
  )
}
