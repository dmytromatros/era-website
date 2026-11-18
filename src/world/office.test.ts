import { describe, expect, it } from 'vitest'
import { readPage } from '@/content/read'
import { layoutRoute } from './layout'
import { ARCADE_CAB, blocked, buildOffice, crosses } from './officeModel'
import { routePlan } from './route'

// The real home page, with plausible exhibit sizes (measuring needs a browser).
const page = readPage('en', [])!
const plan = routePlan(page)
const sizes = plan.stops.map((s) => (s.exhibit ? { width: 4, height: 2.6 } : { width: 2.4, height: 3.6 }))

for (const [name, aspect] of [
  ['wide', 16 / 9],
  ['portrait', 9 / 16],
] as const) {
  describe(`office (${name} screen)`, () => {
    const layout = layoutRoute(plan, sizes, aspect)
    const office = buildOffice(layout, undefined, aspect)
    const { clear } = layout.architecture

    it('furnishes the floor', () => {
      expect(office.footprints.filter((f) => f.kind === 'furniture').length).toBeGreaterThan(5)
      expect(office.footprints.filter((f) => f.kind === 'column').length).toBeGreaterThan(3)
    })

    it('keeps furniture and columns off the path, exhibits, corners and stairs', () => {
      for (const f of office.footprints) expect(blocked(f.x, f.z, f.r, clear), `${f.kind} at ${f.x},${f.z}`).toBe(false)
    })

    it('never puts anything where the camera goes', () => {
      for (const p of layout.rail) {
        for (const f of office.footprints) expect(Math.hypot(p[0] - f.x, p[2] - f.z)).toBeGreaterThan(f.r + 0.3)
      }
    })

    it('keeps everything inside the building, under the ceiling', () => {
      const { minX, maxX, minZ, maxZ } = office.bounds
      for (const p of [...layout.rail, ...layout.stations.map((s) => s.anchor)]) {
        expect(p[0]).toBeGreaterThan(minX)
        expect(p[0]).toBeLessThan(maxX)
        expect(p[2]).toBeGreaterThan(minZ)
        expect(p[2]).toBeLessThan(maxZ)
      }
      for (const f of office.footprints) {
        expect(f.x - f.r).toBeGreaterThan(minX)
        expect(f.x + f.r).toBeLessThan(maxX)
      }
    })

    it('puts an arcade machine (E3) in plain view of a stop, its screen turned to it', () => {
      expect(office.arcade).toHaveLength(1)
      const a = office.arcade[0]!
      const st = layout.stations[a.station]!
      const vp = st.viewpoint
      const dx = vp[0] - a.screen.center[0]
      const dz = vp[2] - a.screen.center[2]
      const d = Math.hypot(dx, dz)
      expect(d).toBeGreaterThan(ARCADE_CAB.view[0] - 0.5)
      expect(d).toBeLessThan(ARCADE_CAB.view[1] + 0.5)
      // Turned to the stop, by ARCADE_CAB.turn away from it (the player's back off the line of sight).
      const facing = (dx * a.screen.normal[0] + dz * a.screen.normal[1]) / d
      expect(facing).toBeGreaterThan(Math.cos(Math.abs(ARCADE_CAB.turn)) - 0.05)
      expect(facing).toBeLessThan(Math.cos(Math.abs(ARCADE_CAB.turn)) + 0.05)
      // The player does not stand on the line from the stop to the screen.
      const ux = dx / d
      const uz = dz / d
      const px = a.player.at[0] - a.screen.center[0]
      const pz = a.player.at[2] - a.screen.center[2]
      // Off it by half a body and half the screen as seen from the stop.
      expect(Math.abs(px * uz - pz * ux)).toBeGreaterThan(0.25 + (a.screen.size[0] / 2) * facing)
      // The camera flies there in a straight line: no glass partition on the way.
      for (const w of layout.architecture.walls) expect(crosses(vp, a.screen.center, w)).toBe(false)
      // Nobody plays on the path; and away from the other gags.
      expect(blocked(a.player.at[0], a.player.at[2], 0.35, clear)).toBe(false)
      for (const c of [...office.coffee, ...office.meeting]) expect(Math.hypot(c.at[0] - a.at[0], c.at[2] - a.at[2])).toBeGreaterThan(6)
      // Its marquee shines with the ceiling lights.
      expect(office.lights.some((l) => Math.abs(l.center[1] - ARCADE_CAB.marquee.center[1]) < 1e-6)).toBe(true)
    })

    it('turns every corridor wall into a glass partition', () => {
      expect(office.glass.length).toBeGreaterThanOrEqual(layout.architecture.walls.length)
      expect(office.frosted).toHaveLength(layout.architecture.walls.length)
    })
  })
}
