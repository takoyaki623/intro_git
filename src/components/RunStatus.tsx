interface Props {
  wins: number
  /** Battles in a run. The streak reads as progress rather than a tally. */
  total: number
  /** Null before the run starts, while the party is still being drafted. */
  opponentLevel: number | null
  /** True while the battle on screen is the last one. */
  final?: boolean
  /** Which difficulty tier this run is at. */
  tier: number
  best: number | null
}

export function RunStatus({
  wins,
  total,
  opponentLevel,
  final = false,
  tier,
  best,
}: Props) {
  return (
    <p className="run-status" data-testid="run-status">
      <span>
        <span className="tier-tag">だんかい {tier}</span>
        れんしょう <strong>{wins}</strong>
        <span className="meta"> / {total}</span>
      </span>
      <span className="meta">
        {best === null ? null : <>さいこう {best}・</>}
        {opponentLevel === null ? (
          'ドラフト'
        ) : final ? (
          <span className="final">さいしゅうせん Lv{opponentLevel}</span>
        ) : (
          `あいて Lv${opponentLevel}`
        )}
      </span>
    </p>
  )
}
