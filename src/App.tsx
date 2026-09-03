import { useState } from 'react'
import type { Move } from './domain/entities'
import { activePokemon, createBattlePokemon, createTeam } from './domain/entities'
import {
  chooseOpponentAction,
  createBattle,
  forceSwitch,
  resolveTurn,
} from './domain/battle'
import { OPPONENT_TEAM, PLAYER_TEAM } from './data/teams'
import { outcomeMessage } from './ui/messages'
import { HealthBar } from './components/HealthBar'
import { MoveButtons } from './components/MoveButtons'
import { SwitchButtons } from './components/SwitchButtons'
import { TeamBar } from './components/TeamBar'
import { BattleLog } from './components/BattleLog'

const LEVEL = 50

function newBattle() {
  const team = (species: typeof PLAYER_TEAM) =>
    createTeam(species.map((s) => createBattlePokemon(s, LEVEL)))
  return createBattle(team(PLAYER_TEAM), team(OPPONENT_TEAM))
}

export default function App() {
  const [battle, setBattle] = useState(newBattle)

  const player = activePokemon(battle.player)
  const opponent = activePokemon(battle.opponent)

  // Resolving a turn rolls dice, so it happens here rather than inside the
  // setState updater: React may call an updater more than once and expects a
  // pure function of the previous state.
  const takeTurn = (action: Parameters<typeof resolveTurn>[1]) => {
    setBattle(resolveTurn(battle, action, chooseOpponentAction(battle)))
  }

  const useMove = (move: Move) => takeTurn({ type: 'move', move })
  const switchTo = (index: number) => takeTurn({ type: 'switch', index })
  const sendReplacement = (index: number) =>
    setBattle(forceSwitch(battle, 'player', index))

  const outcome = battle.winner
    ? outcomeMessage(battle.winner, player.species.name, opponent.species.name)
    : null

  return (
    <main className="battle">
      <h1>ポケモンバトル</h1>

      <section className="field">
        <div className="slot">
          <TeamBar team={battle.opponent} side="opponent" />
          <HealthBar pokemon={opponent} side="opponent" />
        </div>
        <div className="slot">
          <TeamBar team={battle.player} side="player" />
          <HealthBar pokemon={player} side="player" />
        </div>
      </section>

      {outcome ? (
        <section className="outcome">
          <p role="status">{outcome}</p>
          <button type="button" onClick={() => setBattle(newBattle())}>
            もういちど たたかう
          </button>
        </section>
      ) : battle.awaitingSwitch === 'player' ? (
        <SwitchButtons
          team={battle.player}
          onSelect={sendReplacement}
          label="つぎに だすポケモンを えらんでください"
        />
      ) : (
        <>
          <MoveButtons moves={player.species.moves} onSelect={useMove} />
          <SwitchButtons team={battle.player} onSelect={switchTo} label="こうたい" />
        </>
      )}

      <BattleLog events={battle.events} />
    </main>
  )
}
