interface Props {
  lines: readonly string[]
}

export function BattleLog({ lines }: Props) {
  return (
    <section className="log" aria-label="Battle log">
      <ol data-testid="battle-log">
        {lines.map((line, index) => (
          // Lines repeat verbatim across turns, so position is the only stable key.
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ol>
    </section>
  )
}
