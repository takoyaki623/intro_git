interface Props {
  wins: number
  opponentLevel: number
}

export function RunStatus({ wins, opponentLevel }: Props) {
  return (
    <p className="run-status" data-testid="run-status">
      <span>
        れんしょう <strong>{wins}</strong>
      </span>
      <span className="meta">あいて Lv{opponentLevel}</span>
    </p>
  )
}
