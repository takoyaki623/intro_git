import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDraft, clearRun, loadDraft, loadRun, saveDraft, saveRun } from './storage'
import { advance, startRun, withBattle } from '../domain/run'
import { DRAFT_CONFIG, startDraft, togglePick } from '../domain/draft'
import { BOSS_LIST } from '../data/species'
import { FIRST_TIER, TIER_CONFIG } from '../domain/tiers'
import type { RewardKind } from '../domain/rewards'
import { activePokemon, createBattlePokemon, createTeam } from '../domain/entities'
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
    const won = withBattle(
      startRun(fixedRandom(0.3)),
      { ...startRun(fixedRandom(0.3)).battle, winner: 'player' },
      fixedRandom(0.3),
    )
    const run = advance(won, won.offer?.[0] ?? null, fixedRandom(0.3))
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

describe('a saved reward offer', () => {
  it('comes back whole, every kind included', () => {
    const run = startRun(fixedRandom(0.3))
    // Held straight rather than played out to a win: the point is the filter
    // on load, which was dropping an item offer against a stale kind list.
    saveRun({ ...run, offer: ['item', 'levelUp', 'recruit'] }, storage)
    expect(loadRun(storage)?.offer).toEqual(['item', 'levelUp', 'recruit'])
  })

  it('drops a kind the game no longer has', () => {
    const run = startRun(fixedRandom(0.3))
    saveRun({ ...run, offer: ['heal', 'teleport' as RewardKind] }, storage)
    expect(loadRun(storage)?.offer).toEqual(['heal'])
  })
})

describe('saveDraft and loadDraft', () => {
  const dealt = () => startDraft(fixedRandom(0.3))

  it('returns null when nothing is stored', () => {
    expect(loadDraft(storage)).toBeNull()
  })

  it('brings back the same candidates, in the same order', () => {
    const draft = dealt()
    saveDraft(draft, storage)
    expect(loadDraft(storage)?.candidates.map((s) => s.id)).toEqual(
      draft.candidates.map((s) => s.id),
    )
  })

  it('brings back the picks made so far', () => {
    const draft = dealt()
    const picked = togglePick(draft, draft.candidates[1]!.id)
    saveDraft(picked, storage)
    expect(loadDraft(storage)?.picked).toEqual(picked.picked)
  })

  it('forgets the draft once it is cleared', () => {
    saveDraft(dealt(), storage)
    clearDraft(storage)
    expect(loadDraft(storage)).toBeNull()
  })

  it('drops a save it cannot parse', () => {
    storage.setItem('pokemon-battle:draft', '{ not json')
    expect(loadDraft(storage)).toBeNull()
  })

  it('drops a save naming a species the game does not have', () => {
    const draft = dealt()
    saveDraft(draft, storage)
    const stored = JSON.parse(storage.getItem('pokemon-battle:draft')!) as {
      candidateIds: string[]
    }
    stored.candidateIds[0] = 'onix-prime'
    storage.setItem('pokemon-battle:draft', JSON.stringify(stored))
    expect(loadDraft(storage)).toBeNull()
  })

  it('ignores a pick for a species that is not on the table', () => {
    const draft = dealt()
    saveDraft({ ...draft, picked: ['onix-prime'] }, storage)
    expect(loadDraft(storage)?.picked).toEqual([])
  })

  it('will not restore more picks than a party holds', () => {
    const draft = dealt()
    saveDraft({ ...draft, picked: draft.candidates.map((s) => s.id) }, storage)
    expect(loadDraft(storage)?.picked).toHaveLength(DRAFT_CONFIG.picks)
  })

  it('drops a duplicated pick rather than fielding one twice', () => {
    const draft = dealt()
    const id = draft.candidates[0]!.id
    saveDraft({ ...draft, picked: [id, id] }, storage)
    expect(loadDraft(storage)?.picked).toEqual([id])
  })

  it('survives a store that refuses to write', () => {
    const blocked = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('full')
      },
    }
    expect(() => saveDraft(dealt(), blocked)).not.toThrow()
  })
})

describe('a cleared run', () => {
  it('comes back cleared', () => {
    const run = startRun(fixedRandom(0.3))
    saveRun({ ...run, cleared: true, finished: true, wins: 6 }, storage)
    const loaded = loadRun(storage)
    expect(loaded?.cleared).toBe(true)
    expect(loaded?.finished).toBe(true)
  })

  it('reads a save written before runs could be cleared as uncleared', () => {
    const run = startRun(fixedRandom(0.3))
    saveRun(run, storage)
    const stored = JSON.parse(storage.getItem('pokemon-battle:run')!) as Record<
      string,
      unknown
    >
    delete stored.cleared
    storage.setItem('pokemon-battle:run', JSON.stringify(stored))
    expect(loadRun(storage)?.cleared).toBe(false)
  })

  it('restores the boss, which is not in the draft pool', () => {
    const run = startRun(fixedRandom(0.3))
    const boss = createBattlePokemon(BOSS_LIST[0]!, 54)
    saveRun(
      {
        ...run,
        battle: { ...run.battle, opponent: createTeam([boss]) },
      },
      storage,
    )
    expect(loadRun(storage)?.battle.opponent.members[0]?.species.id).toBe(
      BOSS_LIST[0]!.id,
    )
  })
})

describe('a draft at a tier', () => {
  it('brings the tier back with the candidates', () => {
    saveDraft(startDraft(fixedRandom(0.3), 3), storage)
    expect(loadDraft(storage)?.tier).toBe(3)
  })

  it('reads a draft saved before tiers existed as the first tier', () => {
    saveDraft(startDraft(fixedRandom(0.3)), storage)
    const stored = JSON.parse(storage.getItem('pokemon-battle:draft')!) as Record<
      string,
      unknown
    >
    delete stored.tier
    storage.setItem('pokemon-battle:draft', JSON.stringify(stored))
    expect(loadDraft(storage)?.tier).toBe(FIRST_TIER)
  })

  it('refuses a tier that does not exist rather than trusting the save', () => {
    saveDraft(startDraft(fixedRandom(0.3)), storage)
    const stored = JSON.parse(storage.getItem('pokemon-battle:draft')!) as Record<
      string,
      unknown
    >
    stored.tier = 99
    storage.setItem('pokemon-battle:draft', JSON.stringify(stored))
    expect(loadDraft(storage)?.tier).toBe(TIER_CONFIG.max)
  })
})
