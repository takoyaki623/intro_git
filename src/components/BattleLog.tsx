import { useEffect, useRef } from 'react'
import type { BattleEvent } from '../domain/events'
import { formatLog } from '../ui/messages'

interface Props {
  events: readonly BattleEvent[]
}

export function BattleLog({ events }: Props) {
  const list = useRef<HTMLOListElement>(null)
  const lines = formatLog(events)

  // The log scrolls, and new lines land at the bottom, so without this the
  // player is left reading the opening of the battle while the turn they just
  // took sits out of sight. Jumping rather than gliding: a turn can add several
  // lines at once, and a scroll animation on every one of them is a distraction.
  useEffect(() => {
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [lines.length])

  return (
    <section className="log" aria-label="バトルログ">
      {/* Turn results are the only feedback for what just happened, so they are
          announced rather than left for a screen reader user to go hunting. */}
      <ol
        ref={list}
        data-testid="battle-log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {lines.map((line, index) => (
          // Lines repeat verbatim across turns, so position is the only stable key.
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ol>
    </section>
  )
}
