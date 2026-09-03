import type { BattlePokemon } from '../domain/entities'
import type { DamageMark } from '../domain/events'
import { StageBadges } from './StageBadges'
import { TypeBadges } from './TypeBadges'
import { ABILITY_NAMES, ITEM_NAMES, STATUS_NAMES } from '../ui/messages'

interface Props {
  pokemon: BattlePokemon
  side: 'player' | 'opponent'
  /** The last hit this side took, flashed over the card. */
  hit?: DamageMark | null
}

export function HealthBar({ pokemon, side, hit = null }: Props) {
  const ratio = pokemon.currentHp / pokemon.stats.hp
  const percent = Math.round(ratio * 100)
  const state = ratio > 0.5 ? 'healthy' : ratio > 0.2 ? 'warning' : 'critical'

  return (
    <article className="card" data-side={side} data-testid={`${side}-card`}>
      <header>
        <span className="who">
          <strong>{pokemon.species.name}</strong>
          <TypeBadges types={pokemon.species.types} />
        </span>
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
      {hit ? (
        // Keyed by event, so a new hit remounts this and replays the animation.
        <span key={hit.index} className="damage-flash" aria-hidden="true">
          -{hit.amount}
        </span>
      ) : null}
      {/* Stages, ability and held item share one wrapping row: three separate
          rows pushed the move buttons off the bottom of a small phone. */}
      <p className="chips">
        <StageBadges stages={pokemon.stages} />
        {pokemon.species.ability ? (
          <span className="trait">{ABILITY_NAMES[pokemon.species.ability]}</span>
        ) : null}
        {pokemon.item ? (
          <span className="trait" data-held="true">
            {ITEM_NAMES[pokemon.item]}
          </span>
        ) : null}
      </p>
      <p className="hp" data-testid={`${side}-hp`}>
        {pokemon.currentHp} / {pokemon.stats.hp} HP
      </p>
    </article>
  )
}
