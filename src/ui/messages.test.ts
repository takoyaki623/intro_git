import { describe, expect, it } from 'vitest'
import type { BattleEvent } from '../domain/events'
import { POKEMON_TYPES } from '../domain/types'
import { TYPE_NAMES, formatEvent, formatLog, outcomeMessage } from './messages'

describe('formatEvent', () => {
  it('narrates the start of a battle', () => {
    expect(formatEvent({ kind: 'encounter', pokemon: 'ゼニガメ' })).toBe(
      'やせいの ゼニガメが とびだしてきた！',
    )
  })

  it('narrates a move, a miss and a faint', () => {
    expect(
      formatEvent({
        kind: 'useMove',
        side: 'player',
        pokemon: 'ピカチュウ',
        move: '10まんボルト',
      }),
    ).toBe('ピカチュウの 10まんボルト！')
    expect(formatEvent({ kind: 'miss', side: 'player', pokemon: 'ピカチュウ' })).toBe(
      'ピカチュウの こうげきは はずれた！',
    )
    expect(formatEvent({ kind: 'faint', side: 'opponent', pokemon: 'ゼニガメ' })).toBe(
      'ゼニガメは たおれた！',
    )
    expect(formatEvent({ kind: 'critical' })).toBe('きゅうしょに あたった！')
  })

  it('picks the wording for each effectiveness band', () => {
    const at = (multiplier: number) =>
      formatEvent({ kind: 'effectiveness', multiplier, target: 'ゼニガメ' })
    expect(at(2)).toBe('こうかは ばつぐんだ！')
    expect(at(4)).toBe('こうかは ばつぐんだ！')
    expect(at(0.5)).toBe('こうかは いまひとつのようだ...')
    expect(at(0)).toBe('ゼニガメには こうかが ないようだ...')
    expect(at(1)).toBeNull()
  })

  it('stays quiet about the damage figure, as the games do', () => {
    expect(
      formatEvent({ kind: 'damage', side: 'opponent', pokemon: 'ゼニガメ', amount: 42 }),
    ).toBeNull()
  })
})

describe('formatLog', () => {
  it('drops the silent events', () => {
    const events: BattleEvent[] = [
      { kind: 'useMove', side: 'player', pokemon: 'ピカチュウ', move: '10まんボルト' },
      { kind: 'effectiveness', multiplier: 1, target: 'ゼニガメ' },
      { kind: 'damage', side: 'opponent', pokemon: 'ゼニガメ', amount: 42 },
      { kind: 'faint', side: 'opponent', pokemon: 'ゼニガメ' },
    ]
    expect(formatLog(events)).toEqual([
      'ピカチュウの 10まんボルト！',
      'ゼニガメは たおれた！',
    ])
  })
})

describe('TYPE_NAMES', () => {
  it('names every type', () => {
    for (const type of POKEMON_TYPES) {
      expect(TYPE_NAMES[type], `${type} has no Japanese name`).toBeTruthy()
    }
  })
})

describe('outcomeMessage', () => {
  it('reads differently for each side', () => {
    expect(outcomeMessage('player', 'ピカチュウ', 'ゼニガメ')).toBe(
      'ゼニガメを たおした！',
    )
    expect(outcomeMessage('opponent', 'ピカチュウ', 'ゼニガメ')).toBe(
      'ピカチュウは たおれてしまった...',
    )
  })
})
