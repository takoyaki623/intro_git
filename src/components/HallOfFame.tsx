import type { BestRun } from '../ui/records'

interface Props {
  best: BestRun
  /** True when the run that just ended is the one on record. */
  fresh: boolean
}

export function HallOfFame({ best, fresh }: Props) {
  return (
    <section className="hall" aria-label="さいこう きろく" data-testid="hall-of-fame">
      <h2>
        {fresh ? 'じこ ベスト こうしん！' : 'さいこう きろく'}{' '}
        <strong>{best.wins}</strong> れんしょう
        {best.cleared ? <span className="clear-badge">クリア</span> : null}
      </h2>
      <ul>
        {best.party.map((member) => (
          <li key={member.speciesId}>
            {member.name} <span className="meta">Lv{member.level}</span>
          </li>
        ))}
      </ul>
      <p className="meta">{best.achievedOn}</p>
    </section>
  )
}
