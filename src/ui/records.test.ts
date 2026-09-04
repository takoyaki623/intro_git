import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearBest, loadBest, recordRun } from './records'
import { RUN_CONFIG, startRun } from '../domain/run'
import { fixedRandom } from '../test/rng'

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

const runWith = (wins: number) => ({
  ...startRun(fixedRandom(0.3)),
  wins,
  finished: true,
})
const onJan = () => new Date('2026-01-15T09:00:00Z')

let storage: Storage
beforeEach(() => {
  storage = memoryStorage()
})

describe('recordRun', () => {
  it('writes the first run down', () => {
    const best = recordRun(runWith(3), storage, onJan)
    expect(best?.wins).toBe(3)
    expect(best?.achievedOn).toBe('2026-01-15')
    expect(best?.party).toHaveLength(3)
    expect(best?.party[0]?.name).toBeTruthy()
  })

  it('keeps the better of the two', () => {
    recordRun(runWith(5), storage, onJan)
    const after = recordRun(runWith(2), storage, onJan)
    expect(after?.wins).toBe(5)
  })

  it('does not overwrite on a tie, so the older record stands', () => {
    recordRun(runWith(4), storage, () => new Date('2026-01-01T00:00:00Z'))
    const after = recordRun(runWith(4), storage, () => new Date('2026-02-02T00:00:00Z'))
    expect(after?.achievedOn).toBe('2026-01-01')
  })

  it('does not treat a run that won nothing as a record', () => {
    expect(recordRun(runWith(0), storage, onJan)).toBeNull()
    expect(loadBest(storage)).toBeNull()
  })

  it('leaves a standing record alone when the next run wins nothing', () => {
    recordRun(runWith(4), storage, onJan)
    expect(recordRun(runWith(0), storage, onJan)?.wins).toBe(4)
  })

  it('records the party that managed it', () => {
    const run = runWith(1)
    const best = recordRun(run, storage, onJan)
    expect(best?.party.map((m) => m.speciesId)).toEqual(
      run.battle.player.members.map((m) => m.species.id),
    )
  })

  it('survives a storage that refuses to write', () => {
    const broken = {
      ...memoryStorage(),
      setItem: vi.fn(() => {
        throw new Error('full')
      }),
    }
    expect(() => recordRun(runWith(2), broken as Storage, onJan)).not.toThrow()
  })
})

describe('loadBest', () => {
  it('reports nothing before any run is recorded', () => {
    expect(loadBest(storage)).toBeNull()
  })

  it('brings a record back', () => {
    recordRun(runWith(6), storage, onJan)
    expect(loadBest(storage)?.wins).toBe(6)
  })

  const stored = (value: unknown) => {
    storage.setItem('pokemon-battle:best', JSON.stringify(value))
    return loadBest(storage)
  }

  it('rejects malformed JSON', () => {
    storage.setItem('pokemon-battle:best', '{ not json')
    expect(loadBest(storage)).toBeNull()
  })

  it('rejects a different version, a bad score, or a missing party', () => {
    recordRun(runWith(3), storage, onJan)
    const raw = JSON.parse(storage.getItem('pokemon-battle:best')!)
    expect(stored({ ...raw, version: 99 })).toBeNull()
    expect(stored({ ...raw, wins: -1 })).toBeNull()
    expect(stored({ ...raw, party: 'nope' })).toBeNull()
  })

  it('falls back to current data when a stored name is missing', () => {
    recordRun(runWith(3), storage, onJan)
    const raw = JSON.parse(storage.getItem('pokemon-battle:best')!)
    raw.party[0].name = undefined
    expect(stored(raw)?.party[0]?.name).toBeTruthy()
  })

  it('reports nothing after the record is cleared', () => {
    recordRun(runWith(3), storage, onJan)
    clearBest(storage)
    expect(loadBest(storage)).toBeNull()
  })
})

describe('a cleared run in the book', () => {
  it('is marked as cleared', () => {
    recordRun({ ...runWith(RUN_CONFIG.battlesToClear), cleared: true }, storage)
    expect(loadBest(storage)?.cleared).toBe(true)
  })

  it('is not marked when the run merely ended', () => {
    recordRun(runWith(3), storage)
    expect(loadBest(storage)?.cleared).toBe(false)
  })

  it('reads a record written before runs could be cleared as uncleared', () => {
    recordRun(runWith(3), storage)
    const stored = JSON.parse(storage.getItem('pokemon-battle:best')!) as Record<
      string,
      unknown
    >
    delete stored.cleared
    storage.setItem('pokemon-battle:best', JSON.stringify(stored))
    expect(loadBest(storage)?.cleared).toBe(false)
  })
})
