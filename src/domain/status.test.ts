import { describe, expect, it } from 'vitest'
import {
  FREEZE_THAW_CHANCE,
  PARALYSIS_IMMOBILISE_CHANCE,
  SLEEP_MAX_TURNS,
  SLEEP_MIN_TURNS,
  createStatus,
  endOfTurnDamage,
  gateAction,
  isImmuneTo,
} from './status'
import { fixedRandom, scriptedRandom } from '../test/rng'

describe('isImmuneTo', () => {
  it('shields the types that shrug a condition off', () => {
    expect(isImmuneTo('poison', ['steel'])).toBe(true)
    expect(isImmuneTo('poison', ['poison'])).toBe(true)
    expect(isImmuneTo('burn', ['fire'])).toBe(true)
    expect(isImmuneTo('paralysis', ['electric'])).toBe(true)
    expect(isImmuneTo('freeze', ['ice'])).toBe(true)
  })

  it('shields nobody from sleep', () => {
    expect(isImmuneTo('sleep', ['fire', 'steel'])).toBe(false)
  })

  it('checks every type the Pokemon has', () => {
    expect(isImmuneTo('poison', ['grass', 'poison'])).toBe(true)
    expect(isImmuneTo('poison', ['grass', 'flying'])).toBe(false)
  })
})

describe('createStatus', () => {
  it('gives sleep a length within range', () => {
    expect(createStatus('sleep', fixedRandom(0))).toEqual({
      kind: 'sleep',
      turns: SLEEP_MIN_TURNS,
    })
    expect(createStatus('sleep', fixedRandom(0.999))).toEqual({
      kind: 'sleep',
      turns: SLEEP_MAX_TURNS,
    })
  })

  it('leaves the other conditions plain', () => {
    expect(createStatus('burn', fixedRandom(0.5))).toEqual({ kind: 'burn' })
  })
})

describe('gateAction', () => {
  it('lets a healthy Pokemon through without touching the dice', () => {
    let draws = 0
    const counted = () => {
      draws++
      return 0
    }
    expect(gateAction(null, counted).canAct).toBe(true)
    expect(draws).toBe(0)
  })

  it('does not stop a poisoned or burned Pokemon', () => {
    expect(gateAction({ kind: 'poison' }, fixedRandom(0)).canAct).toBe(true)
    expect(gateAction({ kind: 'burn' }, fixedRandom(0)).canAct).toBe(true)
  })

  it('stops a paralysed Pokemon a quarter of the time', () => {
    const blocked = gateAction({ kind: 'paralysis' }, fixedRandom(0))
    expect(blocked.canAct).toBe(false)
    expect(blocked.blockedBy).toBe('paralysis')
    // The roll has to be strictly below the chance.
    expect(
      gateAction({ kind: 'paralysis' }, fixedRandom(PARALYSIS_IMMOBILISE_CHANCE)).canAct,
    ).toBe(true)
  })

  it('keeps paralysis around either way', () => {
    expect(gateAction({ kind: 'paralysis' }, fixedRandom(0)).status).toEqual({
      kind: 'paralysis',
    })
    expect(gateAction({ kind: 'paralysis' }, fixedRandom(0.9)).status).toEqual({
      kind: 'paralysis',
    })
  })

  it('thaws ice one time in five, and lets it act that turn', () => {
    const thawed = gateAction({ kind: 'freeze' }, fixedRandom(0))
    expect(thawed).toEqual({
      canAct: true,
      status: null,
      ended: 'freeze',
      blockedBy: null,
    })

    const stuck = gateAction({ kind: 'freeze' }, fixedRandom(FREEZE_THAW_CHANCE))
    expect(stuck.canAct).toBe(false)
    expect(stuck.blockedBy).toBe('freeze')
    expect(stuck.status).toEqual({ kind: 'freeze' })
  })

  it('counts sleep down without rolling', () => {
    const gate = gateAction({ kind: 'sleep', turns: 3 }, fixedRandom(0.5))
    expect(gate.canAct).toBe(false)
    expect(gate.status).toEqual({ kind: 'sleep', turns: 2 })
    expect(gate.ended).toBeNull()
  })

  it('wakes on the last turn and acts straight away', () => {
    const gate = gateAction({ kind: 'sleep', turns: 1 }, fixedRandom(0.5))
    expect(gate).toEqual({ canAct: true, status: null, ended: 'sleep', blockedBy: null })
  })
})

describe('endOfTurnDamage', () => {
  it('takes an eighth for poison and a sixteenth for burn', () => {
    expect(endOfTurnDamage({ kind: 'poison' }, 104)).toBe(13)
    expect(endOfTurnDamage({ kind: 'burn' }, 104)).toBe(6)
  })

  it('takes nothing for the others', () => {
    expect(endOfTurnDamage(null, 104)).toBe(0)
    expect(endOfTurnDamage({ kind: 'paralysis' }, 104)).toBe(0)
    expect(endOfTurnDamage({ kind: 'sleep', turns: 2 }, 104)).toBe(0)
    expect(endOfTurnDamage({ kind: 'freeze' }, 104)).toBe(0)
  })

  it('always takes at least 1 HP', () => {
    expect(endOfTurnDamage({ kind: 'burn' }, 4)).toBe(1)
  })

  it('is unaffected by the dice', () => {
    expect(endOfTurnDamage({ kind: 'poison' }, 80)).toBe(
      endOfTurnDamage({ kind: 'poison' }, 80),
    )
  })
})

describe('sleep length', () => {
  it('never lasts longer than the maximum', () => {
    for (const roll of [0, 0.33, 0.5, 0.66, 0.999]) {
      const status = createStatus('sleep', scriptedRandom(roll))
      if (status.kind !== 'sleep') throw new Error('expected sleep')
      expect(status.turns).toBeGreaterThanOrEqual(SLEEP_MIN_TURNS)
      expect(status.turns).toBeLessThanOrEqual(SLEEP_MAX_TURNS)
    }
  })
})
