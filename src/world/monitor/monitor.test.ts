import { describe, expect, it } from 'vitest'
import { readPage, readSite } from '@/content/read'
import { flightClear, flightWeight } from '../arcade/arcadeModel'
import { ENTRANCE_GEOMETRY, layoutRoute, type Vec3 } from '../layout'
import { buildOffice, MONITOR_DESK } from '../officeModel'
import { routePlan } from '../route'
import { toWorld } from '../exhibitModel'
import { MONITOR, MONITOR_SPOT, monitorSpot, monitorView, pageRect } from './monitorModel'

const t = Math.tan((ENTRANCE_GEOMETRY.fov * Math.PI) / 360)

describe('flying into the monitor (E5)', () => {
  const screen = { center: [2, 1.55, -3] as Vec3, size: MONITOR_DESK.screen.size, normal: [0, 1] as [number, number] }

  for (const aspect of [16 / 10, 16 / 9, 4 / 3, 9 / 16, 0.46]) {
    it(`the screen covers the whole frame at the end, nothing round it (aspect ${aspect.toFixed(2)})`, () => {
      const { eye, look, distance } = monitorView(screen, aspect)
      expect(look).toEqual(screen.center)
      expect(eye[0]).toBeCloseTo(2)
      expect(eye[1]).toBeCloseTo(1.55)
      expect(eye[2]).toBeCloseTo(-3 + distance)
      const seenH = 2 * distance * t
      const seenW = seenH * aspect
      // Seen ≤ the screen both ways (no bezel in the frame), one way a hair short of edge to edge.
      expect(seenW).toBeLessThanOrEqual(screen.size[0] + 1e-9)
      expect(seenH).toBeLessThanOrEqual(screen.size[1] + 1e-9)
      expect(Math.max(seenW / screen.size[0], seenH / screen.size[1])).toBeCloseTo(MONITOR_DESK.margin, 6)
    })

    it(`the landing is drawn exactly where the camera looks then (aspect ${aspect.toFixed(2)})`, () => {
      const r = pageRect(screen.size, aspect)
      const { distance } = monitorView(screen, aspect)
      // Centred, inside the screen, the viewport's shape, as big as the frame at that distance.
      expect(r.x).toBeCloseTo((1 - r.w) / 2)
      expect(r.y).toBeCloseTo((1 - r.h) / 2)
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect((r.w * screen.size[0]) / (r.h * screen.size[1])).toBeCloseTo(aspect, 6)
      expect(r.h * screen.size[1]).toBeCloseTo(2 * distance * t, 6)
    })

    it(`the desk, the keyboard and the mug stay below the frame (aspect ${aspect.toFixed(2)})`, () => {
      const { distance } = monitorView(screen, aspect)
      const face = MONITOR_DESK.screen.center
      // How low the frame sees at a distance in front of the screen: above what stands there.
      const lowest = (z: number) => face[1] - (distance - (z - face[2])) * t
      expect(lowest(0.35)).toBeGreaterThan(1.08) // desk front edge, keyboard
      expect(lowest(0.12)).toBeGreaterThan(1.16) // the mug
    })
  }

  it('the flight eases in, and turns round from where it is', () => {
    expect(flightWeight('idle', 5, 1, MONITOR)).toBe(0)
    expect(flightWeight('entering', 0, 1, MONITOR)).toBe(0)
    expect(flightWeight('entering', MONITOR.enter / 2, 1, MONITOR)).toBeCloseTo(0.5)
    expect(flightWeight('entering', MONITOR.enter, 1, MONITOR)).toBe(1)
    expect(flightWeight('leaving', 0, 0.4, MONITOR)).toBeCloseTo(0.4)
    expect(flightWeight('leaving', MONITOR.leave, 0.4, MONITOR)).toBe(0)
  })

  it('has its texts in every locale that has an arcade', () => {
    const site = readSite()
    for (const locale of Object.keys(site.arcade ?? {})) expect(site.monitor?.[locale]?.comeCloser).toBeTruthy()
  })
})

for (const [name, aspect] of [
  ['wide', 16 / 9],
  ['laptop', 16 / 10],
  ['portrait', 9 / 16],
] as const) {
  describe(`the monitor in the office (${name} screen)`, () => {
    const page = readPage('en', [])!
    const plan = routePlan(page)
    const sizes = plan.stops.map((s) => (s.exhibit ? { width: 4, height: 2.6 } : { width: 2.4, height: 3.6 }))
    const layout = layoutRoute(plan, sizes, aspect)
    // The portal hall (as wide as the test layout made it) and the stop before it.
    const hallStop = plan.stops.findIndex((s) => page.blocks[s.blockIndex]!.type === 'door')
    const before = layout.stations[hallStop - 1]!
    const hallWidth = sizes[hallStop]!.width
    // The character of that stop (the CTA's Mykola), at its side.
    const guy = toWorld([1.6, 0, 0.3], before.anchor, before.yaw)
    const spot = monitorSpot(layout, hallStop, hallWidth, guy)!
    const office = buildOffice(layout, undefined, aspect, spot)
    const desk = office.monitor[0]!
    const view = monitorView(desk.screen, aspect)
    const blockers = [
      ...office.footprints,
      ...layout.stations.flatMap((st, i) => (i === desk.station || i === desk.hall ? [] : [{ x: st.anchor[0], z: st.anchor[2], r: 2.4 }])),
    ]

    it('stands by the portal hall, to the side of its doors — the way to them free (Dima 2026-11-18)', () => {
      expect(desk).toBeDefined()
      expect(desk.station).toBe(hallStop - 1)
      expect(desk.hall).toBe(hallStop)
      const h = layout.stations[hallStop]!
      // On the hall's floor (a mezzanine too) and on it, not over its edge.
      expect(desk.at[1]).toBeCloseTo(h.anchor[1], 6)
      for (const m of layout.architecture.mezzanines.filter((m) => Math.abs(m.frame.level - h.anchor[1]) < 0.05)) {
        const fw = [Math.sin(m.frame.heading), -Math.cos(m.frame.heading)]
        const rt = [Math.cos(m.frame.heading), Math.sin(m.frame.heading)]
        const dx = desk.at[0] - m.frame.origin[0]
        const dz = desk.at[2] - m.frame.origin[2]
        expect(Math.abs(dx * rt[0]! + dz * rt[1]!)).toBeLessThanOrEqual(m.half - 0.75)
        expect(dx * fw[0]! + dz * fw[1]!).toBeLessThanOrEqual(m.to)
      }
      // Left of the hall (its local −x), beyond its edge: not in front of a door.
      const c = Math.cos(h.yaw)
      const sn = Math.sin(h.yaw)
      const lx = (desk.at[0] - h.anchor[0]) * c - (desk.at[2] - h.anchor[2]) * sn
      expect(lx).toBeLessThan(-(hallWidth / 2 + MONITOR_SPOT.min) + 1e-6)
      // By depth halfway from the doors to the character (Dima: "between Mykola and the portals").
      const lz = (p: Vec3) => (p[0] - h.anchor[0]) * sn + (p[2] - h.anchor[2]) * c
      expect(lz(desk.at)).toBeCloseTo(Math.max(MONITOR_SPOT.forward, lz(guy) * MONITOR_SPOT.between), 6)
      expect(lz(desk.at)).toBeLessThan(lz(guy))
      // The screen faces the camera at the stop before the hall.
      const vp = before.viewpoint
      const dx = vp[0] - desk.screen.center[0]
      const dz = vp[2] - desk.screen.center[2]
      expect((dx * desk.screen.normal[0] + dz * desk.screen.normal[1]) / Math.hypot(dx, dz)).toBeGreaterThan(0.99)
    })

    it('the camera can fly in from the stop that sees it', () => {
      const from = layout.stations[desk.station]!.viewpoint
      expect(flightClear(from, desk, view.eye, layout.architecture.walls, blockers, MONITOR.reach)).toBe(true)
    })

    it('the coffee and the meeting keep away from it', () => {
      const far = (p: Vec3) => Math.hypot(p[0] - desk.at[0], p[2] - desk.at[2])
      for (const c of office.coffee) expect(far(c.at)).toBeGreaterThanOrEqual(MONITOR_DESK.apart)
      for (const m of office.meeting) expect(far(m.at)).toBeGreaterThan(MONITOR_DESK.apart - 1.5)
    })

    it('nothing stands where the camera ends up in front of the screen', () => {
      for (const f of office.footprints) {
        if (Math.hypot(f.x - desk.at[0], f.z - desk.at[2]) < 1.2) continue
        expect(Math.hypot(view.eye[0] - f.x, view.eye[2] - f.z)).toBeGreaterThan(f.r)
      }
    })
  })
}
