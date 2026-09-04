import { describe, expect, it } from 'vitest'
import { activePokemon, isFainted, switchableIndexes } from './domain/entities'
import type { Move } from './domain/entities'
import {
  forceSwitch,
  resolveTurn,
  type BattleState,
  type TurnAction,
} from './domain/battle'
import { chooseOpponentAction, scoreMove } from './domain/ai'
import {
  advance,
  canAdvance,
  passMove,
  startRun,
  takeMove,
  withBattle,
} from './domain/run'
import { DRAFT_CONFIG, startDraft } from './domain/draft'
import { baseStatTotal, type BattlePokemon, type Species } from './domain/entities'
import type { RewardTarget } from './domain/rewards'
import { targetsFor } from './domain/rewards'

type Player = (battle: BattleState) => TurnAction | null

/** Always fires whatever move sits first in the list. */
const firstMove: Player = (battle) => {
  const move = activePokemon(battle.player).moves[0]
  return move ? { type: 'move', move } : null
}

/**
 * Picks a legal move at random -- the floor for "does choosing a move matter".
 *
 * firstMove is not that floor: a fixed first slot is a policy, and a bad one,
 * because the list often opens with the strongest move against nothing in
 * particular. The gap between this and bestMove is what a turn's decision is
 * actually worth.
 */
const anyMove: Player = (battle) => {
  const moves = activePokemon(battle.player).moves
  const move = moves[Math.floor(Math.random() * moves.length)]
  return move ? { type: 'move', move } : null
}

/** The bench member that would do best against what is on the field. */
function bestReplacement(battle: BattleState): number | undefined {
  const them = activePokemon(battle.opponent)
  return switchableIndexes(battle.player).reduce<
    { index: number; score: number } | undefined
  >((best, index) => {
    const member = battle.player.members[index]
    if (!member) return best
    const score = Math.max(...member.moves.map((m) => scoreMove(member, them, m)))
    return !best || score > best.score ? { index, score } : best
  }, undefined)?.index
}

/**
 * Picks its best move, and never switches as its turn.
 *
 * It does name a replacement, because a move that switches its user out is not
 * being played at all without one -- that is the move, not a separate decision.
 */
const bestMove: Player = (battle) => {
  const me = activePokemon(battle.player)
  const them = activePokemon(battle.opponent)
  const best = me.moves.reduce<{ move: Move; score: number } | null>((top, move) => {
    const score = scoreMove(me, them, move)
    return !top || score > top.score ? { move, score } : top
  }, null)
  if (!best) return null
  return {
    type: 'move',
    move: best.move,
    ...(best.move.switchesOut ? { switchTo: bestReplacement(battle) } : {}),
  }
}

/** Picks its best move, and switches when the bench would do much better. */
const bestMoveAndSwitch: Player = (battle) => {
  const them = activePokemon(battle.opponent)
  const top = (pokemon: ReturnType<typeof activePokemon>) =>
    Math.max(...pokemon.moves.map((move) => scoreMove(pokemon, them, move)))

  const mine = top(activePokemon(battle.player))
  for (const index of switchableIndexes(battle.player)) {
    const member = battle.player.members[index]
    if (member && top(member) > mine * 1.6) return { type: 'switch', index }
  }
  return bestMove(battle)
}

/** How a run's party is assembled: dealt at random, or drafted from an offer. */
type Deal = () => readonly Species[] | undefined

/** The party the game deals when nobody drafts. */
const dealt: Deal = () => undefined

/**
 * Six offered, the three highest base stat totals taken -- a stand-in for a
 * player who reads the numbers on the cards.
 */
const draftByStats: Deal = () =>
  [...startDraft().candidates]
    .sort((a, b) => baseStatTotal(b) - baseStatTotal(a))
    .slice(0, DRAFT_CONFIG.picks)

interface Outcome {
  readonly wins: number
  /** The party's combined base stat total -- the draw, as one number. */
  readonly party: number
  /** Whether the run went the whole way. */
  readonly cleared: boolean
}

/**
 * A move's worth to a Pokemon with nobody in front of it: power, hit chance,
 * same-type bonus, and what the recoil costs. Crude on purpose -- it only has
 * to decide whether a free move beats the worst one already known.
 */
function shelfValue(member: BattlePokemon, move: Move): number {
  if (move.category === 'status') return 45
  const stab = member.species.types.includes(move.type) ? 1.5 : 1
  const attack =
    move.category === 'physical' ? member.stats.attack : member.stats.specialAttack
  const recoil = move.recoil ? 1 - move.recoil * 0.6 : 1
  return move.power * move.accuracy * stab * recoil * (attack / 100)
}

/**
 * Where a free move is worth the most, or null if nobody wants it.
 *
 * Every bot takes the move offer when it helps: it costs nothing, so passing it
 * up would measure a game nobody plays.
 */
function placeMove(members: readonly BattlePokemon[], move: Move): RewardTarget | null {
  const options = targetsFor({ kind: 'teach', move }, members).flatMap((index) => {
    const member = members[index]
    if (!member) return []
    const incoming = shelfValue(member, move)
    return member.moves.map((known, slot) => ({
      target: { member: index, slot },
      gain: incoming - shelfValue(member, known),
    }))
  })
  const best = options.reduce<(typeof options)[number] | null>(
    (top, option) => (!top || option.gain > top.gain ? option : top),
    null,
  )
  return best && best.gain > 0 ? best.target : null
}

/** One run's result: how far it got, and what it was holding when it started. */
function playRun(
  player: Player,
  opponentRandom: () => number,
  deal: Deal = dealt,
): Outcome {
  let run = startRun(Math.random, deal())
  const party = run.battle.player.members.reduce(
    (total, member) => total + baseStatTotal(member.species),
    0,
  )
  for (let turn = 0; turn < 4000; turn++) {
    if (run.finished) break
    if (canAdvance(run)) {
      if (run.moveOffer) {
        const target = placeMove(run.battle.player.members, run.moveOffer)
        run = target ? takeMove(run, target) : passMove(run)
        continue
      }
      // The bots take whatever is offered first, so a run keeps moving.
      run = advance(run, run.offer?.[0] ?? null, null, Math.random)
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
  return { wins: run.wins, party, cleared: run.cleared }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Minutes, not seconds: each block plays thousands of complete runs. */
const SIM_TIMEOUT = 600_000

/**
 * Mean wins per quartile of party strength.
 *
 * The gap between the first and last quartile is how much the party alone
 * decides the run -- which is the number the draft exists to bring down.
 */
function byPartyQuartile(outcomes: readonly Outcome[]): number[] {
  const sorted = [...outcomes].sort((a, b) => a.party - b.party)
  const size = Math.floor(sorted.length / 4)
  return [0, 1, 2, 3].map((quarter) =>
    mean(sorted.slice(quarter * size, (quarter + 1) * size).map((o) => o.wins)),
  )
}

/**
 * A measuring tool, not a test: it plays hundreds of runs with real randomness
 * and prints what it found, so it is slow and its numbers move between runs.
 * Skipped by default; `npm run sim` sets VITE_SIM and turns it on when the
 * difficulty is being tuned.
 *
 * Both blocks pass their own timeout. Thousands of full runs take minutes, and
 * on the default five seconds they printed the right numbers and then reported
 * themselves failed, which made `npm run sim` exit non-zero for years.
 */
describe.skipIf(!import.meta.env.VITE_SIM)('difficulty', () => {
  it(
    'brackets it with players of different skill',
    () => {
      const runs = 800
      // Drafted, because that is how a run actually starts now; a dealt party
      // measures a game nobody plays.
      const rows: [string, Player][] = [
        ['random move     ', anyMove],
        ['first slot only ', firstMove],
        ['best move       ', bestMove],
        ['best + switching', bestMoveAndSwitch],
      ]
      console.log(`\n${runs} drafted runs each, vs the thinking AI`)
      console.log('player              mean   cleared')
      for (const [name, player] of rows) {
        const out = Array.from({ length: runs }, () =>
          playRun(player, Math.random, draftByStats),
        )
        const cleared = out.filter((o) => o.cleared).length / out.length
        console.log(
          `${name}   ${mean(out.map((o) => o.wins))
            .toFixed(2)
            .padStart(5)}   ` + `${(cleared * 100).toFixed(1).padStart(6)}%`,
        )
      }
      expect(rows).toHaveLength(4)
    },
    SIM_TIMEOUT,
  )
})

/**
 * What the draft is for.
 *
 * The party the run was dealt used to decide it: sorted by base stat total, the
 * quartiles came out 1.55 / 1.93 / 2.73 / 5.39 wins -- a 3.5x spread, against
 * only 1.7x between a careless player and a competent one. Drafting cannot
 * remove the luck, but choosing three of six should lift the floor and pull the
 * quartiles together, which is what this measures.
 */
describe.skipIf(!import.meta.env.VITE_SIM)('the draft', () => {
  it(
    'narrows what the party alone decides',
    () => {
      const runs = 800
      const rows = [
        ['dealt three     ', dealt],
        ['drafted 3 of 6  ', draftByStats],
      ] as const

      console.log(`\nwins per run (${runs} runs each, best move + switching)`)
      console.log(
        'party               mean   zero wins   by party strength (weakest to strongest)',
      )
      for (const [name, deal] of rows) {
        const outcomes = Array.from({ length: runs }, () =>
          playRun(bestMoveAndSwitch, Math.random, deal),
        )
        const wins = outcomes.map((outcome) => outcome.wins)
        const blanked = wins.filter((count) => count === 0).length / wins.length
        const quartiles = byPartyQuartile(outcomes)
        console.log(
          `${name}  ${mean(wins).toFixed(2).padStart(6)}   ${(blanked * 100)
            .toFixed(0)
            .padStart(
              8,
            )}%   ${quartiles.map((q) => q.toFixed(2).padStart(5)).join(' ')}` +
            `   spread ${(quartiles[3]! / quartiles[0]!).toFixed(1)}x`,
        )
      }
      expect(rows).toHaveLength(2)
    },
    SIM_TIMEOUT,
  )
})
