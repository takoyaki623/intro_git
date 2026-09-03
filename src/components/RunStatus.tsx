interface Props {
  wins: number
  opponentLevel: number
  best: number | null
}

export function RunStatus({ wins, opponentLevel, best }: Props) {
  return (
    <p className="run-status" data-testid="run-status">
      <span>
        れんしょう <strong>{wins}</strong>
      </span>
      <span className="meta">
        {best === null ? null : <>さいこう {best}・</>}
        あいて Lv{opponentLevel}
      </span>
    </p>
  )
}
