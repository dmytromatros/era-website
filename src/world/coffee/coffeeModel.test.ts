import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../layout'
import { COFFEE, coffeePath, newCoffee, offerReach, present, stepCoffee, takeHand, type CoffeeState } from './coffeeModel'

const VIEW: Vec3 = [0, 1.7, 0]
const FOCUS: Vec3 = [0, 1.7, -6]
const WIDE = 1.6
const PHONE = 375 / 812
const DT = 1 / 60

function run(
  frames: number,
  s: CoffeeState,
  path: ReturnType<typeof coffeePath>,
  memory: { shown: boolean; has: boolean },
  opts: { start?: (k: number) => boolean; away?: (k: number) => boolean } = {},
  t0 = 0,
) {
  for (let k = 0; k < frames; k++) {
    stepCoffee(s, path, { now: t0 + k * DT, dt: DT, start: opts.start ? opts.start(k) : true, away: opts.away ? opts.away(k) : false }, memory)
  }
  return s
}

/** Where a world point is across the camera's view (−1 left edge … 1 right edge). */
const across = (p: Vec3, aspect: number) => p[0] / (Math.tan((21 * Math.PI) / 180) * aspect * -p[2])

describe('coffee welcome (D3): her way', () => {
  it('comes in from beyond the right edge, stands right of centre, leaves past the left edge', () => {
    for (const aspect of [WIDE, PHONE]) {
      const p = coffeePath(VIEW, FOCUS, 0, aspect, 42)
      expect(across(p.start, aspect)).toBeGreaterThan(1)
      expect(across(p.exit, aspect)).toBeLessThan(-1)
      const spot = across(p.spot, aspect)
      expect(spot).toBeGreaterThan(0.15) // clear of the hero in the middle
      expect(spot).toBeLessThan(0.8) // in the picture
      for (const q of [p.start, p.spot, p.exit]) expect(q[1]).toBe(0) // on the floor
      expect(-p.spot[2]).toBeGreaterThanOrEqual(COFFEE.distance - 1e-9) // in front of the camera, not on it
    }
  })
})

describe('coffee welcome (D3): the scene', () => {
  const path = coffeePath(VIEW, FOCUS, 0, WIDE, 42)

  it('starts when the entrance cutscene says so — once per page view', () => {
    const memory = { shown: false, has: false }
    const s = run(10, newCoffee(path), path, memory, { start: () => false })
    expect(s.phase).toBe('waiting') // not yet
    run(10, s, path, memory)
    expect(s.phase).toBe('approaching')
    expect(memory.shown).toBe(true)
    // A second entrance in the same page view: nothing.
    const again = run(30, newCoffee(path), path, memory)
    expect(again.phase).toBe('waiting')
  })

  it('never without the cutscene (a portal, Back: no crack, no cutscene)', () => {
    const memory = { shown: false, has: false }
    expect(run(60, newCoffee(path), path, memory, { start: () => false }).phase).toBe('waiting')
    expect(memory.shown).toBe(false)
  })

  it('walks up, offers; "Take it" → the hand takes the cup, she leaves, then is gone', () => {
    const memory = { shown: false, has: false }
    const s = run(60 * 6, newCoffee(path), path, memory)
    expect(s.phase).toBe('offering')
    expect(Math.hypot(s.position[0] - path.spot[0], s.position[2] - path.spot[2])).toBeLessThan(0.05)
    expect(s.walked).toBeGreaterThan(1)
    s.answer = 'take'
    run(1, s, path, memory, {}, 100)
    expect(s.phase).toBe('taking')
    const t0 = s.since
    expect(takeHand(s, t0 + COFFEE.pass)).toBeCloseTo(1, 5)
    expect(offerReach(s, t0 + 0.5)).toBeCloseTo(1, 5)
    run(Math.ceil((COFFEE.take + 0.1) / DT), s, path, memory, {}, t0)
    expect(memory.has).toBe(true)
    expect(s.phase).toBe('leaving')
    run(60 * 12, s, path, memory, {}, t0 + 10)
    expect(s.phase).toBe('done')
    expect(present(s.phase)).toBe(false)
  })

  it('"No, thanks" → a shrug, she leaves; the visitor has no coffee', () => {
    const memory = { shown: false, has: false }
    const s = run(60 * 6, newCoffee(path), path, memory)
    s.answer = 'decline'
    run(Math.ceil((COFFEE.shrug + 0.2) / DT), s, path, memory, {}, 100)
    expect(s.phase).toBe('leaving')
    expect(memory.has).toBe(false)
  })

  it('scrolling on (if the scroll is free) is a no', () => {
    const memory = { shown: false, has: false }
    const s = run(60 * 6, newCoffee(path), path, memory)
    expect(s.phase).toBe('offering')
    run(2, s, path, memory, { away: () => true }, 100)
    expect(s.phase).toBe('declining')
  })

  it('scrolled past before she even arrived: she just walks off', () => {
    const memory = { shown: false, has: false }
    const s = run(30, newCoffee(path), path, memory)
    expect(s.phase).toBe('approaching')
    run(2, s, path, memory, { away: () => true })
    expect(s.phase).toBe('leaving')
  })

  it('her steps follow the distance walked (no sliding feet)', () => {
    const memory = { shown: false, has: false }
    const s = newCoffee(path)
    run(60 * 6, s, path, memory)
    const straight = Math.hypot(path.spot[0] - path.start[0], path.spot[2] - path.start[2])
    expect(s.walked).toBeCloseTo(straight, 1)
  })
})
