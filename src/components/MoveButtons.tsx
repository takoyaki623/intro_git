import type { Move } from '../domain/entities'
import { TYPE_NAMES } from '../ui/messages'

interface Props {
  moves: readonly Move[]
  onSelect: (move: Move) => void
}

export function MoveButtons({ moves, onSelect }: Props) {
  return (
    <section className="moves" aria-label="わざ">
      {moves.map((move) => (
        <button key={move.id} type="button" onClick={() => onSelect(move)}>
          <strong>{move.name}</strong>
          <span className="meta">
            {TYPE_NAMES[move.type]}・威力 {move.power}
          </span>
        </button>
      ))}
    </section>
  )
}
