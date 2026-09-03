import { describe, expect, it } from 'vitest'
import { activePokemon, isFainted, switchableIndexes } from './domain/entities'
import {
  forceSwitch,
  resolveTurn,
  type BattleState,
  type TurnAction,
} from './domain/battle'
import { chooseOpponentAction, scoreMove } from './domain/ai'
import { advance, canAdvance, startRun, withBattle } from './domain/run'

type Player = (battle: BattleState) => TurnAction | null

/** Always fires whatever move sits first in the list. */
const firstMove: Player = (battle) => {
  const move = activePokemon(battle.player).species.moves[0]
  return move ? { type: 'move', move } : null
}

/** Picks its best move, but never switches. */
const bestMove: Player = (battle) => {
  const me = activePokemon(battle.player)
  const them = activePokemon(battle.opponent)
  const best = me.species.moves.reduce<{ move: TurnAction; score: number } | null>(
    (top, move) => {
      const score = scoreMove(me, them, move)
      return !top || score > top.score ? { move: { type: 'move', move }, score } : top
    },
    null,
  )
  return best?.move ?? null
}

/** Picks its best move, and switches when the bench would do much better. */
const bestMoveAndSwitch: Player = (battle) => {
  const them = activePokemon(battle.opponent)
  const top = (pokemon: ReturnType<typeof activePokemon>) =>
    Math.max(...pokemon.species.moves.map((move) => scoreMove(pokemon, them, move)))

  const mine = top(activePokemon(battle.player))
  for (const index of switchableIndexes(battle.player)) {
    const member = battle.player.members[index]
    if (member && top(member) > mine * 1.6) return { type: 'switch', index }
  }
  return bestMove(battle)
}

function playRun(player: Player, opponentRandom: () => number): number {
  let run = startRun(Math.random)
  for (let turn = 0; turn < 4000; turn++) {
    if (run.finished) break
    if (canAdvance(run)) {
      // The bots take whatever is offered first, so a run keeps moving.
      run = advance(run, run.offer?.[0] ?? null, Math.random)
      continue
    }
    const battle = run.battle
    if (battle.awaitingSwitch === 'player') {
      const [index] = switchableIndexes(battle.player)
      if (index === undefined) break
      run = withBattle(run, forceSwitch(battle, 'player', index))
      continue
    }
    if (isFainted(activePokemon(battle.player))) break
    const action = player(battle)
    if (!action) break
    run = withBattle(
      run,
      resolveTurn(
        battle,
        action,
        chooseOpponentAction(battle, opponentRandom),
        Math.random,
      ),
    )
  }
  return run.wins
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

const measure = (player: Player, opponentRandom: () => number, runs = 200) =>
  mean(Array.from({ length: runs }, () => playRun(player, opponentRandom)))

/**
 * A measuring tool, not a test: it plays hundreds of runs with real randomness
 * and prints what it found, so it is slow and its numbers move between runs.
 * Skipped by default; `npm run sim` sets VITE_SIM and turns it on when the
 * difficulty is being tuned.
 */
describe.skipIf(!import.meta.env.VITE_SIM)('difficulty', () => {
  it('brackets it with players of different skill', () => {
    // At or above AI_CONFIG.skill the opponent never uses its scoring.
    const random = () => 0.995
    const rows = [
      ['first move only  ', measure(firstMove, Math.random), measure(firstMove, random)],
      ['best move        ', measure(bestMove, Math.random), measure(bestMove, random)],
      [
        'best + switching ',
        measure(bestMoveAndSwitch, Math.random),
        measure(bestMoveAndSwitch, random),
      ],
    ] as const
    console.log('\nwins per run (200 runs each)')
    console.log('player              vs thinking   vs random')
    for (const [name, smart, dumb] of rows) {
      console.log(
        `${name}   ${smart.toFixed(2).padStart(9)}   ${dumb.toFixed(2).padStart(9)}`,
      )
    }
    expect(rows).toHaveLength(3)
  })
})
