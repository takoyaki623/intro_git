import { useEffect, useState } from 'react'
import type { Move } from './domain/entities'
import { activePokemon, switchableIndexes } from './domain/entities'
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
  passMove,
  readyToTravel,
  takeMove,
  takeReward,
  startRun,
  withBattle,
  withOffer,
} from './domain/run'
import type { DraftState } from './domain/draft'
import { chooseTier, draftedRoster, startDraft, togglePick } from './domain/draft'
import type { RewardOffer, RewardTarget } from './domain/rewards'
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
import { loadProgress, recordClear } from './ui/progress'
import { hasSeenGuide, markGuideSeen } from './ui/guide'
import { FIRST_TIER, highestUnlocked, nextTier } from './domain/tiers'
import { HealthBar } from './components/HealthBar'
import { MoveButtons } from './components/MoveButtons'
import { SwitchButtons } from './components/SwitchButtons'
import { TeamBar } from './components/TeamBar'
import { RunStatus } from './components/RunStatus'
import { HallOfFame } from './components/HallOfFame'
import { RewardChoice } from './components/RewardChoice'
import { BattleLog } from './components/BattleLog'
import { DraftScreen } from './components/DraftScreen'
import { RouteChoice } from './components/RouteChoice'
import { HowToPlay } from './components/HowToPlay'
import { TierPicker } from './components/TierPicker'

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
  // A fresh draft opens at the hardest tier that has been earned, which is
  // where a returning player wants to be.
  return {
    draft: loadDraft() ?? startDraft(Math.random, highestUnlocked(loadProgress())),
    run: null,
  }
}

export default function App() {
  const [session, setSession] = useState<Session>(openSession)
  const [best, setBest] = useState<BestRun | null>(() => loadBest())
  // Whether the record on show is the run that just ended.
  const [beatIt, setBeatIt] = useState(false)
  /** The highest tier cleared. Raised the moment a run clears its own tier. */
  const [cleared, setCleared] = useState(() => loadProgress())
  // Open on a first visit, and reachable from the title from then on.
  const [guide, setGuide] = useState(() => !hasSeenGuide())
  /**
   * A switch-out move waiting on the second half of its choice.
   *
   * Deliberately not part of the run: it is a half-finished tap, not progress,
   * so a reload drops it rather than restoring the player mid-decision.
   */
  const [partingMove, setPartingMove] = useState<Move | null>(null)

  const { draft, run } = session

  useEffect(() => {
    if (run) saveRun(run)
  }, [run])

  // Written down before a single pick, so a reload cannot re-deal the offer.
  useEffect(() => {
    if (draft) saveDraft(draft)
  }, [draft])

  // Clearing a tier opens the next one, whether or not the run set a record.
  useEffect(() => {
    if (!run?.cleared) return
    setCleared(recordClear(run.tier))
  }, [run])

  // A finished run goes in the book, if it earned a place.
  useEffect(() => {
    if (!run?.finished) return
    setBest((standing) => {
      const updated = recordRun(run)
      setBeatIt(updated !== null && updated !== standing && updated.wins === run.wins)
      return updated
    })
  }, [run])

  const closeGuide = () => {
    markGuideSeen()
    setGuide(false)
  }

  const title = (
    <div className="title-row">
      <h1>ポケモンバトル</h1>
      <button type="button" onClick={() => setGuide(true)} aria-expanded={guide}>
        あそびかた
      </button>
    </div>
  )

  const startOver = () => {
    clearRun()
    clearDraft()
    setBeatIt(false)
    // Straight to whatever the last run just unlocked, rather than back to one.
    setSession({ draft: startDraft(Math.random, highestUnlocked(cleared)), run: null })
  }

  if (!run) {
    return (
      <main className="battle">
        {title}
        {guide ? <HowToPlay onClose={closeGuide} /> : null}
        <RunStatus
          wins={0}
          total={RUN_CONFIG.battlesToClear}
          opponentLevel={null}
          tier={draft?.tier ?? FIRST_TIER}
          best={best?.wins ?? null}
        />
        {draft ? (
          <>
            {/* Beside the draft rather than inside it: the tier is the run's
                difficulty, not one of the six on the table. */}
            <TierPicker
              tier={draft.tier}
              cleared={cleared}
              onSelect={(tier) =>
                setSession((current) =>
                  current.draft
                    ? { ...current, draft: chooseTier(current.draft, tier, cleared) }
                    : current,
                )
              }
            />
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
                const started = startRun(Math.random, draftedRoster(draft), draft.tier)
                clearDraft()
                setSession({ draft: null, run: started })
              }}
            />
          </>
        ) : null}
      </main>
    )
  }

  const { battle } = run
  // What the clear opened, if anything. `run.tier === cleared` is what says this
  // run pushed the frontier forward: replaying a tier already beaten leaves the
  // record above it, and announcing an unlock there would be a lie.
  const above = nextTier(run.tier)
  const unlocked = run.cleared && run.tier === cleared ? above : null
  const atTheTop = run.cleared && above === null
  const player = activePokemon(battle.player)
  const opponent = activePokemon(battle.opponent)
  const hits = lastDamageBySide(battle.events)

  // Resolving a turn rolls dice, so it happens here rather than inside the
  // setState updater: React may call an updater more than once and expects a
  // pure function of the previous state.
  const takeTurn = (action: TurnAction) => {
    setPartingMove(null)
    const next = withBattle(
      run,
      resolveTurn(battle, action, chooseOpponentAction(battle)),
    )
    setSession({ draft: null, run: next })
  }

  // とんぼがえり needs to know who comes in, so the panel opens before the turn
  // is taken. With nobody on the bench there is nothing to ask, and the move is
  // just an attack.
  const useMove = (move: Move) => {
    if (move.switchesOut && switchableIndexes(battle.player).length > 0) {
      setPartingMove(move)
      return
    }
    takeTurn({ type: 'move', move })
  }
  const partWith = (index: number) => {
    if (!partingMove) return
    setPartingMove(null)
    takeTurn({ type: 'move', move: partingMove, switchTo: index })
  }
  const switchTo = (index: number) => takeTurn({ type: 'switch', index })
  const sendReplacement = (index: number) =>
    setSession({
      draft: null,
      run: withBattle(run, forceSwitch(battle, 'player', index)),
    })
  const pickReward = (reward: RewardOffer | null, target: RewardTarget | null = null) =>
    setSession({ draft: null, run: takeReward(run, reward, target) })
  const travel = (index: number) => setSession({ draft: null, run: advance(run, index) })

  return (
    <main className="battle">
      {title}
      {guide ? <HowToPlay onClose={closeGuide} /> : null}
      <RunStatus
        wins={run.wins}
        total={RUN_CONFIG.battlesToClear}
        opponentLevel={opponent.level}
        final={!run.cleared && isFinalBattle(run.wins)}
        tier={run.tier}
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
          <h2>だんかい {run.tier} クリア！</h2>
          <p role="status">
            {`${opponent.species.name}を たおした！ ${run.wins}れんしょうで ぜんぶ かちぬいた。`}
            {unlocked ? ` だんかい ${unlocked}が あいた！` : ''}
            {atTheTop ? ' これが さいごの だんかい。' : ''}
          </p>
          <button type="button" onClick={startOver}>
            {unlocked ? `だんかい ${unlocked}へ` : 'もういちど'}
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
          {!readyToTravel(run) && run.offer && run.offer.length > 0 ? (
            <RewardChoice
              offer={run.offer}
              moveOffer={run.moveOffer}
              members={battle.player.members}
              picksLeft={run.rewardsLeft}
              onSelect={pickReward}
              onTeach={(target) =>
                setSession({ draft: null, run: takeMove(run, target) })
              }
              onPass={() => setSession({ draft: null, run: passMove(run) })}
            />
          ) : !readyToTravel(run) ? (
            <button type="button" onClick={() => pickReward(null)}>
              つぎへ
            </button>
          ) : run.route && run.route.length > 0 ? (
            <RouteChoice route={run.route} onSelect={travel} />
          ) : (
            <button type="button" onClick={() => travel(0)}>
              さいごの あいてへ
            </button>
          )}
        </section>
      ) : battle.awaitingSwitch === 'player' ? (
        <SwitchButtons
          team={battle.player}
          onSelect={sendReplacement}
          label="つぎに だすポケモンを えらんでください"
        />
      ) : partingMove ? (
        <SwitchButtons
          team={battle.player}
          onSelect={partWith}
          label={`${partingMove.name}の あとに だすポケモン`}
          onCancel={() => setPartingMove(null)}
        />
      ) : (
        <>
          <MoveButtons moves={player.moves} onSelect={useMove} />
          <SwitchButtons team={battle.player} onSelect={switchTo} label="こうたい" />
        </>
      )}
    </main>
  )
}
