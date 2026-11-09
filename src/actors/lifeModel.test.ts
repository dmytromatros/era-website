import { describe, expect, it } from 'vitest'
import {
  ANNOY_CLICKS,
  clickMemory,
  EMOJI_LIFE,
  emojiState,
  envelope,
  lookAngles,
  pickReaction,
  spring,
  stance,
  STANCE,
  stepSpring,
  stepWobble,
  wobble,
  wobbleAtRest,
  type WobbleTuning,
} from './lifeModel'

const ROD: WobbleTuning = {
  gain: [0.08, 0, 0.08],
  turnSwing: 0.05,
  bounce: 0.6,
  stiffness: 90,
  damping: 5,
  limit: [0.5, 0.5, 0.5],
}

describe('springs (C1)', () => {
  it('settles on the target and behaves the same at 30 and 120 fps', () => {
    const a = spring()
    const b = spring()
    for (let t = 0; t < 2; t += 1 / 30) stepSpring(a, 1, 60, 11, 1 / 30)
    for (let t = 0; t < 2; t += 1 / 120) stepSpring(b, 1, 60, 11, 1 / 120)
    expect(a.x).toBeCloseTo(1, 3)
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-3)
  })

  it('does not explode after a long frame (tab in the background)', () => {
    const s = spring()
    stepSpring(s, 1, 60, 11, 30)
    expect(Number.isFinite(s.x)).toBe(true)
    expect(Math.abs(s.x)).toBeLessThan(2)
  })
})

describe('secondary motion (C1)', () => {
  it('stays still while the mount is still', () => {
    const w = wobble()
    for (let i = 0; i < 120; i++) stepWobble(w, ROD, [0, 0, 0], 0, 1 / 60)
    expect(wobbleAtRest(w)).toBe(true)
  })

  it('lags behind a turn, swings past rest once the turn stops, then settles', () => {
    const w = wobble()
    let during = [0, 0, 0]
    for (let i = 0; i < 30; i++) during = stepWobble(w, ROD, [0, 0, 2], 0, 1 / 60)
    expect(during[2]).toBeLessThan(-0.05) // rolled the other way: lagging
    let overshoot = 0
    for (let i = 0; i < 30; i++) overshoot = Math.max(overshoot, stepWobble(w, ROD, [0, 0, 0], 0, 1 / 60)[2])
    expect(overshoot).toBeGreaterThan(0.01) // swung past rest
    for (let i = 0; i < 400; i++) stepWobble(w, ROD, [0, 0, 0], 0, 1 / 60)
    expect(wobbleAtRest(w)).toBe(true)
  })

  it('bobs on a hop and respects its limits, including a blocked side', () => {
    const badge: WobbleTuning = { ...ROD, xRange: [-0.6, 0.04] }
    const w = wobble()
    let min = 0
    let max = 0
    for (let i = 0; i < 120; i++) {
      const v = Math.sin(i / 6) * 3 // jumping up and down, hard
      const [x] = stepWobble(w, badge, [0, 0, 0], v, 1 / 60)
      min = Math.min(min, x)
      max = Math.max(max, x)
    }
    expect(min).toBeLessThan(-0.05)
    expect(max).toBeLessThanOrEqual(0.04 + 1e-9)
    expect(min).toBeGreaterThanOrEqual(-0.6)
  })
})

describe('look-at (C1)', () => {
  it('turns towards the side the point is on and looks up at a higher point', () => {
    expect(lookAngles(1, 0, 1).yaw).toBeCloseTo(Math.PI / 4, 5)
    expect(lookAngles(-1, 0, 1).yaw).toBeLessThan(0)
    expect(lookAngles(0, 1, 2).pitch).toBeLessThan(0) // up = negative x rotation
    // Clamped: a point behind does not twist the neck around.
    expect(Math.abs(lookAngles(0.1, 0, -1).yaw)).toBeLessThanOrEqual(1.25)
  })
})

describe('reactions (C1)', () => {
  it('cycles through the character’s reactions', () => {
    const m = clickMemory()
    expect([0, 5, 10, 15].map((t) => pickReaction(m, 3, t))).toEqual([0, 1, 2, 0])
  })

  it('gets annoyed by quick clicks in a row, then starts over', () => {
    const m = clickMemory()
    const picks = Array.from({ length: ANNOY_CLICKS }, (_, i) => pickReaction(m, 2, i * 0.3))
    expect(picks.at(-1)).toBe('annoyed')
    expect(pickReaction(m, 2, 10)).toBe(0)
  })

  it('pops the emoji in, floats it up and shrinks it away', () => {
    expect(emojiState(-0.1).visible).toBe(false)
    expect(emojiState(0.2).scale).toBeGreaterThan(1) // overshoot of the pop
    expect(emojiState(0.6).scale).toBe(1)
    expect(emojiState(EMOJI_LIFE * 0.95).scale).toBeLessThan(0.2)
    expect(emojiState(EMOJI_LIFE * 0.9).rise).toBeGreaterThan(emojiState(0.3).rise)
    expect(emojiState(EMOJI_LIFE).visible).toBe(false)
  })

  it('eases a reaction in and out', () => {
    expect(envelope(0)).toBe(0)
    expect(envelope(0.5)).toBe(1)
    expect(envelope(1)).toBe(0)
    expect(envelope(0.05)).toBeGreaterThan(0)
    expect(envelope(0.05)).toBeLessThan(0.5)
  })
})

describe('standing: weight from leg to leg, small steps (C1)', () => {
  const REST_X = 0.14

  it('moves smoothly — no jumps of the hips or the feet from one frame to the next', () => {
    let prev = stance(0, true, REST_X)
    for (let t = 1 / 60; t < 120; t += 1 / 60) {
      const s = stance(t, true, REST_X)
      expect(Math.abs(s.weight - prev.weight)).toBeLessThan(0.05)
      for (let i = 0; i < 2; i++) {
        for (let a = 0; a < 3; a++) expect(Math.abs(s.feet[i]![a]! - prev.feet[i]![a]!)).toBeLessThan(0.01)
      }
      prev = s
    }
  })

  it('stands on one leg, then the other; only the free foot ever leaves the floor', () => {
    let lifted = 0
    const both = { left: false, right: false }
    for (let t = 0; t < 200; t += 0.05) {
      const s = stance(t, true, REST_X)
      expect(Math.abs(s.weight)).toBeLessThanOrEqual(1)
      if (s.weight > 0.99) both.right = true
      if (s.weight < -0.99) both.left = true
      const [l, r] = s.feet
      if (l[1] > 0) {
        lifted++
        expect(s.weight).toBeGreaterThan(0) // left foot up → weight on the right
      }
      if (r[1] > 0) expect(s.weight).toBeLessThan(0)
      expect(l[1]).toBeLessThanOrEqual(STANCE.stepLift + 1e-9)
    }
    expect(both).toEqual({ left: true, right: true })
    expect(lifted).toBeGreaterThan(0) // it does step sometimes
  })

  it('keeps the feet near their rest spots, and still when steps are off', () => {
    for (let t = 0; t < 300; t += 0.1) {
      const [l, r] = stance(t, true, REST_X).feet
      expect(Math.abs(l[0] + REST_X)).toBeLessThanOrEqual(STANCE.stepReachX + 1e-9)
      expect(Math.abs(r[2])).toBeLessThanOrEqual(STANCE.stepReachZ + 1e-9)
      const calm = stance(t, false, REST_X).feet
      expect(calm).toEqual([
        [-REST_X, 0, 0],
        [REST_X, 0, 0],
      ])
    }
  })
})
