import { describe, expect, it } from 'vitest'
import { kickSpin, spin, stepSpin } from './chairSpin'

/** Run until the chair is at rest; returns the seconds it took and the angles it went through. */
function run(s: ReturnType<typeof spin>, fps = 60) {
  const angles: number[] = []
  let t = 0
  while (stepSpin(s, 1 / fps) && t < 30) {
    angles.push(s.angle)
    t += 1 / fps
  }
  return { t, angles }
}

describe('swivel chair (C2)', () => {
  it('spins at least a full turn, slows down and settles back facing the desk', () => {
    const s = spin()
    kickSpin(s, 0.8)
    const { t, angles } = run(s)
    expect(Math.max(...angles)).toBeGreaterThan(Math.PI * 2)
    expect(t).toBeGreaterThan(1)
    expect(t).toBeLessThan(10)
    expect(s.angle).toBe(0) // back home, and the angle wraps to 0
  })

  it('turns the way it was pushed, and never snaps backwards while settling', () => {
    const s = spin()
    kickSpin(s, -1)
    const { angles } = run(s)
    expect(Math.min(...angles)).toBeLessThan(-Math.PI * 2)
    // monotonic apart from the spring's small overshoot at the very end
    let back = 0
    for (let i = 1; i < angles.length; i++) back = Math.max(back, angles[i]! - angles[i - 1]!)
    expect(back).toBeLessThan(0.05)
  })

  it('a second click adds speed instead of restarting from zero', () => {
    const s = spin()
    kickSpin(s, 1)
    const first = s.speed
    stepSpin(s, 0.1)
    kickSpin(s, 1)
    expect(s.speed).toBeGreaterThan(first)
  })

  it('behaves the same at 30 and 120 fps', () => {
    const a = spin()
    const b = spin()
    kickSpin(a, 0.5)
    kickSpin(b, 0.5)
    expect(Math.abs(run(a, 30).t - run(b, 120).t)).toBeLessThan(0.1)
  })
})
