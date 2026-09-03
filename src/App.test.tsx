import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  it('starts with both sides at full health', () => {
    render(<App />)
    expect(screen.getByTestId('player-hp')).toHaveTextContent('95 / 95 HP')
    expect(screen.getByTestId('opponent-hp')).toHaveTextContent('104 / 104 HP')
  })

  it('shows the player the moves their Pokemon knows', () => {
    render(<App />)
    const moves = screen.getByRole('region', { name: 'わざ' })
    expect(moves).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /10まんボルト/ })).toBeInTheDocument()
  })

  it('damages the opponent when a move is used', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /10まんボルト/ }))

    const log = screen.getByTestId('battle-log')
    expect(log).toHaveTextContent('ピカチュウの 10まんボルト！')
    expect(screen.getByTestId('opponent-hp')).not.toHaveTextContent('104 / 104 HP')
  })

  it('offers a rematch once the battle is decided', async () => {
    const user = userEvent.setup()
    render(<App />)

    // 10まんボルト is 2x into ゼニガメ, so a handful of turns settles it.
    for (let i = 0; i < 12; i++) {
      const button = screen.queryByRole('button', { name: /10まんボルト/ })
      if (!button) break
      await user.click(button)
    }

    expect(
      screen.getByRole('button', { name: 'もういちど たたかう' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/たおした|たおれてしまった/)
  })
})
