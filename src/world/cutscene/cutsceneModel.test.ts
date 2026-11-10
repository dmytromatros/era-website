import { describe, expect, it } from 'vitest'
import { ENTRANCE } from '../timeline'
import { CUTSCENE, newCutscene, stepCutscene, walkInUnits, type CutInput } from './cutsceneModel'

const base: CutInput = { now: 0, crackAt: null, crackUnits: 0.21, units: 0.21, welcome: true, coffee: 'waiting', coffeeSince: 0 }

describe('the entrance cutscene', () => {
  it('starts at a fresh crack: locks the scroll and holds the page where it cracked — once per page view', () => {
    const memory = { played: false }
    const s = newCutscene()
    expect(stepCutscene(s, { ...base, now: 1 }, memory)).toEqual({ lock: false, scroll: null })
    const out = stepCutscene(s, { ...base, now: 10, crackAt: 10, units: 0.6 }, memory)
    expect(out).toEqual({ lock: true, scroll: 0.21 }) // flicked further: back to the crack
    expect(s.phase).toBe('fall')
    // Another entrance in the same page view: nothing locked.
    const again = newCutscene()
    expect(stepCutscene(again, { ...base, now: 50, crackAt: 50 }, memory).lock).toBe(false)
  })

  it('never without a crack (portal, Back) or with an old one', () => {
    const memory = { played: false }
    expect(stepCutscene(newCutscene(), { ...base, now: 5, crackAt: -Infinity }, memory).lock).toBe(false)
    expect(stepCutscene(newCutscene(), { ...base, now: 5, crackAt: 1 }, memory).lock).toBe(false)
    expect(memory.played).toBe(false)
  })

  it('after the look at the hands, walks the rest of the entrance by itself, then the coffee', () => {
    const memory = { played: false }
    const s = newCutscene()
    stepCutscene(s, { ...base, now: 10, crackAt: 10 }, memory)
    expect(stepCutscene(s, { ...base, now: 10 + CUTSCENE.walkInAfter - 0.1 }, memory).scroll).toBe(0.21)
    stepCutscene(s, { ...base, now: 10 + CUTSCENE.walkInAfter }, memory)
    expect(s.phase).toBe('walkIn')
    const mid = stepCutscene(s, { ...base, now: s.since + CUTSCENE.walkIn / 2 }, memory)
    expect(mid.lock).toBe(true)
    expect(mid.scroll!).toBeGreaterThan(0.21)
    expect(mid.scroll!).toBeLessThan(ENTRANCE)
    const end = stepCutscene(s, { ...base, now: s.since + CUTSCENE.walkIn }, memory)
    expect(s.phase).toBe('coffee')
    expect(end).toEqual({ lock: true, scroll: ENTRANCE })
  })

  it('stays locked until the coffee is over, then gives the scroll back', () => {
    const memory = { played: false }
    const s = { phase: 'coffee' as const, since: 0, at: 0 }
    expect(stepCutscene(s, { ...base, now: 100, coffee: 'offering' }, memory).lock).toBe(true) // waiting for an answer
    expect(stepCutscene(s, { ...base, now: 101, coffee: 'leaving', coffeeSince: 100 }, memory).lock).toBe(true)
    expect(stepCutscene(s, { ...base, now: 100 + CUTSCENE.afterLeaving, coffee: 'leaving', coffeeSince: 100 }, memory).lock).toBe(false)
    expect(s.phase).toBe('done')
  })

  it('without a coffee on the page, ends with the walk-in', () => {
    const memory = { played: false }
    const s = { phase: 'walkIn' as const, since: 0, at: 0.21 }
    expect(stepCutscene(s, { ...base, now: CUTSCENE.walkIn, welcome: false }, memory).lock).toBe(false)
    expect(s.phase).toBe('done')
  })

  it('the walk-in moves smoothly from where it starts to the end of the entrance', () => {
    expect(walkInUnits(0, 0.21)).toBeCloseTo(0.21)
    expect(walkInUnits(CUTSCENE.walkIn, 0.21)).toBeCloseTo(ENTRANCE)
    let prev = walkInUnits(0, 0.21)
    for (let t = 0.02; t <= CUTSCENE.walkIn; t += 0.02) {
      const u = walkInUnits(t, 0.21)
      expect(u).toBeGreaterThanOrEqual(prev)
      expect(u - prev).toBeLessThan(0.05)
      prev = u
    }
  })
})
