import { describe, expect, it } from 'vitest'
import { readPage } from '@/content/read'
import { planTiming, routePlan } from './route'
import { SETTLE, settleAnchors, settleDuration, settleEase, settleTarget } from './settleModel'
import { ENTRANCE, timeline, totalUnits } from './timeline'

describe('the magnet', () => {
  const timing = planTiming(routePlan(readPage('en', [])!))
  const anchors = settleAnchors(timing)

  it('a magnet on every stop (key or not: tags, section headings) — the camera stands exactly there', () => {
    expect(anchors.length).toBe(timing.stopRail.length)
    expect(anchors[0]!).toBeGreaterThan(ENTRANCE)
    for (let i = 0; i < anchors.length; i++) {
      if (i > 0) expect(anchors[i]!).toBeGreaterThan(anchors[i - 1]!)
      expect(timeline(anchors[i]!, timing.segments).railIndex).toBeCloseTo(timing.stopRail[i]!, 9)
    }
    expect(anchors.at(-1)!).toBeLessThanOrEqual(totalUnits(timing.segments) + 1e-9)
    // Corners and stairs are no magnets: fewer anchors than rail points after the entrance.
    expect(anchors.length).toBeLessThan(timing.segments.length)
  })

  it('let go almost on a stop: pulled onto it, from either side', () => {
    const a = anchors[3]!
    expect(settleTarget(a + SETTLE.reach * 0.9, anchors)).toBe(a)
    expect(settleTarget(a - SETTLE.reach * 0.5, anchors)).toBe(a)
  })

  it('anywhere else the camera stays where the visitor let go — on a stop too', () => {
    const [a, b] = [anchors[3]!, anchors[4]!]
    expect(settleTarget((a + b) / 2, anchors)).toBeNull()
    expect(settleTarget(a + SETTLE.reach * 1.1, anchors)).toBeNull()
    expect(settleTarget(a + SETTLE.eps / 2, anchors)).toBeNull()
    expect(settleTarget(0.4, anchors)).toBeNull() // inside the entrance
    // One mouse-wheel click (≈ 100 px on a 708 px tall window ≈ 0.14 units) off a stop leaves it.
    expect(settleTarget(a + 0.14, anchors)).toBeNull()
  })

  it('glide: short, bounded, smooth at both ends', () => {
    expect(settleDuration(0.001)).toBe(SETTLE.min)
    expect(settleDuration(50)).toBe(SETTLE.max)
    expect(settleEase(0)).toBe(0)
    expect(settleEase(1)).toBe(1)
    let prev = 0
    for (let t = 0.01; t <= 1; t += 0.01) {
      const v = settleEase(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    expect(settleEase(0.01) / 0.01).toBeLessThan(0.05)
    expect((1 - settleEase(0.99)) / 0.01).toBeLessThan(0.05)
  })
})
