import { describe, expect, it } from 'vitest'
import type { BattleEvent } from './events'
import { lastDamageBySide } from './events'

const hit = (side: 'player' | 'opponent', amount: number): BattleEvent => ({
  kind: 'damage',
  side,
  pokemon: side === 'player' ? 'ピカチュウ' : 'ゼニガメ',
  amount,
})

describe('lastDamageBySide', () => {
  it('reports nothing before anyone is hit', () => {
    expect(lastDamageBySide([{ kind: 'encounter', pokemon: 'ゼニガメ' }])).toEqual({
      player: null,
      opponent: null,
    })
  })

  it('keeps the latest hit for each side', () => {
    const marks = lastDamageBySide([
      hit('opponent', 30),
      hit('player', 20),
      hit('opponent', 45),
    ])
    expect(marks.opponent).toEqual({ index: 2, amount: 45 })
    expect(marks.player).toEqual({ index: 1, amount: 20 })
  })

  it('gives each hit its own index, so the UI can tell them apart', () => {
    const marks = lastDamageBySide([hit('opponent', 40), hit('opponent', 40)])
    expect(marks.opponent?.index).toBe(1)
  })

  it('ignores a hit that took nothing off', () => {
    // An immunity still records a damage event, at zero.
    expect(lastDamageBySide([hit('opponent', 0)]).opponent).toBeNull()
  })

  it('is unbothered by the other kinds of event', () => {
    const marks = lastDamageBySide([
      { kind: 'useMove', side: 'player', pokemon: 'ピカチュウ', move: '10まんボルト' },
      { kind: 'critical' },
      hit('opponent', 12),
      { kind: 'faint', side: 'opponent', pokemon: 'ゼニガメ' },
    ])
    expect(marks.opponent).toEqual({ index: 2, amount: 12 })
  })
})
