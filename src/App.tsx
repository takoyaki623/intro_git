import { useState } from 'react'
import type { Move } from './domain/entities'
import { createBattlePokemon } from './domain/entities'
import { chooseOpponentMove, createBattle, resolveTurn } from './domain/battle'
import { SPECIES } from './data/species'
import { HealthBar } from './components/HealthBar'
import { MoveButtons } from './components/MoveButtons'
import { BattleLog } from './components/BattleLog'

const LEVEL = 50

function newBattle() {
  return createBattle(
    createBattlePokemon(SPECIES.pikachu, LEVEL),
    createBattlePokemon(SPECIES.squirtle, LEVEL),
  )
}

export default function App() {
  const [battle, setBattle] = useState(newBattle)

  const useMove = (move: Move) => {
    setBattle((current) =>
      resolveTurn(current, move, chooseOpponentMove(current.opponent), Math.random),
    )
  }

  const outcome =
    battle.winner === 'player'
      ? `${battle.opponent.species.name} fainted. You win!`
      : battle.winner === 'opponent'
        ? `${battle.player.species.name} fainted. You lose...`
        : null

  return (
    <main className="battle">
      <h1>Pokémon Battle</h1>

      <section className="field">
        <HealthBar pokemon={battle.opponent} side="opponent" />
        <HealthBar pokemon={battle.player} side="player" />
      </section>

      {outcome ? (
        <section className="outcome">
          <p role="status">{outcome}</p>
          <button type="button" onClick={() => setBattle(newBattle())}>
            Battle again
          </button>
        </section>
      ) : (
        <MoveButtons moves={battle.player.species.moves} onSelect={useMove} />
      )}

      <BattleLog lines={battle.log} />
    </main>
  )
}
