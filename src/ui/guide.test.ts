import { beforeEach, describe, expect, it } from 'vitest'
import { GUIDE_SECTIONS, forgetGuide, hasSeenGuide, markGuideSeen } from './guide'
import { RUN_CONFIG } from '../domain/run'
import { DRAFT_CONFIG } from '../domain/draft'
import { TIER_CONFIG } from '../domain/tiers'

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

describe('remembering that the rules were shown', () => {
  it('has not been seen to begin with', () => {
    expect(hasSeenGuide(storage)).toBe(false)
  })

  it('is seen once it has been marked', () => {
    markGuideSeen(storage)
    expect(hasSeenGuide(storage)).toBe(true)
  })

  it('can be forgotten again', () => {
    markGuideSeen(storage)
    forgetGuide(storage)
    expect(hasSeenGuide(storage)).toBe(false)
  })

  it('opens again rather than staying shut when the store cannot be read', () => {
    const blocked: Storage = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error('blocked')
      },
    }
    expect(hasSeenGuide(blocked)).toBe(false)
  })

  it('survives a store that refuses to write', () => {
    const blocked: Storage = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('full')
      },
    }
    expect(() => markGuideSeen(blocked)).not.toThrow()
  })
})

describe('what the rules say', () => {
  const text = GUIDE_SECTIONS.flatMap((part) => [part.heading, ...part.lines]).join('\n')

  it('reads the numbers off the config rather than repeating them', () => {
    expect(text).toContain(`${RUN_CONFIG.battlesToClear}かい`)
    expect(text).toContain(`${DRAFT_CONFIG.candidates}ひきから ${DRAFT_CONFIG.picks}びき`)
    expect(text).toContain(`${TIER_CONFIG.max}つ`)
  })

  it('explains the two words the draft screen assumes', () => {
    expect(text).toContain('しゅぞくち')
    expect(text).toContain('こうげき ○○')
  })

  it('says the things a first run turns on', () => {
    // Permanent faints, the type chart, and what switching costs: the three a
    // player cannot work out from the screen alone before it is too late.
    expect(text).toContain('もどりません')
    expect(text).toContain('あいしょう')
    expect(text).toContain('こうたいは 1ターン')
  })
})
