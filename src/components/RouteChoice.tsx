import type { Route } from '../domain/run'
import { rewardsFor } from '../domain/encounters'
import { TypeBadges } from './TypeBadges'
import { encounterName, encounterNote } from '../ui/messages'

interface Props {
  route: Route
  onSelect: (index: number) => void
}

/**
 * The fork out of a win: two parties, both visible, pick one.
 *
 * Both are built and shown rather than named, because a blind fork is a coin
 * flip. Seeing that one road is a single Pokemon with a great deal of health
 * is the whole decision -- that is the fight where setting up and inflicting a
 * condition finally have time to pay for themselves.
 */
export function RouteChoice({ route, onSelect }: Props) {
  return (
    <section className="routes" aria-label="つぎの あいてを えらぶ">
      <h2>つぎは どっち？</h2>
      <div className="route-row">
        {route.map((road, index) => {
          const lead = road.team.members[0]
          return (
            <button
              key={road.kind}
              type="button"
              data-kind={road.kind}
              onClick={() => onSelect(index)}
            >
              <span className="route-head">
                <strong>{encounterName(road.kind)}</strong>
                <span className="route-prize">ごほうび {rewardsFor(road.kind)}</span>
              </span>
              <span className="meta">{encounterNote(road.kind)}</span>
              <span className="route-team">
                {road.team.members.map((member) => (
                  <span key={member.species.id} className="route-member">
                    {member.species.name}
                    <span className="meta"> Lv{member.level}</span>
                  </span>
                ))}
              </span>
              {lead ? <TypeBadges types={lead.species.types} /> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
