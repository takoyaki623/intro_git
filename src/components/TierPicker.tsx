import { TIER_CONFIG, isTierUnlocked } from '../domain/tiers'

interface Props {
  tier: number
  /** The highest tier cleared so far; zero means only the first is open. */
  cleared: number
  onSelect: (tier: number) => void
}

const TIERS = Array.from({ length: TIER_CONFIG.max }, (_, index) => index + 1)

/**
 * Which difficulty the run is played at.
 *
 * Locked tiers stay on screen rather than being hidden: seeing that there are
 * five is the reason to clear the first one.
 */
export function TierPicker({ tier, cleared, onSelect }: Props) {
  return (
    <section className="tiers" aria-label="だんかいを えらぶ">
      <h2>だんかい</h2>
      <div className="tier-row" data-testid="tier-row">
        {TIERS.map((option) => {
          const open = isTierUnlocked(option, cleared)
          return (
            <button
              key={option}
              type="button"
              disabled={!open}
              aria-pressed={option === tier}
              data-current={option === tier ? '' : undefined}
              onClick={() => onSelect(option)}
            >
              {open ? option : '🔒'}
              <span className="sr-only">
                {open ? `だんかい ${option}` : `だんかい ${option} は まだ あいていない`}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
