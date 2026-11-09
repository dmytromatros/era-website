import { describe, expect, it } from 'vitest'
import { readPage } from '@/content/read'
import { layoutRoute } from '../layout'
import { toWorld } from '../exhibitModel'
import { buildOffice } from '../officeModel'
import { routePlan } from '../route'
import { across, distanceToRail, placeProps, propBodies, PROPS, seenFrom, staticShapes, type StopExhibit } from './propsModel'

const page = readPage('en', [])!
const plan = routePlan(page)
const sizes = plan.stops.map((s) => (s.exhibit ? { width: 4, height: 2.6 } : { width: 2.4, height: 3.6 }))

for (const [name, aspect] of [
  ['wide', 16 / 9],
  ['portrait', 9 / 16],
] as const) {
  describe(`props (${name} screen)`, () => {
    const layout = layoutRoute(plan, sizes, aspect)
    const office = buildOffice(layout)
    const skip = [0, layout.stations.length - 1]
    // Every exhibit 4 m wide, with a character standing just left of it (like a side helper).
    const exhibits: StopExhibit[] = layout.stations.map((st, i) => ({
      width: plan.stops[i]!.exhibit ? 4 : 0,
      elevation: 0.75,
      helpers: plan.stops[i]!.exhibit ? [toWorld([-2.9, 0, 0.35], st.anchor, st.yaw)] : [],
    }))
    const spots = placeProps(layout, office, exhibits, 11, skip, aspect)
    const bodies = propBodies(spots, 11)

    it('puts a few balls and box stacks on the page', () => {
      expect(spots.length).toBeGreaterThanOrEqual(2)
      expect(spots.filter((s) => s.kind === 'ball').length).toBeLessThanOrEqual(PROPS.maxBalls)
      expect(spots.filter((s) => s.kind === 'stack').length).toBeLessThanOrEqual(PROPS.maxStacks)
    })

    it('never on the camera path, in a character, an exhibit, furniture or columns', () => {
      for (const s of spots) {
        expect(distanceToRail(layout.rail, s.at[0], s.at[2]), `${s.kind} at ${s.at}`).toBeGreaterThan(PROPS.fromRail)
        for (const e of exhibits) for (const h of e.helpers) expect(Math.hypot(h[0] - s.at[0], h[2] - s.at[2])).toBeGreaterThan(PROPS.fromHelper)
        layout.stations.forEach((st, j) => {
          if (j !== s.station) expect(Math.hypot(st.anchor[0] - s.at[0], st.anchor[2] - s.at[2])).toBeGreaterThan(exhibits[j]!.width / 2 + PROPS.room)
        })
        for (const f of office.footprints) expect(Math.hypot(f.x - s.at[0], f.z - s.at[2])).toBeGreaterThan(f.r + PROPS.room)
      }
      // Boxes of a stack, too (a stack is wider than its spot).
      for (const b of bodies) expect(distanceToRail(layout.rail, b.pos[0], b.pos[2])).toBeGreaterThan(PROPS.fromRail - 0.6)
    })

    it('never covers an exhibit: whatever stands under its elements is lower than them', () => {
      for (const s of spots) {
        const st = layout.stations[s.station]!
        const under = Math.abs(across(s.at, st)) < exhibits[s.station]!.width / 2 + 0.3
        const top = Math.max(...bodies.filter((b) => b.prop === spots.indexOf(s)).map((b) => b.pos[1] + b.half[1]))
        if (under) expect(top).toBeLessThan(exhibits[s.station]!.elevation)
      }
    })

    it('is seen from the stop it belongs to, and not at the entrance or in the portal hall', () => {
      for (const s of spots) {
        expect(seenFrom(layout.stations[s.station]!, s.at[0], s.at[2], aspect)).toBe(true)
        expect(skip).not.toContain(s.station)
      }
    })

    it('keeps props apart and boxes of a stack from starting inside each other', () => {
      for (const a of spots) {
        for (const b of spots) if (a !== b) expect(Math.hypot(a.at[0] - b.at[0], a.at[2] - b.at[2])).toBeGreaterThan(PROPS.spacing)
      }
      const boxes = bodies.filter((b) => b.kind === 'box')
      for (const a of boxes) {
        for (const b of boxes) {
          if (a === b || a.prop !== b.prop) continue
          const sameRow = Math.abs(a.pos[1] - b.pos[1]) < 0.01
          if (!sameRow) continue
          // circumscribed radii in the floor plane, minus a bit: never overlapping at rest
          const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2])
          expect(d).toBeGreaterThan(a.half[0] + b.half[0] - 0.005)
        }
      }
      for (const b of bodies) expect(b.pos[1] - b.half[1]).toBeGreaterThanOrEqual(-1e-9) // on or above the floor
    })

    it('spreads them over the page, not all at its start', () => {
      const half = layout.stations.length / 2
      expect(spots.some((s) => s.station < half)).toBe(true)
      expect(spots.some((s) => s.station >= half)).toBe(true)
    })

    it('is the same on every visit (seeded)', () => {
      expect(placeProps(layout, office, exhibits, 11, skip, aspect)).toEqual(spots)
      expect(propBodies(spots, 11)).toEqual(bodies)
    })

    it('collides only with the office near the props (the simulation stays small)', () => {
      const shapes = staticShapes(office, spots, [])
      expect(shapes.length).toBeGreaterThan(5)
      expect(shapes.length).toBeLessThan(office.solid.length)
    })
  })
}
