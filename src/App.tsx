import { useState } from 'react'
import type { Move } from './domain/entities'
import { createBattlePokemon } from './domain/entities'
import { chooseOpponentMove, createBattle, resolveTurn } from './domain/battle'
import { SPECIES } from './data/species'
import { outcomeMessage } from './ui/messages'
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
    // Resolving the turn rolls dice, so it happens here rather than inside the
    // setState updater: React may call an updater more than once and expects a
    // pure function of the previous state.
    setBattle(resolveTurn(battle, move, chooseOpponentMove(battle.opponent)))
  }

  const outcome = battle.winner
    ? outcomeMessage(
        battle.winner,
        battle.player.species.name,
        battle.opponent.species.name,
      )
    : null

  return (
    <main className="battle">
      <h1>ポケモンバトル</h1>

      <section className="field">
        <HealthBar pokemon={battle.opponent} side="opponent" />
        <HealthBar pokemon={battle.player} side="player" />
      </section>

      {outcome ? (
        <section className="outcome">
          <p role="status">{outcome}</p>
          <button type="button" onClick={() => setBattle(newBattle())}>
            もういちど たたかう
          </button>
        </section>
      ) : (
        <MoveButtons moves={battle.player.species.moves} onSelect={useMove} />
      )}

      <BattleLog events={battle.events} />
    </main>
  )
}
