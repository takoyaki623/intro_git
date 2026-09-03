import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRun, loadRun, saveRun } from './storage'
import { advance, startRun, withBattle } from '../domain/run'
import { activePokemon } from '../domain/entities'
import { fixedRandom } from '../test/rng'

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

describe('saveRun and loadRun', () => {
  it('returns null when nothing is stored', () => {
    expect(loadRun(storage)).toBeNull()
  })

  it('brings a run back with its score and party intact', () => {
    const run = advance(
      withBattle(startRun(fixedRandom(0.3)), {
        ...startRun(fixedRandom(0.3)).battle,
        winner: 'player',
      }),
      fixedRandom(0.3),
    )
    saveRun(run, storage)

    const loaded = loadRun(storage)
    expect(loaded?.wins).toBe(run.wins)
    expect(loaded?.finished).toBe(false)
    expect(loaded?.battle.player.members.map((m) => m.species.id)).toEqual(
      run.battle.player.members.map((m) => m.species.id),
    )
    expect(activePokemon(loaded!.battle.opponent).level).toBe(
      activePokemon(run.battle.opponent).level,
    )
  })

  it('keeps damage and conditions', () => {
    const run = startRun(fixedRandom(0.3))
    const hurt = {
      ...run,
      battle: {
        ...run.battle,
        player: {
          ...run.battle.player,
          members: run.battle.player.members.map((m, i) =>
            i === 0 ? { ...m, currentHp: 7, status: { kind: 'poison' as const } } : m,
          ),
        },
      },
    }
    saveRun(hurt, storage)

    const loaded = loadRun(storage)
    expect(loaded?.battle.player.members[0]?.currentHp).toBe(7)
    expect(loaded?.battle.player.members[0]?.status).toEqual({ kind: 'poison' })
  })

  it('keeps which Pokemon is out, and an owed replacement', () => {
    const run = startRun(fixedRandom(0.3))
    const mid = {
      ...run,
      battle: {
        ...run.battle,
        player: { ...run.battle.player, activeIndex: 2 },
        awaitingSwitch: 'player' as const,
      },
    }
    saveRun(mid, storage)

    const loaded = loadRun(storage)
    expect(loaded?.battle.player.activeIndex).toBe(2)
    expect(loaded?.battle.awaitingSwitch).toBe('player')
  })

  it('starts the log fresh, since it is not saved', () => {
    const run = startRun(fixedRandom(0.3))
    saveRun(run, storage)
    expect(loadRun(storage)?.battle.events).toHaveLength(1)
  })

  it('clears the save', () => {
    saveRun(startRun(fixedRandom(0.3)), storage)
    clearRun(storage)
    expect(loadRun(storage)).toBeNull()
  })
})

describe('loadRun with a save it cannot trust', () => {
  const stored = (value: unknown) => {
    storage.setItem('pokemon-battle:run', JSON.stringify(value))
    return loadRun(storage)
  }

  it('rejects malformed JSON', () => {
    storage.setItem('pokemon-battle:run', '{ not json')
    expect(loadRun(storage)).toBeNull()
  })

  it('rejects a different version', () => {
    saveRun(startRun(fixedRandom(0.3)), storage)
    const raw = JSON.parse(storage.getItem('pokemon-battle:run')!)
    expect(stored({ ...raw, version: 99 })).toBeNull()
  })

  it('rejects a species that no longer exists', () => {
    saveRun(startRun(fixedRandom(0.3)), storage)
    const raw = JSON.parse(storage.getItem('pokemon-battle:run')!)
    raw.player.members[0].speciesId = 'mewtwo'
    expect(stored(raw)).toBeNull()
  })

  it('rejects an active index that points nowhere', () => {
    saveRun(startRun(fixedRandom(0.3)), storage)
    const raw = JSON.parse(storage.getItem('pokemon-battle:run')!)
    raw.player.activeIndex = 7
    expect(stored(raw)).toBeNull()
  })

  it('rejects an empty party and a negative score', () => {
    saveRun(startRun(fixedRandom(0.3)), storage)
    const raw = JSON.parse(storage.getItem('pokemon-battle:run')!)
    expect(stored({ ...raw, player: { members: [], activeIndex: 0 } })).toBeNull()
    expect(stored({ ...raw, wins: -1 })).toBeNull()
  })

  it('clamps HP that is out of range rather than trusting it', () => {
    saveRun(startRun(fixedRandom(0.3)), storage)
    const raw = JSON.parse(storage.getItem('pokemon-battle:run')!)
    raw.player.members[0].currentHp = 9999
    const loaded = stored(raw)
    const member = loaded?.battle.player.members[0]
    expect(member?.currentHp).toBe(member?.stats.hp)
  })
})

describe('a storage that refuses to cooperate', () => {
  it('does not throw when saving fails', () => {
    const broken = {
      ...memoryStorage(),
      setItem: vi.fn(() => {
        throw new Error('full')
      }),
    }
    expect(() => saveRun(startRun(fixedRandom(0.3)), broken as Storage)).not.toThrow()
  })

  it('reports no save when reading fails', () => {
    const broken = {
      ...memoryStorage(),
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    }
    expect(loadRun(broken as Storage)).toBeNull()
  })
})
