import { GUIDE_SECTIONS } from '../ui/guide'

interface Props {
  onClose: () => void
}

/**
 * The rules, for somebody who has not played this before.
 *
 * There was nothing at all until a first-time player pointed out that the
 * opening screen asks you to compare six Pokemon on しゅぞくち and こうげき
 * without ever saying what either word means. Knowing the games was a silent
 * requirement.
 */
export function HowToPlay({ onClose }: Props) {
  return (
    <section className="guide" aria-label="あそびかた">
      <h2>あそびかた</h2>
      {GUIDE_SECTIONS.map((section) => (
        <div key={section.heading} className="guide-part">
          <h3>{section.heading}</h3>
          <ul>
            {section.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
      <button type="button" className="cancel" onClick={onClose}>
        とじる
      </button>
    </section>
  )
}
