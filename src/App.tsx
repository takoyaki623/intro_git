import { useEffect, useState } from 'react'
import type { Move } from './domain/entities'
import { activePokemon } from './domain/entities'
import type { TurnAction } from './domain/battle'
import { chooseOpponentAction, forceSwitch, resolveTurn } from './domain/battle'
import { advance, canAdvance, startRun, withBattle } from './domain/run'
import { outcomeMessage } from './ui/messages'
import { clearRun, loadRun, saveRun } from './ui/storage'
import { HealthBar } from './components/HealthBar'
import { MoveButtons } from './components/MoveButtons'
import { SwitchButtons } from './components/SwitchButtons'
import { TeamBar } from './components/TeamBar'
import { RunStatus } from './components/RunStatus'
import { BattleLog } from './components/BattleLog'

export default function App() {
  const [run, setRun] = useState(() => loadRun() ?? startRun())

  useEffect(() => {
    saveRun(run)
  }, [run])

  const { battle } = run
  const player = activePokemon(battle.player)
  const opponent = activePokemon(battle.opponent)

  // Resolving a turn rolls dice, so it happens here rather than inside the
  // setState updater: React may call an updater more than once and expects a
  // pure function of the previous state.
  const takeTurn = (action: TurnAction) =>
    setRun(withBattle(run, resolveTurn(battle, action, chooseOpponentAction(battle))))

  const useMove = (move: Move) => takeTurn({ type: 'move', move })
  const switchTo = (index: number) => takeTurn({ type: 'switch', index })
  const sendReplacement = (index: number) =>
    setRun(withBattle(run, forceSwitch(battle, 'player', index)))

  const startOver = () => {
    clearRun()
    setRun(startRun())
  }

  return (
    <main className="battle">
      <h1>ポケモンバトル</h1>
      <RunStatus wins={run.wins} opponentLevel={opponent.level} />

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

      {run.finished ? (
        <section className="outcome">
          <p role="status">
            {outcomeMessage('opponent', player.species.name, opponent.species.name)}
            {` ${run.wins}れんしょうで おわり。`}
          </p>
          <button type="button" onClick={startOver}>
            はじめから
          </button>
        </section>
      ) : canAdvance(run) ? (
        <section className="outcome">
          <p role="status">
            {outcomeMessage('player', player.species.name, opponent.species.name)}
            {' てもちが すこし かいふくした！'}
          </p>
          <button type="button" onClick={() => setRun(advance(run))}>
            つぎの あいて
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
