import { beforeEach, describe, expect, it } from 'vitest'
import { clearProgress, loadProgress, recordClear } from './progress'
import { FIRST_TIER, TIER_CONFIG } from '../domain/tiers'

/** A stand-in for localStorage that the tests fully control. */
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  }
}

let storage: Storage
beforeEach(() => {
  storage = memoryStorage()
})

describe('loadProgress', () => {
  it('starts at nothing cleared', () => {
    expect(loadProgress(storage)).toBe(0)
  })

  it('drops a record it cannot parse', () => {
    storage.setItem('pokemon-battle:progress', '{ not json')
    expect(loadProgress(storage)).toBe(0)
  })

  it('drops a record from an older shape', () => {
    storage.setItem('pokemon-battle:progress', JSON.stringify({ version: 0, cleared: 4 }))
    expect(loadProgress(storage)).toBe(0)
  })

  it('refuses a tampered record rather than opening tiers that do not exist', () => {
    storage.setItem(
      'pokemon-battle:progress',
      JSON.stringify({ version: 1, cleared: 999 }),
    )
    expect(loadProgress(storage)).toBe(TIER_CONFIG.max)
  })

  it('refuses a negative record', () => {
    storage.setItem(
      'pokemon-battle:progress',
      JSON.stringify({ version: 1, cleared: -2 }),
    )
    expect(loadProgress(storage)).toBe(0)
  })
})

describe('recordClear', () => {
  it('writes down the tier that was cleared', () => {
    expect(recordClear(FIRST_TIER, storage)).toBe(FIRST_TIER)
    expect(loadProgress(storage)).toBe(FIRST_TIER)
  })

  it('never goes backwards', () => {
    recordClear(4, storage)
    expect(recordClear(1, storage)).toBe(4)
    expect(loadProgress(storage)).toBe(4)
  })

  it('will not record a tier that does not exist', () => {
    expect(recordClear(99, storage)).toBe(TIER_CONFIG.max)
  })

  it('forgets everything when cleared', () => {
    recordClear(3, storage)
    clearProgress(storage)
    expect(loadProgress(storage)).toBe(0)
  })

  it('keeps the standing record when the store refuses to write', () => {
    const blocked: Storage = {
      ...memoryStorage(),
      getItem: () => null,
      setItem: () => {
        throw new Error('full')
      },
    }
    expect(() => recordClear(2, blocked)).not.toThrow()
    expect(recordClear(2, blocked)).toBe(0)
  })
})
