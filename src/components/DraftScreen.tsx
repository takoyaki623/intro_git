import type { Species } from '../domain/entities'
import { baseStatTotal } from '../domain/entities'
import type { DraftState } from '../domain/draft'
import { DRAFT_CONFIG, isDraftComplete } from '../domain/draft'
import { ABILITY_NAMES, coverageSummary } from '../ui/messages'
import { TypeBadges } from './TypeBadges'

interface Props {
  draft: DraftState
  onToggle: (speciesId: string) => void
  onConfirm: () => void
}

function Candidate({
  species,
  order,
  onToggle,
}: {
  species: Species
  /** 1-based position in the party, or null if not taken. */
  order: number | null
  onToggle: () => void
}) {
  const coverage = coverageSummary(species)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={order !== null}
      data-picked={order !== null ? '' : undefined}
    >
      <span className="candidate-head">
        <strong>{species.name}</strong>
        {/* The pick's number, because the first one taken leads the run. */}
        {order !== null ? <span className="pick-order">{order}</span> : null}
      </span>
      <TypeBadges types={species.types} />
      <span className="meta">
        {`しゅぞくち ${baseStatTotal(species)}`}
        {species.ability ? `・${ABILITY_NAMES[species.ability]}` : ''}
      </span>
      {coverage ? <span className="meta">{`こうげき ${coverage}`}</span> : null}
    </button>
  )
}

/**
 * The screen the run opens on: six candidates, three taken.
 *
 * Tapping a chosen one puts it back, so the whole choice stays reversible
 * until the player confirms it.
 */
export function DraftScreen({ draft, onToggle, onConfirm }: Props) {
  const remaining = DRAFT_CONFIG.picks - draft.picked.length
  return (
    <section className="draft" aria-label="てもちを えらぶ">
      <h2>
        {`${DRAFT_CONFIG.candidates}ひきから ${DRAFT_CONFIG.picks}びき えらんでください`}
      </h2>
      <div className="draft-grid" data-testid="draft-candidates">
        {draft.candidates.map((species) => {
          const index = draft.picked.indexOf(species.id)
          return (
            <Candidate
              key={species.id}
              species={species}
              order={index === -1 ? null : index + 1}
              onToggle={() => onToggle(species.id)}
            />
          )
        })}
      </div>
      <p role="status" className="meta">
        {remaining > 0 ? `あと ${remaining}ひき` : 'えらびおわりました'}
      </p>
      <button
        type="button"
        className="confirm"
        disabled={!isDraftComplete(draft)}
        onClick={onConfirm}
      >
        この てもちで はじめる
      </button>
    </section>
  )
}
