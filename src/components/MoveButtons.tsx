import type { Move } from '../domain/entities'
import { TYPE_NAMES, moveAccuracySummary, moveEffectSummary } from '../ui/messages'

interface Props {
  moves: readonly Move[]
  onSelect: (move: Move) => void
}

export function MoveButtons({ moves, onSelect }: Props) {
  return (
    <section className="moves" aria-label="わざ">
      {moves.map((move) => {
        const accuracy = moveAccuracySummary(move)
        const effect = moveEffectSummary(move)
        return (
          <button key={move.id} type="button" onClick={() => onSelect(move)}>
            <strong>{move.name}</strong>
            <span className="meta">
              {[
                TYPE_NAMES[move.type],
                move.category === 'status' ? 'へんか' : `威力 ${move.power}`,
                accuracy,
              ]
                .filter(Boolean)
                .join('・')}
            </span>
            {effect ? <span className="meta effect">{effect}</span> : null}
          </button>
        )
      })}
    </section>
  )
}
