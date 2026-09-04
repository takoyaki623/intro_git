import type { TeamState } from '../domain/entities'
import { isFainted } from '../domain/entities'
import { STATUS_NAMES } from '../ui/messages'
import { TypeBadges } from './TypeBadges'

interface Props {
  team: TeamState
  onSelect: (index: number) => void
  label: string
  /**
   * Backs out of the choice. Given only where the player opened the panel on
   * purpose -- a replacement owed after a faint has nowhere to back out to.
   */
  onCancel?: () => void
}

export function SwitchButtons({ team, onSelect, label, onCancel }: Props) {
  return (
    <section className="switches" aria-label={label}>
      <h2>{label}</h2>
      <div className="switch-row">
        {team.members.map((member, index) => {
          const out = index === team.activeIndex
          const down = isFainted(member)
          return (
            <button
              key={member.species.id}
              type="button"
              disabled={out || down}
              onClick={() => onSelect(index)}
            >
              <strong>{member.species.name}</strong>
              {/* Choosing who to send in is a type decision, so the types come
                  with the name rather than being left to memory. */}
              <TypeBadges types={member.species.types} />
              <span className="meta">
                {down
                  ? 'ひんし'
                  : out
                    ? 'せんとうちゅう'
                    : `${member.currentHp} / ${member.stats.hp}`}
                {!down && member.status ? ` ・${STATUS_NAMES[member.status.kind]}` : ''}
              </span>
            </button>
          )
        })}
      </div>
      {onCancel ? (
        <button type="button" className="cancel" onClick={onCancel}>
          やめる
        </button>
      ) : null}
    </section>
  )
}
