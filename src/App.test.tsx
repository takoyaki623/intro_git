import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import App from './App'
import { startRun } from './domain/run'
import { saveRun } from './ui/storage'
import { fixedRandom } from './test/rng'

// App now remembers a run, so each test needs a clean slate.
beforeEach(() => localStorage.clear())

const movePanel = () => screen.queryByRole('region', { name: 'わざ' })
const switchPanel = () => screen.queryByRole('region', { name: 'こうたい' })
const replacementPanel = () => screen.queryByRole('region', { name: /つぎに だす/ })

const enabledButtons = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole('button')
    .filter((button) => !button.hasAttribute('disabled'))

/** Play a turn however the battle currently allows, or report that it is over. */
async function advanceTurn(user: UserEvent): Promise<boolean> {
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

/** Put a run into storage so App picks it up on mount. */
function seed(patch: (run: ReturnType<typeof startRun>) => ReturnType<typeof startRun>) {
  saveRun(patch(startRun(fixedRandom(0.3))))
}

describe('a fresh run', () => {
  it('starts with a full party and nothing won', () => {
    render(<App />)
    expect(screen.getByTestId('player-hp')).toHaveTextContent('95 / 95 HP')
    expect(screen.getByTestId('run-status')).toHaveTextContent('れんしょう 0')
    expect(screen.getByTestId('player-team')).toHaveAccessibleName('てもち のこり 3')
  })

  it('shows the level the opponent is fighting at', () => {
    render(<App />)
    expect(screen.getByTestId('run-status')).toHaveTextContent('あいて Lv50')
  })

  it('offers the active Pokemon its own moves', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /10まんボルト/ })).toBeInTheDocument()
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
    expect(screen.getByTestId('battle-log')).not.toHaveTextContent(
      'ピカチュウの 10まんボルト！',
    )
  })
})

describe('winning a battle', () => {
  beforeEach(() => {
    seed((run) => ({ ...run, battle: { ...run.battle, winner: 'player' } }))
  })

  it('offers the next opponent instead of more moves', () => {
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('たおした！')
    expect(screen.getByRole('button', { name: 'つぎの あいて' })).toBeInTheDocument()
    expect(movePanel()).toBeNull()
  })

  it('raises the streak and the level when the player moves on', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'つぎの あいて' }))

    expect(screen.getByTestId('run-status')).toHaveTextContent('れんしょう 1')
    expect(screen.getByTestId('run-status')).toHaveTextContent('あいて Lv52')
    expect(movePanel()).not.toBeNull()
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

  it('starts over with a clean party and no streak', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'はじめから' }))

    expect(screen.getByTestId('run-status')).toHaveTextContent('れんしょう 0')
    expect(screen.getByTestId('player-hp')).toHaveTextContent('95 / 95 HP')
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

    for (let i = 0; i < 80; i++) if (!(await advanceTurn(user))) break

    expect(screen.getByRole('status')).toHaveTextContent(/たおした|たおれてしまった/)
    expect(screen.getByTestId('battle-log')).toHaveTextContent('たおれた')
  })
})
