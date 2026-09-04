interface Props {
  wins: number
  /** Null before the run starts, while the party is still being drafted. */
  opponentLevel: number | null
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
        {opponentLevel === null ? 'ドラフト' : `あいて Lv${opponentLevel}`}
      </span>
    </p>
  )
}
