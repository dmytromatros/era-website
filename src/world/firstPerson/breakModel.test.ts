import { describe, expect, it } from 'vitest'
import { HOLD } from '../timeline'
import { BREAK, KICK, ZERO_KICK, burstAt, crackOf, healAt, kickAt, lookWeight, newBreak, sinceBreak, stepBreak } from './breakModel'

const VIEW = { aspect: 1.6, fov: 42 }
const CENTRE = { x: 0.5, y: 0.5 }
const half = () => 0.3

/** Scroll in from the top at `rate` progress per frame (60 fps), return the state. */
function scrollTo(e: number, rate = 0.005) {
  const s = newBreak()
  let now = 0
  let broke = 0
  for (let x = 0; x <= e + 1e-9; x += rate) {
    if (stepBreak(s, x, now, CENTRE, VIEW, half)) broke++
    now += 1 / 60
  }
  return { s, now, broke }
}

describe('the crack (D1)', () => {
  it('happens once, when the progress crosses BREAK.at going in', () => {
    expect(scrollTo(BREAK.at - 0.01).s.at).toBeNull()
    const { s, broke } = scrollTo(0.3)
    expect(broke).toBe(1)
    expect(s.at).toBeGreaterThan(0)
    expect(s.side).toBe(-1) // random 0.3 → the left hand slipped
    expect(s.uv.x).toBeLessThan(0.5) // burst under the left palm
  })

  it('is the same however fast the visitor scrolls (a slow scroll still gets a sudden crack)', () => {
    for (const rate of [0.0005, 0.005, 0.05]) expect(scrollTo(0.2, rate).broke).toBe(1)
  })

  it('is skipped when arriving mid-page (portal, Back: progress jumps)', () => {
    const s = newBreak()
    stepBreak(s, 1, 0, CENTRE, VIEW, half)
    expect(s.at).toBe(-Infinity)
    expect(sinceBreak(s, 5)).toBe(Infinity)
    expect(crackOf(s, 5, 1)).toBeNull()
    stepBreak(s, 0.95, 1 / 60, CENTRE, VIEW, half)
    expect(s.at).toBe(-Infinity)
  })

  it('arms again only back at the very top', () => {
    const { s, now } = scrollTo(0.3)
    const at = s.at
    stepBreak(s, 0.05, now + 1, CENTRE, VIEW, half) // scrolled back up a bit: still broken
    expect(s.at).toBe(at)
    stepBreak(s, 0.005, now + 2, CENTRE, VIEW, half)
    expect(s.at).toBeNull()
  })

  it('updates once per frame (every part of the scene may call it)', () => {
    const s = newBreak()
    stepBreak(s, 0.1, 1, CENTRE, VIEW, half)
    expect(stepBreak(s, 0.14, 1, CENTRE, VIEW, half)).toBe(false) // same frame: ignored
    expect(stepBreak(s, 0.14, 1.02, CENTRE, VIEW, half)).toBe(true)
  })
})

describe('the film after the crack', () => {
  it('bursts open fast and fully', () => {
    expect(burstAt(null)).toBe(0)
    expect(burstAt(0)).toBe(0)
    expect(burstAt(0.1)).toBeGreaterThan(0.3)
    expect(burstAt(BREAK.burst)).toBe(1)
  })

  it('heals as the visitor scrolls back to the top', () => {
    expect(healAt(0)).toBe(0)
    expect(healAt(BREAK.at)).toBe(1)
    expect(healAt(0.07)).toBeGreaterThan(0)
    expect(healAt(0.07)).toBeLessThan(1)
  })
})

describe('the camera lurch', () => {
  it('is zero before the crack, when skipped, and exactly zero from BREAK.settle on', () => {
    expect(kickAt(null, 1)).toEqual(ZERO_KICK)
    expect(kickAt(Infinity, 1)).toEqual(ZERO_KICK)
    expect(kickAt(0, 1)).toEqual(ZERO_KICK)
    expect(kickAt(BREAK.settle, 1)).toEqual(ZERO_KICK)
    const near = kickAt(BREAK.settle - 0.01, 1)
    for (const v of Object.values(near)) expect(Math.abs(v)).toBeLessThan(1e-3)
  })

  const peak = (key: keyof typeof ZERO_KICK, from: number, to: number, side: -1 | 1 = 1, look = 1) => {
    let best = 0
    for (let t = from; t < to; t += 0.005) {
      const v = kickAt(t, side, look)[key]
      if (Math.abs(v) > Math.abs(best)) best = v
    }
    return best
  }

  it('falls through: lurches forward, punches the fov, rolls towards the slipping hand', () => {
    expect(peak('forward', 0, 1)).toBeGreaterThan(KICK.forward * 0.5)
    expect(peak('fov', 0, 1)).toBeGreaterThan(KICK.fov * 0.5)
    expect(peak('roll', 0, 0.3, 1)).toBeGreaterThan(0.05)
    expect(peak('roll', 0, 0.3, -1)).toBeLessThan(-0.05)
  })

  it('stumbles: tips the head far down, staggers, then comes up a little past level', () => {
    expect(peak('pitch', 0.2, 0.7)).toBeLessThan(-KICK.stumble * 0.9)
    expect(peak('down', 0.3, 0.8)).toBeGreaterThan(KICK.dip * 0.6)
    expect(peak('pitch', 1.1, 1.3, 1, 0)).toBeGreaterThan(KICK.overshoot * 0.6) // "phew, still standing"
    expect(Math.abs(kickAt(1.5, 1, 0).pitch)).toBeLessThan(0.02) // level again
  })

  it('looks at the hands, left then right, when the visitor stays put', () => {
    expect(kickAt(2, 1).pitch).toBeLessThan(-KICK.look.down * 0.9)
    expect(kickAt(2.1, 1).yaw).toBeGreaterThan(KICK.look.glance * 0.9) // left
    expect(kickAt(2.85, 1).yaw).toBeLessThan(-KICK.look.glance * 0.9) // right
  })

  it('does not look around when the visitor scrolls on (the scroll is never held up)', () => {
    expect(lookWeight(BREAK.at, BREAK.at)).toBe(1)
    expect(lookWeight(BREAK.at + 0.2, BREAK.at)).toBe(0)
    expect(lookWeight(HOLD.to - 0.005, BREAK.at)).toBe(1) // anywhere in the hold after the crack
    expect(lookWeight(0.03, BREAK.at)).toBe(0) // scrolled back up
    for (let t = 1.4; t < BREAK.settle; t += 0.05) {
      const k = kickAt(t, 1, 0)
      expect(Math.abs(k.yaw)).toBeLessThan(1e-6)
      expect(Math.abs(k.pitch)).toBeLessThan(0.02)
    }
  })

  it('fades out entirely while scrolling back to the top', () => {
    for (const v of Object.values(kickAt(0.4, 1, 1, 0))) expect(Math.abs(v)).toBeLessThan(1e-9)
  })

  it('has no big jumps frame to frame after the first impact', () => {
    for (const look of [1, 0]) {
      let prev = kickAt(0.05, 1, look)
      for (let t = 0.05 + 1 / 60; t < BREAK.settle; t += 1 / 60) {
        const k = kickAt(t, 1, look)
        for (const key of ['yaw', 'pitch', 'roll'] as const) expect(Math.abs(k[key] - prev[key])).toBeLessThan(0.05)
        expect(Math.abs(k.fov - prev.fov)).toBeLessThan(2)
        prev = k
      }
    }
  })
})
