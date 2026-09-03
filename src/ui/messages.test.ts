import { describe, expect, it } from 'vitest'
import type { BattleEvent } from '../domain/events'
import { POKEMON_TYPES } from '../domain/types'
import type { StatusKind } from '../domain/status'
import { STAT_KEYS } from '../domain/stages'
import {
  STAT_NAMES,
  STATUS_NAMES,
  TYPE_NAMES,
  formatEvent,
  formatLog,
  outcomeMessage,
} from './messages'

const ALL_STATUSES: readonly StatusKind[] = [
  'poison',
  'burn',
  'paralysis',
  'sleep',
  'freeze',
]

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

describe('status wording', () => {
  it.each(ALL_STATUSES)('names %s', (status) => {
    expect(STATUS_NAMES[status]).toBeTruthy()
  })

  it.each(ALL_STATUSES)('announces %s being inflicted', (status) => {
    const line = formatEvent({
      kind: 'statusInflicted',
      side: 'opponent',
      pokemon: 'ゼニガメ',
      status,
    })
    expect(line).toContain('ゼニガメ')
  })

  it.each(ALL_STATUSES)('announces being held up by %s', (status) => {
    const line = formatEvent({
      kind: 'immobilised',
      side: 'player',
      pokemon: 'ピカチュウ',
      status,
    })
    expect(line).toContain('ピカチュウ')
  })

  it.each(ALL_STATUSES)('announces %s wearing off', (status) => {
    const line = formatEvent({
      kind: 'statusEnded',
      side: 'player',
      pokemon: 'ピカチュウ',
      status,
    })
    expect(line).toContain('ピカチュウ')
  })

  it('uses the wording the games use for the ones players see most', () => {
    expect(
      formatEvent({
        kind: 'statusInflicted',
        side: 'opponent',
        pokemon: 'ゼニガメ',
        status: 'paralysis',
      }),
    ).toBe('ゼニガメは まひして わざが でにくくなった！')
    expect(
      formatEvent({
        kind: 'immobilised',
        side: 'player',
        pokemon: 'ピカチュウ',
        status: 'sleep',
      }),
    ).toBe('ピカチュウは ぐうぐう ねむっている')
    expect(
      formatEvent({
        kind: 'statusEnded',
        side: 'player',
        pokemon: 'ピカチュウ',
        status: 'freeze',
      }),
    ).toBe('ピカチュウの こおりが とけた！')
  })

  it('names the condition in the end-of-turn tick', () => {
    expect(
      formatEvent({
        kind: 'statusDamage',
        side: 'opponent',
        pokemon: 'ゼニガメ',
        status: 'poison',
        amount: 13,
      }),
    ).toBe('ゼニガメは どくの ダメージを うけている！')
  })
})

describe('stat stage wording', () => {
  const stage = (stat: 'attack' | 'speed', delta: number, applied: number) =>
    formatEvent({
      kind: 'statStage',
      side: 'player',
      pokemon: 'ヒトカゲ',
      stat,
      delta,
      applied,
    })

  it('words each size of change the way the games do', () => {
    expect(stage('attack', 1, 1)).toBe('ヒトカゲの こうげきが あがった！')
    expect(stage('attack', 2, 2)).toBe('ヒトカゲの こうげきが ぐーんと あがった！')
    expect(stage('speed', -1, -1)).toBe('ヒトカゲの すばやさが さがった！')
    expect(stage('speed', -2, -2)).toBe('ヒトカゲの すばやさが がくっと さがった！')
  })

  it('says nothing moved when the stat is already at its limit', () => {
    expect(stage('attack', 2, 0)).toBe('ヒトカゲの こうげきは もう あがらない！')
    expect(stage('speed', -1, 0)).toBe('ヒトカゲの すばやさは もう さがらない！')
  })

  it('names every stat', () => {
    for (const stat of STAT_KEYS) {
      expect(STAT_NAMES[stat]).toBeTruthy()
    }
  })
})
