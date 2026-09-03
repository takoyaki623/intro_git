import type { BattlePokemon } from '../domain/entities'
import { STATUS_NAMES } from '../ui/messages'

interface Props {
  pokemon: BattlePokemon
  side: 'player' | 'opponent'
}

export function HealthBar({ pokemon, side }: Props) {
  const ratio = pokemon.currentHp / pokemon.stats.hp
  const percent = Math.round(ratio * 100)
  const state = ratio > 0.5 ? 'healthy' : ratio > 0.2 ? 'warning' : 'critical'

  return (
    <article className="card" data-side={side} data-testid={`${side}-card`}>
      <header>
        <strong>{pokemon.species.name}</strong>
        <span className="header-right">
          {pokemon.status ? (
            <span className="status" data-status={pokemon.status.kind}>
              {STATUS_NAMES[pokemon.status.kind]}
            </span>
          ) : null}
          <span className="level">Lv{pokemon.level}</span>
        </span>
      </header>
      <div
        className="bar"
        role="progressbar"
        aria-label={`${pokemon.species.name}の HP`}
        aria-valuenow={pokemon.currentHp}
        aria-valuemin={0}
        aria-valuemax={pokemon.stats.hp}
      >
        <div className="fill" data-state={state} style={{ width: `${percent}%` }} />
      </div>
      <p className="hp" data-testid={`${side}-hp`}>
        {pokemon.currentHp} / {pokemon.stats.hp} HP
      </p>
    </article>
  )
}
