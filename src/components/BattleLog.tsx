import type { BattleEvent } from '../domain/events'
import { formatLog } from '../ui/messages'

interface Props {
  events: readonly BattleEvent[]
}

export function BattleLog({ events }: Props) {
  return (
    <section className="log" aria-label="バトルログ">
      {/* Turn results are the only feedback for what just happened, so they are
          announced rather than left for a screen reader user to go hunting. */}
      <ol data-testid="battle-log" aria-live="polite" aria-relevant="additions">
        {formatLog(events).map((line, index) => (
          // Lines repeat verbatim across turns, so position is the only stable key.
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ol>
    </section>
  )
}
