import { describe, expect, it } from 'vitest'
import { readPage } from '@/content/read'
import { layoutRoute } from './layout'
import { blocked, buildOffice } from './officeModel'
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
    const office = buildOffice(layout)
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

    it('turns every corridor wall into a glass partition', () => {
      expect(office.glass.length).toBeGreaterThanOrEqual(layout.architecture.walls.length)
      expect(office.frosted).toHaveLength(layout.architecture.walls.length)
    })
  })
}
