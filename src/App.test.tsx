import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import App from './App'
import type { RunState } from './domain/run'
import { opponentLevel, startRun } from './domain/run'
import { createBattlePokemon, createTeam } from './domain/entities'
import { BOSS_LIST, SPECIES } from './data/species'
import { RUN_CONFIG } from './domain/run'
import { REWARD_CONFIG } from './domain/rewards'
import { DRAFT_CONFIG } from './domain/draft'
import { saveRun } from './ui/storage'
import { fixedRandom } from './test/rng'

// App now remembers a run, so each test needs a clean slate.
beforeEach(() => localStorage.clear())

const movePanel = () => screen.queryByRole('region', { name: 'わざ' })
const switchPanel = () => screen.queryByRole('region', { name: 'こうたい' })
const replacementPanel = () => screen.queryByRole('region', { name: /つぎに だす/ })
const rewardPanel = () => screen.queryByRole('region', { name: 'ごほうびを えらぶ' })

const enabledButtons = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole('button')
    .filter((button) => !button.hasAttribute('disabled'))

/** Play a turn however the battle currently allows, or report that it is over. */
async function advanceTurn(user: UserEvent): Promise<boolean> {
  const reward = rewardPanel()
  if (reward) {
    await user.click(enabledButtons(reward)[0]!)
    return true
  }
  const owed = replacementPanel()
  if (owed) {
    await user.click(enabledButtons(owed)[0]!)
    return true
  }
  const moves = movePanel()
  if (!moves) return false
  await user.click(enabledButtons(moves)[0]!)
  return true
}

const draftPanel = () => screen.queryByRole('region', { name: 'てもちを えらぶ' })

/** Take the first three candidates on the table and start the run. */
async function completeDraft(user: UserEvent) {
  const panel = draftPanel()
  if (!panel) throw new Error('the draft screen is not showing')
  const candidates = within(panel).getAllByRole('button').slice(0, DRAFT_CONFIG.picks)
  for (const candidate of candidates) await user.click(candidate)
  await user.click(screen.getByRole('button', { name: 'この てもちで はじめる' }))
}

const party = (
  ids: readonly (keyof typeof SPECIES)[],
  level: number = RUN_CONFIG.playerLevel,
) => createTeam(ids.map((id) => createBattlePokemon(SPECIES[id], level)))

/**
 * Put a run into storage so App picks it up on mount, with both parties pinned.
 *
 * Both sides are dealt at random now, so leaving them to chance would make
 * every assertion about a move name or an HP figure a coin flip.
 */
function seed(patch: (run: RunState) => RunState = (run) => run) {
  const base = startRun(fixedRandom(0.3))
  const run: RunState = {
    ...base,
    battle: {
      ...base.battle,
      player: party(['pikachu', 'charmander', 'bulbasaur']),
      opponent: party(['squirtle', 'zubat', 'geodude'], opponentLevel(0)),
    },
  }
  saveRun(patch(run))
}

describe('an unsaved run', () => {
  it('opens on the draft rather than a battle', () => {
    render(<App />)
    expect(draftPanel()).toBeInTheDocument()
    expect(movePanel()).toBeNull()
    expect(within(draftPanel()!).getAllByRole('button')).toHaveLength(
      DRAFT_CONFIG.candidates + 1,
    )
  })

  it('will not start until a full party is picked', async () => {
    const user = userEvent.setup()
    render(<App />)
    const start = screen.getByRole('button', { name: 'この てもちで はじめる' })
    expect(start).toBeDisabled()

    const candidates = within(draftPanel()!).getAllByRole('button')
    await user.click(candidates[0]!)
    await user.click(candidates[1]!)
    expect(start).toBeDisabled()

    await user.click(candidates[2]!)
    expect(start).toBeEnabled()
  })

  it('puts a candidate back when it is tapped again', async () => {
    const user = userEvent.setup()
    render(<App />)
    const first = within(draftPanel()!).getAllByRole('button')[0]!

    await user.click(first)
    expect(first).toHaveAttribute('aria-pressed', 'true')
    await user.click(first)
    expect(first).toHaveAttribute('aria-pressed', 'false')
  })

  it('starts the streak at zero with the party that was picked', async () => {
    const user = userEvent.setup()
    render(<App />)
    const names = within(draftPanel()!)
      .getAllByRole('button')
      .slice(0, DRAFT_CONFIG.picks)
      .map((button) => button.querySelector('strong')?.textContent)

    await completeDraft(user)

    expect(screen.getByTestId('run-status')).toHaveTextContent('れんしょう 0')
    expect(screen.getByTestId('player-team')).toHaveAccessibleName('てもち のこり 3')
    expect(screen.getByTestId('player-hp').textContent).toMatch(/^(\d+) \/ \1 HP$/)
    // The first one taken leads, and the rest are on the bench in pick order.
    const bench = within(switchPanel()!)
      .getAllByRole('button')
      .map((button) => button.querySelector('strong')?.textContent)
    expect(bench).toEqual(names)
  })

  it('deals different candidates across runs', () => {
    const dealt = new Set<string>()
    for (let i = 0; i < 25; i++) {
      localStorage.clear()
      const { unmount } = render(<App />)
      dealt.add(within(draftPanel()!).getAllByRole('button')[0]!.textContent ?? '')
      unmount()
    }
    expect(dealt.size).toBeGreaterThan(1)
  })

  it('holds the same candidates across a reload, so the offer cannot be re-rolled', () => {
    const first = render(<App />)
    const dealt = within(draftPanel()!)
      .getAllByRole('button')
      .map((button) => button.textContent)
    first.unmount()

    render(<App />)
    expect(
      within(draftPanel()!)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(dealt)
  })

  it('keeps the picks made so far across a reload', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await user.click(within(draftPanel()!).getAllByRole('button')[0]!)
    first.unmount()

    render(<App />)
    expect(within(draftPanel()!).getAllByRole('button')[0]!).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('a fresh run', () => {
  // Seeded, so the opposing party is fixed. Drawn at random it can field the
  // same species the player has, and assertions on log lines then go ambiguous
  // about which side did what.
  beforeEach(() => seed())

  it('starts with a full party and nothing won', () => {
    render(<App />)
    expect(screen.getByTestId('player-hp')).toHaveTextContent('95 / 95 HP')
    expect(screen.getByTestId('run-status')).toHaveTextContent('れんしょう 0')
    expect(screen.getByTestId('player-team')).toHaveAccessibleName('てもち のこり 3')
  })

  it('shows the level the opponent is fighting at', () => {
    render(<App />)
    // Derived, so retuning RUN_CONFIG does not break the test.
    expect(screen.getByTestId('run-status')).toHaveTextContent(
      `あいて Lv${opponentLevel(0)}`,
    )
  })

  it('offers the active Pokemon its own moves', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /10まんボルト/ })).toBeInTheDocument()
  })

  it('shows the types of both Pokemon on the field', () => {
    render(<App />)
    expect(screen.getByTestId('player-card')).toHaveTextContent('でんき')
    expect(screen.getByTestId('opponent-card')).toHaveTextContent('みず')
  })

  it('shows both types of a dual-type Pokemon', () => {
    seed((run) => ({
      ...run,
      battle: { ...run.battle, player: party(['bulbasaur']) },
    }))
    render(<App />)
    const card = screen.getByTestId('player-card')
    expect(card).toHaveTextContent('くさ')
    expect(card).toHaveTextContent('どく')
  })

  it('tells the player what a move will do beyond its damage', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /でんじは/ })).toHaveTextContent('まひ')
    expect(screen.getByRole('button', { name: /10まんボルト/ })).toHaveTextContent(
      'まひ 10%',
    )
  })

  it('shows accuracy only on the moves that can miss', () => {
    seed((run) => ({
      ...run,
      battle: { ...run.battle, player: party(['bulbasaur']) },
    }))
    render(<App />)
    expect(screen.getByRole('button', { name: /はっぱカッター/ })).toHaveTextContent(
      '命中 95',
    )
    expect(screen.getByRole('button', { name: /つるのムチ/ })).not.toHaveTextContent(
      '命中',
    )
  })

  it('labels a status move as へんか rather than showing zero power', () => {
    render(<App />)
    const denjiha = screen.getByRole('button', { name: /でんじは/ })
    expect(denjiha).toHaveTextContent('でんき・へんか')
    expect(denjiha).not.toHaveTextContent('威力')
  })

  it('damages the opponent when a move is used', async () => {
    const user = userEvent.setup()
    render(<App />)
    const before = screen.getByTestId('opponent-hp').textContent
    await user.click(screen.getByRole('button', { name: /10まんボルト/ }))

    expect(screen.getByTestId('battle-log')).toHaveTextContent(
      'ピカチュウの 10まんボルト！',
    )
    expect(screen.getByTestId('opponent-hp')).not.toHaveTextContent(before!)
  })

  it('flashes what the last hit took off', async () => {
    // A single opponent, because a party of three would switch away from
    // 10まんボルト and the hit would land somewhere the test is not looking.
    seed((run) => ({
      ...run,
      battle: { ...run.battle, opponent: party(['squirtle'], opponentLevel(0)) },
    }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /10まんボルト/ }))

    // The figure sits on the card of whoever was hit.
    expect(screen.getByTestId('opponent-card').textContent).toMatch(/-\d+/)
  })

  it('keeps the newest line of the log in view', async () => {
    const user = userEvent.setup()
    render(<App />)
    const log = screen.getByTestId('battle-log')
    // jsdom reports no layout, so drive the values the effect reads.
    Object.defineProperty(log, 'scrollHeight', { value: 500, configurable: true })

    await user.click(within(movePanel()!).getAllByRole('button')[0]!)
    expect(log.scrollTop).toBe(500)
  })

  it('shows types in the switch panel, since choosing is a type decision', () => {
    render(<App />)
    const panel = switchPanel()!
    expect(within(panel).getByRole('button', { name: /フシギダネ/ })).toHaveTextContent(
      'くさ',
    )
    expect(within(panel).getByRole('button', { name: /ヒトカゲ/ })).toHaveTextContent(
      'ほのお',
    )
  })

  it('will not let the player switch to the Pokemon already out', () => {
    render(<App />)
    const panel = switchPanel()!
    expect(within(panel).getByRole('button', { name: /ピカチュウ/ })).toBeDisabled()
    expect(within(panel).getByRole('button', { name: /フシギダネ/ })).toBeEnabled()
  })

  it('swaps the active Pokemon, and the turn goes to the opponent', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(within(switchPanel()!).getByRole('button', { name: /フシギダネ/ }))

    expect(screen.getByTestId('battle-log')).toHaveTextContent('ゆけっ！ フシギダネ！')
    expect(screen.getByRole('button', { name: /はっぱカッター/ })).toBeInTheDocument()
    // ピカチュウ gave up its attack to switch. Which side used which move is
    // checked properly in battle.test.ts, where the events are readable.
    expect(screen.getByTestId('battle-log')).not.toHaveTextContent('10まんボルト')
  })
})

describe('winning a battle', () => {
  beforeEach(() => {
    seed((run) => ({ ...run, battle: { ...run.battle, winner: 'player' } }))
  })

  it('offers rewards instead of more moves', () => {
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('たおした！')
    expect(rewardPanel()).not.toBeNull()
    expect(movePanel()).toBeNull()
  })

  it('never offers more than the configured number of rewards', () => {
    render(<App />)
    expect(enabledButtons(rewardPanel()!).length).toBeLessThanOrEqual(
      REWARD_CONFIG.choices,
    )
  })

  it('raises the streak and the level once a reward is taken', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(enabledButtons(rewardPanel()!)[0]!)

    expect(screen.getByTestId('run-status')).toHaveTextContent('れんしょう 1')
    expect(screen.getByTestId('run-status')).toHaveTextContent(
      `あいて Lv${opponentLevel(1)}`,
    )
    expect(movePanel()).not.toBeNull()
    expect(rewardPanel()).toBeNull()
  })

  it('levels the party up when that is the reward taken', async () => {
    seed((run) => ({
      ...run,
      battle: { ...run.battle, winner: 'player' },
      offer: ['levelUp'],
    }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /レベルアップ/ }))

    expect(screen.getByTestId('player-card')).toHaveTextContent(
      `Lv${RUN_CONFIG.playerLevel + REWARD_CONFIG.levelsGained}`,
    )
  })

  it('adds a fourth member when the recruit is taken', async () => {
    seed((run) => ({
      ...run,
      battle: { ...run.battle, winner: 'player' },
      offer: ['recruit'],
    }))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /なかまを ふやす/ }))

    expect(within(switchPanel()!).getAllByRole('button')).toHaveLength(4)
    expect(screen.getByTestId('player-team')).toHaveAccessibleName('てもち のこり 4')
  })
})

describe('losing a run', () => {
  beforeEach(() => {
    seed((run) => ({
      ...run,
      wins: 4,
      finished: true,
      battle: { ...run.battle, winner: 'opponent' },
    }))
  })

  it('reports the streak it ended on', () => {
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('4れんしょうで おわり')
    expect(screen.getByRole('button', { name: 'はじめから' })).toBeInTheDocument()
  })

  it('starts over at a fresh draft, not straight into a battle', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'はじめから' }))

    expect(draftPanel()).toBeInTheDocument()
    expect(localStorage.getItem('pokemon-battle:run')).toBeNull()

    await completeDraft(user)
    expect(screen.getByTestId('run-status')).toHaveTextContent('れんしょう 0')
    expect(screen.getByTestId('player-hp').textContent).toMatch(/^(\d+) \/ \1 HP$/)
    expect(screen.getByTestId('player-team')).toHaveAccessibleName('てもち のこり 3')
  })
})

describe('remembering a run', () => {
  it('picks up where a saved run left off', () => {
    seed((run) => ({
      ...run,
      wins: 2,
      battle: {
        ...run.battle,
        player: {
          ...run.battle.player,
          members: run.battle.player.members.map((m, i) =>
            i === 0 ? { ...m, currentHp: 12 } : m,
          ),
        },
      },
    }))
    render(<App />)
    expect(screen.getByTestId('run-status')).toHaveTextContent('れんしょう 2')
    expect(screen.getByTestId('player-hp')).toHaveTextContent('12 / 95 HP')
  })

  it('saves as the battle goes on', async () => {
    seed()
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /10まんボルト/ }))
    expect(localStorage.getItem('pokemon-battle:run')).toBeTruthy()
  })
})

describe('playing a battle out', () => {
  it('reaches a decision one way or the other', async () => {
    const user = userEvent.setup()
    render(<App />)
    await completeDraft(user)

    for (let i = 0; i < 80; i++) if (!(await advanceTurn(user))) break

    expect(screen.getByRole('status')).toHaveTextContent(/たおした|たおれてしまった/)
    expect(screen.getByTestId('battle-log')).toHaveTextContent('たおれた')
  })
})

describe('the last battle', () => {
  /** A save sitting on the final battle, against a boss on its last legs. */
  const seedFinal = (patch: (run: RunState) => RunState = (run) => run) => {
    const base = startRun(fixedRandom(0.3))
    const wins = RUN_CONFIG.battlesToClear - 1
    const boss = createBattlePokemon(BOSS_LIST[0]!, opponentLevel(wins))
    saveRun(
      patch({
        ...base,
        wins,
        battle: {
          ...base.battle,
          player: party(['pikachu', 'charmander', 'bulbasaur']),
          opponent: createTeam([{ ...boss, currentHp: 1 }]),
        },
      }),
    )
  }

  it('names itself in the status line', () => {
    seedFinal()
    render(<App />)
    expect(screen.getByTestId('run-status')).toHaveTextContent('さいしゅうせん')
    expect(screen.getByTestId('run-status')).toHaveTextContent(
      `れんしょう ${RUN_CONFIG.battlesToClear - 1} / ${RUN_CONFIG.battlesToClear}`,
    )
  })

  it('fields the boss alone', () => {
    seedFinal()
    render(<App />)
    expect(screen.getByTestId('opponent-team')).toHaveAttribute(
      'aria-label',
      'あいての てもち のこり 1',
    )
    expect(screen.getByTestId('opponent-card')).toHaveTextContent(BOSS_LIST[0]!.name)
  })

  it('clears the run when it is won, with no reward to choose', async () => {
    const user = userEvent.setup()
    seedFinal()
    render(<App />)

    // The boss is on 1 HP, so the first move that lands finishes it.
    for (let i = 0; i < 20 && movePanel(); i++) {
      await user.click(enabledButtons(movePanel()!)[0]!)
    }

    expect(screen.getByRole('status')).toHaveTextContent('ぜんぶ かちぬいた')
    expect(screen.getByTestId('run-status')).toHaveTextContent(
      `れんしょう ${RUN_CONFIG.battlesToClear}`,
    )
    expect(rewardPanel()).toBeNull()
    expect(screen.getByRole('button', { name: 'もういちど' })).toBeInTheDocument()
  })

  it('records the clear in the hall of fame', async () => {
    const user = userEvent.setup()
    seedFinal()
    render(<App />)
    for (let i = 0; i < 20 && movePanel(); i++) {
      await user.click(enabledButtons(movePanel()!)[0]!)
    }
    expect(screen.getByTestId('hall-of-fame')).toHaveTextContent('クリア')
  })

  it('sends もういちど back to a fresh draft', async () => {
    const user = userEvent.setup()
    seedFinal()
    render(<App />)
    for (let i = 0; i < 20 && movePanel(); i++) {
      await user.click(enabledButtons(movePanel()!)[0]!)
    }
    await user.click(screen.getByRole('button', { name: 'もういちど' }))
    expect(draftPanel()).toBeInTheDocument()
  })

  it('survives a reload once cleared', async () => {
    const user = userEvent.setup()
    seedFinal()
    const first = render(<App />)
    for (let i = 0; i < 20 && movePanel(); i++) {
      await user.click(enabledButtons(movePanel()!)[0]!)
    }
    first.unmount()

    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('ぜんぶ かちぬいた')
  })
})
