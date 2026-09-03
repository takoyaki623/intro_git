import { useEffect, useState } from 'react'
import type { Move } from './domain/entities'
import { activePokemon } from './domain/entities'
import { lastDamageBySide } from './domain/events'
import type { TurnAction } from './domain/battle'
import { forceSwitch, resolveTurn } from './domain/battle'
import { chooseOpponentAction } from './domain/ai'
import { advance, canAdvance, startRun, withBattle, withOffer } from './domain/run'
import type { RewardKind } from './domain/rewards'
import { outcomeMessage } from './ui/messages'
import { clearRun, loadRun, saveRun } from './ui/storage'
import { loadBest, recordRun, type BestRun } from './ui/records'
import { HealthBar } from './components/HealthBar'
import { MoveButtons } from './components/MoveButtons'
import { SwitchButtons } from './components/SwitchButtons'
import { TeamBar } from './components/TeamBar'
import { RunStatus } from './components/RunStatus'
import { HallOfFame } from './components/HallOfFame'
import { RewardChoice } from './components/RewardChoice'
import { BattleLog } from './components/BattleLog'

export default function App() {
  // withOffer covers a save written after the win but before the draw.
  const [run, setRun] = useState(() => withOffer(loadRun() ?? startRun()))
  const [best, setBest] = useState<BestRun | null>(() => loadBest())
  // Whether the record on show is the run that just ended.
  const [beatIt, setBeatIt] = useState(false)

  useEffect(() => {
    saveRun(run)
  }, [run])

  // A finished run goes in the book, if it earned a place.
  useEffect(() => {
    if (!run.finished) return
    setBest((standing) => {
      const updated = recordRun(run)
      setBeatIt(updated !== null && updated !== standing && updated.wins === run.wins)
      return updated
    })
  }, [run])

  const { battle } = run
  const player = activePokemon(battle.player)
  const opponent = activePokemon(battle.opponent)
  const hits = lastDamageBySide(battle.events)

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
    setBeatIt(false)
    setRun(startRun())
  }

  return (
    <main className="battle">
      <h1>ポケモンバトル</h1>
      <RunStatus
        wins={run.wins}
        opponentLevel={opponent.level}
        best={best?.wins ?? null}
      />

      <section className="field">
        <div className="slot">
          <TeamBar team={battle.opponent} side="opponent" />
          <HealthBar pokemon={opponent} side="opponent" hit={hits.opponent} />
        </div>
        <div className="slot">
          <TeamBar team={battle.player} side="player" />
          <HealthBar pokemon={player} side="player" hit={hits.player} />
        </div>
      </section>

      <BattleLog events={battle.events} />

      {run.finished ? (
        <section className="outcome">
          <p role="status">
            {outcomeMessage('opponent', player.species.name, opponent.species.name)}
            {` ${run.wins}れんしょうで おわり。`}
          </p>
          <button type="button" onClick={startOver}>
            はじめから
          </button>
          {best ? <HallOfFame best={best} fresh={beatIt} /> : null}
        </section>
      ) : canAdvance(run) ? (
        <section className="outcome">
          <p role="status">
            {outcomeMessage('player', player.species.name, opponent.species.name)}
            {' てもちが すこし かいふくした！'}
          </p>
          {run.offer && run.offer.length > 0 ? (
            <RewardChoice
              offer={run.offer}
              onSelect={(reward: RewardKind) => setRun(advance(run, reward))}
            />
          ) : (
            <button type="button" onClick={() => setRun(advance(run))}>
              つぎの あいて
            </button>
          )}
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
    </main>
  )
}
