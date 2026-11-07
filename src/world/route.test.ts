import { describe, expect, it } from 'vitest'
import type { Page } from '@/content/schema'
import { ARCH, at, forward, layoutRoute, right, type Box, type Vec3 } from './layout'
import { planTiming, routePlan, TRANSITION_WAYPOINTS } from './route'
import { dwellEase, ENTRANCE, scrollToUnits, timeline, totalUnits } from './timeline'
import { moduleRailRange, ZONE_FADE, ZONE_MARGIN, zoneOpacity } from './widgetZone'

const hero = { type: 'hero' as const, heading: ['Hi'], actions: [], tags: [], helpers: [] }
const cards = {
  type: 'cards' as const,
  heading: 'Cards',
  items: [
    { title: 'a', text: 'a' },
    { title: 'b', text: 'b' },
  ],
  helpers: [],
}
const steps = { type: 'steps' as const, heading: 'Steps', items: [{ title: 'a', text: 'a' }], helpers: [] }
const cta = { type: 'cta' as const, heading: 'Go', action: { label: 'Go', href: '/', variant: 'primary' as const }, helpers: [] }
const door = { type: 'door' as const, label: 'Next', href: '/' }

const page: Page = { title: 'x', blocks: [hero, cards, steps, cta, door] }
const plan = routePlan(page)
const timing = planTiming(plan)
const sizes = plan.stops.map((s) => (s.exhibit ? { width: 3, height: 2.2 } : { width: 2.4, height: 3.6 }))
const layout = layoutRoute(plan, sizes, 16 / 9)

describe('route plan', () => {
  it('uses the defaults: corridors behind alternating turns, stairs before the CTA', () => {
    expect(plan.zones.map((z) => [z.shape, z.before])).toEqual([
      ['open', 'straight'],
      ['corridor', 'right'],
      ['corridor', 'left'],
      ['open', 'stairs-up'],
      ['open', 'straight'],
    ])
  })

  it('lets content override shape and transition', () => {
    const custom = routePlan({ title: 'x', blocks: [hero, { ...cards, route: { shape: 'open', before: 'straight' } }] })
    expect(custom.zones[1]).toMatchObject({ shape: 'open', before: 'straight' })
  })

  it('adds corner / stair waypoints between stops', () => {
    const waypoints = plan.items.filter((i) => i.kind === 'waypoint').length
    expect(waypoints).toBe(3 * TRANSITION_WAYPOINTS) // right, left, stairs
    expect(plan.items.filter((i) => i.kind === 'stop')).toHaveLength(plan.stops.length)
  })

  it('maps every stop to its own rail point, in order', () => {
    expect(timing.stopRail).toHaveLength(plan.stops.length)
    timing.stopRail.forEach((r, i) => {
      expect(plan.items[r - 2]).toMatchObject({ kind: 'stop', stopIndex: i })
      if (i > 0) expect(r).toBeGreaterThan(timing.stopRail[i - 1]!)
    })
  })
})

describe('timeline', () => {
  const { segments } = timing

  it('starts at the beginning of the rail and reaches "entered" when the entrance ends', () => {
    expect(timeline(0, segments)).toEqual({ entrance: 0, railIndex: 0 })
    expect(timeline(ENTRANCE, segments).railIndex).toBeCloseTo(1)
  })

  it('stands exactly on each stop at the end of its segment', () => {
    let units = ENTRANCE
    segments.forEach((seg, i) => {
      units += seg.units
      expect(timeline(units, segments).railIndex).toBeCloseTo(2 + i)
    })
  })

  it('is monotonic and clamps out-of-range scroll', () => {
    let prev = -1
    for (let u = 0; u <= totalUnits(segments); u += 0.01) {
      const { railIndex } = timeline(u, segments)
      expect(railIndex).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = railIndex
    }
    expect(timeline(-5, segments).railIndex).toBe(0)
    expect(timeline(999, segments).railIndex).toBeCloseTo(1 + segments.length)
  })

  it('lingers at stops (slow ends, fast middle)', () => {
    const d = 0.02
    expect(dwellEase(0.5 + d / 2) - dwellEase(0.5 - d / 2)).toBeGreaterThan((dwellEase(d) - dwellEase(0)) * 5)
  })

  it('maps the full scroll distance onto the full timeline', () => {
    expect(scrollToUnits(1000, 1000, segments)).toBeCloseTo(totalUnits(segments))
    expect(scrollToUnits(10, 0, segments)).toBe(0)
  })
})

/** Distance of point p from the axis of a corridor box, and position along it. */
function inBoxFrame(p: Vec3, wall: Box) {
  const f = forward(wall.yaw)
  const r = right(wall.yaw)
  const dx = p[0] - wall.center[0]
  const dz = p[2] - wall.center[2]
  return { across: dx * r[0] + dz * r[2], along: dx * f[0] + dz * f[2] }
}

describe('route layout', () => {
  it('has one rail point per plan item plus start and entered', () => {
    expect(layout.rail).toHaveLength(plan.items.length + 2)
    expect(layout.look).toHaveLength(layout.rail.length)
  })

  it('turns exactly 90° at corners, and only there', () => {
    const headings = layout.zoneFrames.map((f) => f.heading)
    expect(headings).toEqual([0, Math.PI / 2, 0, 0, 0]) // right turn, then left turn back
    plan.zones.forEach((z, i) => {
      if (i === 0) return
      const change = headings[i]! - headings[i - 1]!
      const expected = z.before === 'right' ? Math.PI / 2 : z.before === 'left' ? -Math.PI / 2 : 0
      expect(change).toBeCloseTo(expected)
    })
  })

  it('climbs at the stairs: the CTA and the door stand one level up', () => {
    const ctaStop = plan.stops.findIndex((s) => s.blockIndex === 3)
    const doorStop = plan.stops.findIndex((s) => s.blockIndex === 4)
    expect(layout.stations[0]!.anchor[1]).toBe(0)
    expect(layout.stations[ctaStop]!.anchor[1]).toBeCloseTo(ARCH.stairRise)
    expect(layout.stations[doorStop]!.anchor[1]).toBeCloseTo(ARCH.stairRise)
    expect(layout.architecture.stairs).toHaveLength(ARCH.stairSteps)
    expect(layout.architecture.mezzanines.length).toBeGreaterThanOrEqual(1)
  })

  it('builds corridor walls of the right height, standing on their floor', () => {
    expect(layout.architecture.walls.length).toBeGreaterThan(0)
    for (const w of layout.architecture.walls) {
      expect(w.size[1]).toBeCloseTo(ARCH.wallHeight)
      expect(w.center[1] - w.size[1] / 2).toBeGreaterThanOrEqual(-1e-6)
    }
  })

  it('keeps corridor exhibits and their viewpoints inside the corridor', () => {
    const hw = layout.corridorHalfWidth
    plan.stops.forEach((stop, i) => {
      if (plan.zones[stop.blockIndex]?.shape !== 'corridor' || !stop.exhibit) return
      const st = layout.stations[i]!
      // nearest long wall of this zone: the one whose axis is parallel and closest
      const walls = layout.architecture.walls.filter((w) => w.size[2] > w.size[0])
      const local = walls
        .map((w) => ({ w, ...inBoxFrame(st.anchor, w) }))
        .filter((x) => Math.abs(x.along) <= x.w.size[2] / 2 + 0.01)
        .sort((a, b) => Math.abs(Math.abs(a.across) - 0) - Math.abs(Math.abs(b.across) - 0))
      expect(local.length).toBeGreaterThan(0)
      // exhibit centre is between the walls (inside the 2·hw corridor)
      const pair = local.filter((x) => Math.abs(x.across) <= 2 * hw + 0.01)
      expect(pair.length).toBeGreaterThanOrEqual(1)
      const view = inBoxFrame(st.viewpoint, pair[0]!.w)
      expect(Math.abs(view.across)).toBeLessThanOrEqual(2 * hw)
    })
  })

  it('places every viewpoint far enough to fit its exhibit', () => {
    layout.stations.forEach((s) => {
      const dist = Math.hypot(s.viewpoint[0] - s.anchor[0], s.viewpoint[2] - s.anchor[2])
      expect(dist).toBeGreaterThan(3)
    })
  })

  it('at(): forward and right move the expected way for each heading', () => {
    const f = { origin: [0, 0, 0] as Vec3, heading: Math.PI / 2, level: 1 }
    const p = at(f, 2, 1, 0.5)
    expect(p[0]).toBeCloseTo(2) // heading +90° travels towards +x
    expect(p[2]).toBeCloseTo(1) // its right is +z
    expect(p[1]).toBeCloseTo(1.5)
  })
})

describe('stairs and raised floors', () => {
  it('the mezzanine starts where the last step ends, not over the stairs', () => {
    const lastStep = layout.architecture.stairs[layout.architecture.stairs.length - 1]!
    const mz = layout.architecture.mezzanines[0]!
    const f = forward(mz.frame.heading)
    const along = (p: Vec3) => (p[0] - mz.frame.origin[0]) * f[0] + (p[2] - mz.frame.origin[2]) * f[2]
    const lastStepEnd = along(lastStep.center) + lastStep.size[2] / 2
    expect(mz.from).toBeGreaterThanOrEqual(lastStepEnd - 1e-6)
    expect(mz.from - lastStepEnd).toBeLessThan(0.05)
  })

  it('the CTA and the door share one mezzanine slab', () => {
    expect(layout.architecture.mezzanines).toHaveLength(1)
  })
})

describe('widget zones (widgets animate only inside their own module)', () => {
  const zone = moduleRailRange(plan, timing, 2)! // the steps module
  const cardsZone = moduleRailRange(plan, timing, 1)!

  it('spans exactly the stops of the module', () => {
    const rails = plan.stops.flatMap((s, i) => (s.blockIndex === 2 ? [timing.stopRail[i]!] : []))
    expect(zone).toEqual({ from: Math.min(...rails), to: Math.max(...rails) })
  })

  it('is fully shown at its stops and hidden at every stop of the previous module', () => {
    expect(zoneOpacity(zone.from, zone)).toBe(1)
    expect(zoneOpacity(zone.to, zone)).toBe(1)
    for (let r = cardsZone.from; r <= cardsZone.to; r++) expect(zoneOpacity(r, zone)).toBe(0)
  })

  it('fades in before the first stop and out after the last', () => {
    expect(zoneOpacity(zone.from - ZONE_MARGIN + ZONE_FADE / 2, zone)).toBeCloseTo(0.5)
    expect(zoneOpacity(zone.to + ZONE_MARGIN - ZONE_FADE / 2, zone)).toBeCloseTo(0.5)
    expect(zoneOpacity(zone.from - ZONE_MARGIN, zone)).toBe(0)
    expect(zoneOpacity(zone.to + ZONE_MARGIN, zone)).toBe(0)
  })

  it('does not exist for a module without stops', () => {
    expect(moduleRailRange(plan, timing, 99)).toBeNull()
  })
})
