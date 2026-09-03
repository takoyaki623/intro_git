import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import App from './App'

const movePanel = () => screen.queryByRole('region', { name: 'わざ' })
const switchPanel = () => screen.queryByRole('region', { name: 'こうたい' })
const replacementPanel = () => screen.queryByRole('region', { name: /つぎに だす/ })

const enabledButtons = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole('button')
    .filter((button) => !button.hasAttribute('disabled'))

/** Play a turn however the battle currently allows, or report that it is over. */
async function advance(user: UserEvent): Promise<boolean> {
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

describe('App', () => {
  it('starts with both leaders out at full health', () => {
    render(<App />)
    expect(screen.getByTestId('player-hp')).toHaveTextContent('95 / 95 HP')
    expect(screen.getByTestId('opponent-hp')).toHaveTextContent('104 / 104 HP')
    expect(screen.getByTestId('battle-log')).toHaveTextContent(
      'やせいの ゼニガメが とびだしてきた！',
    )
  })

  it('shows how much of each party is left', () => {
    render(<App />)
    expect(screen.getByTestId('player-team')).toHaveAccessibleName('てもち のこり 3')
    expect(screen.getByTestId('opponent-team')).toHaveAccessibleName(
      'あいての てもち のこり 3',
    )
  })

  it('offers the active Pokemon its own moves', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /10まんボルト/ })).toBeInTheDocument()
  })

  it('damages the opponent when a move is used', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /10まんボルト/ }))

    expect(screen.getByTestId('battle-log')).toHaveTextContent(
      'ピカチュウの 10まんボルト！',
    )
    expect(screen.getByTestId('opponent-hp')).not.toHaveTextContent('104 / 104 HP')
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
    // Switching costs the turn, so ピカチュウ never attacked.
    expect(screen.getByTestId('battle-log')).not.toHaveTextContent(
      'ピカチュウの 10まんボルト！',
    )
  })

  it('plays through to a result, with replacements sent out along the way', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (let i = 0; i < 60; i++) if (!(await advance(user))) break

    expect(screen.getByRole('status')).toHaveTextContent(/たおした|たおれてしまった/)
    expect(
      screen.getByRole('button', { name: 'もういちど たたかう' }),
    ).toBeInTheDocument()
    // A whole party has to fall, so a side ran out of replacements.
    const log = screen.getByTestId('battle-log')
    expect(log).toHaveTextContent('たおれた')
    expect(log).toHaveTextContent('くりだした')
  })

  it('resets both parties on a rematch', async () => {
    const user = userEvent.setup()
    render(<App />)
    for (let i = 0; i < 60; i++) if (!(await advance(user))) break

    await user.click(screen.getByRole('button', { name: 'もういちど たたかう' }))
    expect(screen.getByTestId('player-hp')).toHaveTextContent('95 / 95 HP')
    expect(screen.getByTestId('player-team')).toHaveAccessibleName('てもち のこり 3')
    expect(screen.getByTestId('opponent-team')).toHaveAccessibleName(
      'あいての てもち のこり 3',
    )
  })
})
