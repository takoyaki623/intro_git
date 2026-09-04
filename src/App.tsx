import { useEffect, useState } from 'react'
import type { Move } from './domain/entities'
import { activePokemon } from './domain/entities'
import { lastDamageBySide } from './domain/events'
import type { TurnAction } from './domain/battle'
import { forceSwitch, resolveTurn } from './domain/battle'
import { chooseOpponentAction } from './domain/ai'
import type { RunState } from './domain/run'
import {
  RUN_CONFIG,
  advance,
  canAdvance,
  isFinalBattle,
  startRun,
  withBattle,
  withOffer,
} from './domain/run'
import type { DraftState } from './domain/draft'
import { draftedRoster, startDraft, togglePick } from './domain/draft'
import type { RewardKind } from './domain/rewards'
import { outcomeMessage } from './ui/messages'
import {
  clearDraft,
  clearRun,
  loadDraft,
  loadRun,
  saveDraft,
  saveRun,
} from './ui/storage'
import { loadBest, recordRun, type BestRun } from './ui/records'
import { HealthBar } from './components/HealthBar'
import { MoveButtons } from './components/MoveButtons'
import { SwitchButtons } from './components/SwitchButtons'
import { TeamBar } from './components/TeamBar'
import { RunStatus } from './components/RunStatus'
import { HallOfFame } from './components/HallOfFame'
import { RewardChoice } from './components/RewardChoice'
import { BattleLog } from './components/BattleLog'
import { DraftScreen } from './components/DraftScreen'

/**
 * Exactly one of these is live: a run in progress, or the draft that will start
 * one. Holding them in a single state makes that impossible to get wrong.
 */
interface Session {
  readonly draft: DraftState | null
  readonly run: RunState | null
}

function openSession(): Session {
  // A saved run wins: the draft that produced it is long since spent.
  const saved = loadRun()
  if (saved) return { draft: null, run: withOffer(saved) }
  return { draft: loadDraft() ?? startDraft(), run: null }
}

export default function App() {
  const [session, setSession] = useState<Session>(openSession)
  const [best, setBest] = useState<BestRun | null>(() => loadBest())
  // Whether the record on show is the run that just ended.
  const [beatIt, setBeatIt] = useState(false)

  const { draft, run } = session

  useEffect(() => {
    if (run) saveRun(run)
  }, [run])

  // Written down before a single pick, so a reload cannot re-deal the offer.
  useEffect(() => {
    if (draft) saveDraft(draft)
  }, [draft])

  // A finished run goes in the book, if it earned a place.
  useEffect(() => {
    if (!run?.finished) return
    setBest((standing) => {
      const updated = recordRun(run)
      setBeatIt(updated !== null && updated !== standing && updated.wins === run.wins)
      return updated
    })
  }, [run])

  const startOver = () => {
    clearRun()
    clearDraft()
    setBeatIt(false)
    setSession({ draft: startDraft(), run: null })
  }

  if (!run) {
    return (
      <main className="battle">
        <h1>ポケモンバトル</h1>
        <RunStatus
          wins={0}
          total={RUN_CONFIG.battlesToClear}
          opponentLevel={null}
          best={best?.wins ?? null}
        />
        {draft ? (
          <DraftScreen
            draft={draft}
            onToggle={(speciesId) =>
              setSession((current) =>
                current.draft
                  ? { ...current, draft: togglePick(current.draft, speciesId) }
                  : current,
              )
            }
            onConfirm={() => {
              // Drawing dice outside the updater: React may call it twice.
              const started = startRun(Math.random, draftedRoster(draft))
              clearDraft()
              setSession({ draft: null, run: started })
            }}
          />
        ) : null}
      </main>
    )
  }

  const { battle } = run
  const player = activePokemon(battle.player)
  const opponent = activePokemon(battle.opponent)
  const hits = lastDamageBySide(battle.events)

  // Resolving a turn rolls dice, so it happens here rather than inside the
  // setState updater: React may call an updater more than once and expects a
  // pure function of the previous state.
  const takeTurn = (action: TurnAction) => {
    const next = withBattle(
      run,
      resolveTurn(battle, action, chooseOpponentAction(battle)),
    )
    setSession({ draft: null, run: next })
  }

  const useMove = (move: Move) => takeTurn({ type: 'move', move })
  const switchTo = (index: number) => takeTurn({ type: 'switch', index })
  const sendReplacement = (index: number) =>
    setSession({
      draft: null,
      run: withBattle(run, forceSwitch(battle, 'player', index)),
    })
  const takeReward = (reward: RewardKind | null) =>
    setSession({ draft: null, run: advance(run, reward) })

  return (
    <main className="battle">
      <h1>ポケモンバトル</h1>
      <RunStatus
        wins={run.wins}
        total={RUN_CONFIG.battlesToClear}
        opponentLevel={opponent.level}
        final={!run.cleared && isFinalBattle(run.wins)}
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

      {run.cleared ? (
        <section className="outcome cleared">
          <h2>クリア！</h2>
          <p role="status">
            {`${opponent.species.name}を たおした！ ${run.wins}れんしょうで ぜんぶ かちぬいた。`}
          </p>
          <button type="button" onClick={startOver}>
            もういちど
          </button>
          {best ? <HallOfFame best={best} fresh={beatIt} /> : null}
        </section>
      ) : run.finished ? (
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
            <RewardChoice offer={run.offer} onSelect={takeReward} />
          ) : (
            <button type="button" onClick={() => takeReward(null)}>
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
