import { describe, expect, it } from 'vitest'
import { readPage } from '@/content/read'
import { accentAt, DOLLY, dollyFov, dollyPosition, dollyTanHalf } from './cinema'
import { ENTRANCE_GEOMETRY, layoutRoute, type Vec3 } from './layout'
import { buildOffice } from './officeModel'
import { planTiming, routePlan } from './route'
import { timeline } from './timeline'

const BASE = ENTRANCE_GEOMETRY.fov
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('dolly zoom (B3)', () => {
  it('keeps the normal field of view at the top, before the tear and after entering', () => {
    expect(dollyFov(0)).toBe(BASE)
    expect(dollyFov(DOLLY.from)).toBe(BASE)
    expect(dollyFov(1)).toBeCloseTo(BASE, 9)
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => dollyFov(i / 100)))).toBeCloseTo(DOLLY.peakFov, 1)
  })

  it('keeps the target the same size on screen', () => {
    const pos: Vec3 = [0, 2, 8]
    const target: Vec3 = [1, 1.5, -6]
    for (const fov of [BASE, 50, DOLLY.peakFov]) {
      const p = dollyPosition(pos, target, fov)
      expect(dist(p, target) * dollyTanHalf(fov)).toBeCloseTo(dist(pos, target) * dollyTanHalf(BASE), 9)
    }
  })

  // The real home page; the camera leaves the rail during the vertigo — it must not hit anything.
  const page = readPage('en', [])!
  const plan = routePlan(page)
  const sizes = plan.stops.map((s) => (s.exhibit ? { width: 4, height: 2.6 } : { width: 2.4, height: 3.6 }))
  for (const [name, aspect] of [
    ['wide', 16 / 9],
    ['portrait', 9 / 16],
  ] as const) {
    it(`stays clear of furniture and columns on the way in (${name} screen)`, () => {
      const layout = layoutRoute(plan, sizes, aspect)
      const office = buildOffice(layout)
      const target = layout.stations[0]!.focus
      const [a, b] = [layout.rail[0]!, layout.rail[1]!]
      for (let i = 0; i <= 50; i++) {
        const e = i / 50
        const k = e < 0.5 ? 4 * e ** 3 : 1 - (-2 * e + 2) ** 3 / 2 // the rail's entrance easing
        const onRail: Vec3 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
        const p = dollyPosition(onRail, target, dollyFov(e))
        for (const f of office.footprints) expect(Math.hypot(p[0] - f.x, p[2] - f.z), `${f.kind} at e=${e}`).toBeGreaterThan(f.r + 0.3)
        expect(dist(p, target)).toBeGreaterThan(1.5) // never ends up inside the exhibit
      }
    })
  }
})

describe('background blur only at accents (B3)', () => {
  const page = readPage('en', [])!
  const plan = routePlan(page)
  const timing = planTiming(plan)

  it('knows the key stops of the page', () => {
    const keys = plan.items.flatMap((it, i) => (it.kind === 'stop' && it.key ? [2 + i] : []))
    expect(timing.keyRail).toEqual(keys)
    expect(keys.length).toBeGreaterThan(3)
  })

  it('is full at a key stop and zero in flight, at minor stops and waypoints', () => {
    for (const r of timing.keyRail) expect(accentAt(r, timing.keyRail)).toBe(1)
    const others = plan.items.flatMap((it, i) => (it.kind === 'stop' && it.key ? [] : [2 + i]))
    for (const r of others) {
      // a minor stop / waypoint right next to a key one may still catch the fade, never full
      if (Math.min(...timing.keyRail.map((k) => Math.abs(k - r))) >= 1) expect(accentAt(r, timing.keyRail)).toBe(0)
    }
    expect(accentAt(timing.keyRail[0]! + 0.5, timing.keyRail)).toBe(0) // halfway to the next point
    expect(accentAt(1, timing.keyRail)).toBe(0) // just entered, still flying to the first stop
  })

  it('fades smoothly as the camera arrives (no jump over a small scroll step)', () => {
    let prev = accentAt(timeline(0, timing.segments).railIndex, timing.keyRail)
    const total = 1.6 + timing.segments.reduce((n, s) => n + s.units, 0)
    for (let u = 0; u <= total; u += 0.005) {
      const a = accentAt(timeline(u, timing.segments).railIndex, timing.keyRail)
      expect(Math.abs(a - prev)).toBeLessThan(0.15)
      prev = a
    }
  })
})
