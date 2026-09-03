import type { Move } from '../domain/entities'

interface Props {
  moves: readonly Move[]
  onSelect: (move: Move) => void
}

export function MoveButtons({ moves, onSelect }: Props) {
  return (
    <section className="moves" aria-label="Moves">
      {moves.map((move) => (
        <button key={move.id} type="button" onClick={() => onSelect(move)}>
          <strong>{move.name}</strong>
          <span className="meta">
            {move.type} · {move.power}
          </span>
        </button>
      ))}
    </section>
  )
}
