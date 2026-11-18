import { describe, expect, it } from 'vitest'
import { glyphAt, glyphsFromBounds, writeMotion } from '../kineticModel'
import { carryTo, DROP, FIX, knock, newFix, standNear, stepDrop, walkStep } from './letterModel'

const HW = 0.15
const HH = 0.22
/** The floor 2.4 m under the glyph's rest centre (the heading over the holder's head). */
const FLOOR = -2.4

describe('a letter knocked off the heading (E4)', () => {
  it('pops off towards the viewer, spinning away from the click', () => {
    const f = newFix()
    expect(knock(f, 3, { ox: 0, oy: 0, oz: 0, a: 0 }, 1, 1, 0)).toBe(true)
    expect(f.phase).toBe('falling')
    expect(f.glyph).toBe(3)
    expect(f.vz).toBeGreaterThan(0)
    expect(f.va).toBeLessThan(0)
    // One at a time.
    expect(knock(f, 4, { ox: 0, oy: 0, oz: 0, a: 0 }, 1, 1, 0)).toBe(false)
  })

  it('falls, bounces, comes to rest lying on its side on the floor', () => {
    const f = newFix()
    knock(f, 0, { ox: 0, oy: 0, oz: 0, a: 0 }, -1, 1, 0)
    let lowest = 0
    let bounced = false
    let prevVy = 0
    for (let t = 0; t < 4; t += 1 / 60) {
      stepDrop(f, 1 / 60, t, FLOOR, HW, HH, 1)
      lowest = Math.min(lowest, f.oy)
      if (prevVy < 0 && f.vy > 0) bounced = true
      prevVy = f.vy
    }
    expect(bounced).toBe(true)
    expect(f.phase).toBe('lying')
    // Never through the floor: the centre at least half a width above it, lying on a side.
    expect(lowest).toBeGreaterThan(FLOOR + HW - 0.02)
    expect(f.oy).toBeCloseTo(FLOOR + HW, 2)
    expect(Math.abs(Math.cos(f.a))).toBeLessThan(0.02)
    // In front of the heading (towards the viewer), not far.
    expect(f.oz).toBeGreaterThan(0.3)
    expect(f.oz).toBeLessThan(2)
  })

  it('in a scaled text the fall is still metres per second squared', () => {
    const a = newFix()
    const b = newFix()
    knock(a, 0, { ox: 0, oy: 0, oz: 0, a: 0 }, 1, 1, 0)
    knock(b, 0, { ox: 0, oy: 0, oz: 0, a: 0 }, 1, 2, 0)
    stepDrop(a, 0.2, 0.2, -100, HW, HH, 1)
    stepDrop(b, 0.2, 0.2, -100, HW, HH, 2)
    // Text units of a text twice as big in the world: half as far.
    expect(b.oy * 2).toBeCloseTo(a.oy, 5)
    expect(DROP.gravity).toBeGreaterThan(0)
  })

  it('carried: follows the hands, upright', () => {
    const f = newFix()
    f.a = Math.PI / 2
    for (let i = 0; i < 60; i++) carryTo(f, { x: 1, y: -0.5, z: 0.2 }, 1 / 60)
    expect(f.ox).toBeCloseTo(1, 2)
    expect(f.oy).toBeCloseTo(-0.5, 2)
    expect(Math.abs(f.a)).toBeLessThan(0.01)
  })
})

describe('the holder fetches it', () => {
  it('runs at its pace, faces the way, stops next to the letter', () => {
    const letter = { x: 2, z: 1 }
    const to = standNear({ x: 0, z: 0 }, letter)
    expect(Math.hypot(letter.x - to.x, letter.z - to.z)).toBeCloseTo(FIX.standoff, 5)
    let at = { x: 0, z: 0 }
    let t = 0
    for (; t < 5; t += 1 / 60) {
      const s = walkStep(at, to, 1 / 60)
      at = s
      if (s.arrived) break
    }
    expect(at.x).toBeCloseTo(to.x, 5)
    expect(t).toBeCloseTo(Math.hypot(to.x, to.z) / FIX.run, 1)
    expect(walkStep({ x: 0, z: 0 }, { x: 0, z: 1 }, 0.01).yaw).toBeCloseTo(0)
  })
})

describe('the heading itself', () => {
  const glyphs = glyphsFromBounds([0, 0, 0.3, 0.4, 0.35, 0, 0.65, 0.4, 0.7, 0, 0.7, 0.4])
  it('a click hits the letter under it, not a space', () => {
    expect(glyphAt(glyphs, 0.5, 0.2, 0.02)).toBe(1)
    expect(glyphAt(glyphs, 0.1, 0.39, 0.02)).toBe(0)
    // The third "glyph" has no width (a space).
    expect(glyphAt(glyphs, 0.7, 0.2, 0.001)).toBe(-1)
    expect(glyphAt(glyphs, 3, 3, 0.02)).toBe(-1)
  })

  it('sags while nobody holds it — but not the knocked-off letter', () => {
    const centers = new Float32Array(16)
    const motion = new Float32Array(16)
    glyphs[2]!.held = true
    glyphs[2]!.oy = -1
    writeMotion(glyphs, centers, motion, 1, 0.4, null, 1, 0, FIX.sag, FIX.sagTilt)
    expect(motion[1]).toBeLessThan(-0.4 * FIX.sag * 0.8)
    expect(motion[2 * 4 + 1]).toBeCloseTo(-1)
    writeMotion(glyphs, centers, motion, 1, 0.4, null, 0)
    expect(motion[1]).toBeCloseTo(0)
  })
})
