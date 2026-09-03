import type { PokemonType } from '../domain/types'
import { TYPE_NAMES } from '../ui/messages'

interface Props {
  types: readonly PokemonType[]
}

/**
 * The Pokemon's types, which the whole game turns on and which the card
 * previously left the player to remember.
 */
export function TypeBadges({ types }: Props) {
  return (
    <span className="types">
      {types.map((type) => (
        <span key={type} className="type" data-type={type}>
          <span className="type-dot" aria-hidden="true" />
          {TYPE_NAMES[type]}
        </span>
      ))}
    </span>
  )
}
