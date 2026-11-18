import { describe, expect, it } from 'vitest'
import { readPage, readSite } from '@/content/read'
import { PIXEL_CHARSET, PIXEL_TEXT } from '@/content/pixelCharset'
import { ENTRANCE_GEOMETRY, layoutRoute, type Vec3 } from '../layout'
import { ARCADE_CAB, blocked, buildOffice } from '../officeModel'
import { routePlan } from '../route'
import { buildNavGrid } from '../crowd/navGrid'
import { crowdSpots, guestAtArcade, LOSE, newCrowd, stepCrowd, type View } from '../crowd/crowdModel'
import { poseOf } from '../crowd/crowdPose'
import { ARCADE, flightClear, flightWeight, screenView } from './arcadeModel'
import { GLYPH, missingGlyphs, textWidth } from './pixelFont'
import { SCREEN } from './screenDraw'

describe('the pixel font (E3)', () => {
  it('has a glyph for every character the content may use', () => {
    expect(missingGlyphs()).toEqual([])
  })

  it('the schema pattern takes exactly those characters', () => {
    expect(PIXEL_TEXT.test(PIXEL_CHARSET)).toBe(true)
    expect(PIXEL_TEXT.test('lower case')).toBe(false)
    expect(PIXEL_TEXT.test('ÄÖ')).toBe(false)
  })

  it('every glyph is 5 × 7', () => {
    for (const ch of PIXEL_CHARSET) expect(textWidth(ch)).toBe(GLYPH.w)
  })
})

describe('the arcade texts fit the screen', () => {
  const site = readSite()
  for (const [locale, a] of Object.entries(site.arcade ?? {})) {
    it(locale, () => {
      const room = SCREEN.w - 8
      const fits = (text: string, scale: number) => expect(textWidth(text, scale), text).toBeLessThanOrEqual(room)
      fits(a.title, a.title.length > 5 ? 3 : 4)
      fits(a.subtitle, 2)
      fits(a.insertCoin, 2)
      fits(`${a.hiScore} ${a.scores[0]!.name} 999999`, 1)
      for (const line of Object.values(a.game)) fits(line, 1)
      for (const s of a.scores) {
        fits(s.note, 1)
        fits(`${a.scores.length}. ${s.name}`, 1)
      }
    })
  }
})

describe('flying into the screen', () => {
  const screen = { center: [2, 1.4, -3] as Vec3, size: [0.56, 0.42] as [number, number], normal: [0, 1] as [number, number] }

  for (const aspect of [16 / 10, 9 / 16]) {
    it(`the screen fills the frame, with a little bezel (aspect ${aspect.toFixed(2)})`, () => {
      const { eye, look, distance } = screenView(screen, aspect)
      expect(look).toEqual(screen.center)
      // Straight in front of it, at its height.
      expect(eye[0]).toBeCloseTo(2)
      expect(eye[1]).toBeCloseTo(1.4)
      expect(eye[2]).toBeCloseTo(-3 + distance)
      const t = Math.tan((ENTRANCE_GEOMETRY.fov * Math.PI) / 360)
      const seenW = (screen.size[0] / (2 * distance * t * aspect)) * 1
      const seenH = screen.size[1] / (2 * distance * t)
      // One side edge to edge with the margin, the other within the frame.
      expect(Math.max(seenW, seenH)).toBeCloseTo(1 / ARCADE_CAB.margin, 5)
      expect(Math.min(seenW, seenH)).toBeLessThanOrEqual(1 / ARCADE_CAB.margin + 1e-9)
    })
  }

  it('the flight eases in and out, and turns round from where it is', () => {
    expect(flightWeight('idle', 5)).toBe(0)
    expect(flightWeight('entering', 0)).toBe(0)
    expect(flightWeight('entering', ARCADE.enter / 2)).toBeCloseTo(0.5)
    expect(flightWeight('entering', ARCADE.enter * 2)).toBe(1)
    expect(flightWeight('inside', 0)).toBe(1)
    expect(flightWeight('leaving', 0)).toBe(1)
    expect(flightWeight('leaving', ARCADE.leave)).toBe(0)
    // Turned round at 0.3: the way out starts there, no jump.
    expect(flightWeight('leaving', 0, 0.3)).toBeCloseTo(0.3)
    expect(flightWeight('leaving', ARCADE.leave, 0.3)).toBe(0)
  })
})

for (const [name, aspect] of [
  ['wide', 16 / 9],
  ['portrait', 9 / 16],
] as const) {
  describe(`the arcade in the office (${name} screen)`, () => {
    const page = readPage('en', [])!
    const plan = routePlan(page)
    const sizes = plan.stops.map((s) => (s.exhibit ? { width: 4, height: 2.6 } : { width: 2.4, height: 3.6 }))
    const layout = layoutRoute(plan, sizes, aspect)
    const office = buildOffice(layout, undefined, aspect)
    const cabinet = office.arcade[0]!
    const blockers = [...office.footprints, ...layout.stations.map((st) => ({ x: st.anchor[0], z: st.anchor[2], r: 2.4 }))]
    const view = screenView(cabinet.screen, aspect)

    it('the camera can fly in from the stop that sees it', () => {
      const from = layout.stations[cabinet.station]!.viewpoint
      expect(flightClear(from, cabinet, view.eye, layout.architecture.walls, blockers)).toBe(true)
    })

    it('but not from too far, nor through a glass partition', () => {
      const far: Vec3 = [view.eye[0] + ARCADE.reach + 1, 1.3, view.eye[2]]
      expect(flightClear(far, cabinet, view.eye, [], [])).toBe(false)
      const wall = { center: [(view.eye[0] + 0) / 1, 1.5, view.eye[2] + 1.5] as Vec3, size: [0.1, 3, 6] as Vec3, yaw: Math.PI / 2 }
      const behind: Vec3 = [view.eye[0], 1.3, view.eye[2] + 3]
      expect(flightClear(behind, cabinet, view.eye, [wall], [])).toBe(false)
      expect(flightClear(behind, cabinet, view.eye, [], [])).toBe(true)
    })

    it('the eye in front of the screen is off the route and clear of the cabinet', () => {
      // Nothing the camera would fly into: at most the cabinet's own footprint.
      for (const f of office.footprints) {
        if (Math.hypot(f.x - cabinet.at[0], f.z - cabinet.at[2]) < 1.2) continue
        expect(Math.hypot(view.eye[0] - f.x, view.eye[2] - f.z)).toBeGreaterThan(f.r)
      }
    })

    describe('someone plays it', () => {
      const grid = buildNavGrid(office)
      const spots = crowdSpots(office, layout, grid)
      const crowd = newCrowd(spots, 20, 7, 0, office.coffee.map((c) => c.steam))
      const player = crowd.people.findIndex((p) => p.task === 'play')

      it('a player stands at the machine, off the route', () => {
        expect(player).toBeGreaterThanOrEqual(0)
        const at = crowd.spots[crowd.people[player]!.spot]!.at
        expect(blocked(at[0], at[2], 0.3, office.keepOff)).toBe(false)
      })

      it('loses only where the camera sees it, and never while the guest is in the machine', () => {
        const at = cabinet.player.at
        const st = layout.stations[cabinet.station]!
        const dx = at[0] - st.viewpoint[0]
        const dz = at[2] - st.viewpoint[2]
        const n = Math.hypot(dx, dz)
        const looking: View = { eye: st.viewpoint, dir: [dx / n, dz / n] }
        const away: View = { eye: st.viewpoint, dir: [-dx / n, -dz / n] }
        // Looking away: no loss (nor anything else needing it).
        for (let t = 1; t < 30; t += 0.5) stepCrowd(crowd, t, grid, away)
        expect(crowd.people[player]!.bonkAt).toBe(-Infinity)
        // The guest in the machine: still none.
        guestAtArcade(crowd, true, 30)
        for (let t = 30; t < 60; t += 0.5) stepCrowd(crowd, t, grid, looking)
        expect(crowd.people[player]!.bonkAt).toBe(-Infinity)
        // The guest gone: the player shrugs, and loses while seen.
        guestAtArcade(crowd, false, 60)
        expect(crowd.people[player]!.react).toBe('shrug')
        let lost = -Infinity
        for (let t = 60; t < 120 && lost === -Infinity; t += 0.5) {
          stepCrowd(crowd, t, grid, looking)
          if (Number.isFinite(crowd.people[player]!.bonkAt)) lost = crowd.people[player]!.bonkAt
        }
        expect(Number.isFinite(lost)).toBe(true)
        // Mid-loss the arms are up; then back to playing.
        const up = poseOf(crowd, player, lost + (LOSE.shock + LOSE.up) / 2)
        expect(up.armLZ).toBeLessThan(-2)
        const after = poseOf(crowd, player, lost + LOSE.total + 0.5)
        expect(after.armLZ).toBeGreaterThan(-0.5)
        // The head stays out of the cabinet all along (Dima 2026-11-18: it went through it): how far
        // a lean takes it forward (≈ 0.6 m of torso, 0.2 m to the face) against the room in front.
        const room = ARCADE_CAB.player.at[2] - 0.34 - 0.12
        for (let u = 0; u <= LOSE.total + 1; u += 0.05) {
          const p = poseOf(crowd, player, lost + u)
          expect(Math.sin(p.torsoX) * 0.6 + Math.sin(p.torsoX + p.headX) * 0.2).toBeLessThan(room)
        }
      })

      it('steps aside (out of the camera’s way) while the guest is in the machine', () => {
        const spot = crowd.spots[crowd.people[player]!.spot]!
        guestAtArcade(crowd, true, 200)
        const aside = poseOf(crowd, player, 201)
        expect(Math.hypot(aside.at[0] - cabinet.player.aside[0], aside.at[2] - cabinet.player.aside[2])).toBeLessThan(1e-6)
        // Well clear of the camera in front of the screen, and of the line it flies in on.
        expect(Math.hypot(aside.at[0] - view.eye[0], aside.at[2] - view.eye[2])).toBeGreaterThan(0.9)
        // …and of the camera's way in, from the stop to the screen.
        const a = layout.stations[cabinet.station]!.viewpoint
        const b = view.eye
        const abx = b[0] - a[0]
        const abz = b[2] - a[2]
        const k = Math.max(0, Math.min(1, ((aside.at[0] - a[0]) * abx + (aside.at[2] - a[2]) * abz) / (abx * abx + abz * abz)))
        expect(Math.hypot(a[0] + abx * k - aside.at[0], a[2] + abz * k - aside.at[2])).toBeGreaterThan(0.5)
        expect(spot.kind).toBe('arcade')
        guestAtArcade(crowd, false, 210)
        const back = poseOf(crowd, player, 211)
        expect(Math.hypot(back.at[0] - spot.at[0], back.at[2] - spot.at[2])).toBeLessThan(1e-6)
      })
    })
  })
}
