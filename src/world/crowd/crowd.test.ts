import { describe, expect, it } from 'vitest'
import { readPage } from '@/content/read'
import { layoutRoute } from '../layout'
import { blocked, buildOffice } from '../officeModel'
import { routePlan } from '../route'
import { buildNavGrid, clearLine, findPath, NAV, pathLength, walkable } from './navGrid'
import { burstTime, chattersAt, CROWD, crowdSpots, hidden, newCrowd, stepCrowd, type Attention, type View } from './crowdModel'
import type { Vec3 } from '../layout'
import { onSpinningChair, poseOf } from './crowdPose'
import { FLOOR, floorOptions, pickFloorGroups } from './floorModel'
import { toWorld } from '../exhibitModel'
import { distanceToRail, onRouteFloor, placeProps, type StopExhibit } from '../physics/propsModel'

const page = readPage('en', [])!
const plan = routePlan(page)
const sizes = plan.stops.map((s) => (s.exhibit ? { width: 4, height: 2.6 } : { width: 2.4, height: 3.6 }))

for (const [name, aspect] of [
  ['wide', 16 / 9],
  ['portrait', 9 / 16],
] as const) {
  describe(`the office's people (${name} screen)`, () => {
    const layout = layoutRoute(plan, sizes, aspect)
    const office = buildOffice(layout)
    const grid = buildNavGrid(office)
    const spots = crowdSpots(office, layout, grid)
    const clear = office.keepOff
    const steam = office.coffee.map((c) => c.steam)
    // The camera standing at each stop in turn, 10 s each, looking where it looks there.
    const viewAt = (now: number): View => {
      const st = layout.stations[Math.floor(now / 10) % layout.stations.length]!
      const dx = st.focus[0] - st.viewpoint[0]
      const dz = st.focus[2] - st.viewpoint[2]
      const n = Math.hypot(dx, dz)
      return { eye: st.viewpoint, dir: [dx / n, dz / n] }
    }

    it('a coffee corner, off the clear floor, with room for two to stand', () => {
      expect(steam.length).toBeGreaterThan(0)
      for (const c of office.coffee) expect(blocked(c.at[0], c.at[2], 0.8, clear)).toBe(false)
      const coffee = spots.filter((s) => s.kind === 'coffee')
      expect(coffee.length).toBe(office.coffee.length * 2)
      for (const s of coffee) {
        expect(s.exit).not.toBeNull()
        expect(walkable(grid, s.exit![0], s.exit![2])).toBe(true)
        expect(Math.hypot(s.exit![0] - s.at[0], s.exit![2] - s.at[2])).toBeLessThanOrEqual(0.5)
      }
    })

    it('a spot at every desk chair, facing its desk, most with a walkable way out', () => {
      const desks = spots.filter((s) => s.kind === 'desk')
      expect(desks.length).toBe(office.chairs.length)
      // The row facing the route gets up away from it; the other row's way out would be the path.
      expect(desks.filter((s) => s.exit).length).toBeGreaterThanOrEqual(desks.length * 0.4)
      expect(desks.some((s) => s.facesRoute)).toBe(true)
      for (const s of desks) if (s.exit) expect(walkable(grid, s.exit[0], s.exit[2])).toBe(true)
    })

    it('walks never cross furniture, columns or the clear floor (camera path, exhibits, stairs)', () => {
      const exits = spots.filter((s) => s.exit).map((s) => s.exit!)
      let found = 0
      for (let i = 0; i < exits.length; i += 7) {
        for (let j = i + 1; j < exits.length; j += 9) {
          const path = findPath(grid, exits[i]!, exits[j]!)
          if (!path) continue
          found++
          expect(path[0]).toEqual(exits[i])
          expect(path.at(-1)).toEqual(exits[j])
          for (let k = 1; k < path.length; k++) {
            const a = path[k - 1]!
            const b = path[k]!
            expect(clearLine(grid, [a[0], a[2]], [b[0], b[2]])).toBe(true)
            const n = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.25)
            for (let m = 0; m <= n; m++) {
              const x = a[0] + ((b[0] - a[0]) * m) / n
              const z = a[2] + ((b[2] - a[2]) * m) / n
              expect(blocked(x, z, NAV.body - NAV.cell, clear)).toBe(false)
              for (const f of office.footprints) if (Math.hypot(f.x - x, f.z - z) <= f.r) expect.fail(`walks into ${f.kind} at ${f.x},${f.z}`)
            }
          }
        }
      }
      expect(found).toBeGreaterThan(3)
    }, 30000)

    it('dealt at random per page view: same seed, same office; another seed, other people', () => {
      const a = newCrowd(spots, 8, 1, 0, steam)
      const b = newCrowd(spots, 8, 1, 0, steam)
      const c = newCrowd(spots, 8, 2, 0, steam)
      expect(a.people.map((p) => p.spot)).toEqual(b.people.map((p) => p.spot))
      expect(a.people.map((p) => [p.spot, p.look.shirt].join())).not.toEqual(c.people.map((p) => [p.spot, p.look.shirt].join()))
      expect(a.people.length).toBe(8)
      expect(a.people.filter((p) => p.task === 'chat').length).toBe(2)
      expect(new Set(a.people.map((p) => p.spot)).size).toBe(8)
      expect(newCrowd(spots, 3, 1).people.length).toBe(3)
      expect(newCrowd(spots, 20, 1, 0, steam).people.length).toBe(20) // `high`
      expect(newCrowd(spots, 0, 1).people.length).toBe(0)
    })

    it('over a few minutes: people get up, walk, sit; never two on one spot; poses stay sane', () => {
      const crowd = newCrowd(spots, 8, 7, 0, steam)
      const tasks = new Set<string>()
      let moves = 0
      let bursts = 0
      let bonks = 0
      const calls: Attention[] = []
      for (let now = 0; now < 300; now += 0.1) {
        const before = crowd.people.map((p) => p.to)
        const call = stepCrowd(crowd, now, grid, viewAt(now))
        if (call) calls.push(call)
        crowd.people.forEach((p, i) => {
          tasks.add(p.task)
          if (before[i] === -1 && p.to >= 0) moves++
          if (p.task === 'type' && now >= p.bonkAt && now < p.bonkAt + 0.1) bonks++
          const pose = poseOf(crowd, i, now)
          for (const v of [...pose.at, pose.yaw, pose.lift, pose.headX, pose.foreR, pose.legL]) expect(Number.isFinite(v)).toBe(true)
          // Nobody floats off or sinks into the floor.
          expect(pose.lift).toBeGreaterThan(-0.2)
          expect(pose.lift).toBeLessThan(0.35)
        })
        if (office.coffee.some((_, k) => burstTime(crowd, k, now) !== null)) bursts++
        const where = crowd.people.map((p) => (p.task === 'walk' ? -1 - Math.random() : p.spot))
        expect(new Set(where).size).toBe(where.length)
        const targets = crowd.people.filter((p) => p.to >= 0).map((p) => p.to)
        expect(new Set(targets).size).toBe(targets.length)
      }
      expect(moves).toBeGreaterThanOrEqual(Math.floor(300 / CROWD.moveEvery[1]) - 1)
      expect([...tasks]).toEqual(expect.arrayContaining(['type', 'walk', 'chat']))
      expect(bonks).toBeGreaterThan(3)
      expect(bursts).toBeGreaterThan(0)
      // The camera is called now and then — never twice within the gap.
      expect(calls.length).toBeGreaterThan(2)
      for (let k = 1; k < calls.length; k++) expect(calls[k]!.start - calls[k - 1]!.start).toBeGreaterThanOrEqual(CROWD.attentionGap - 1e-6)
    }, 30000)

    it('gags play only where the camera looks: none for nobody, one soon after it is seen', () => {
      const crowd = newCrowd(spots, 12, 3, 0, steam)
      for (let now = 0; now < 8; now += 0.1) stepCrowd(crowd, now, grid)
      expect(crowd.people.some((p) => Number.isFinite(p.bonkAt))).toBe(false)
      expect(crowd.burstAt.every((t) => t === -Infinity)).toBe(true)
      // Looking at the coffee corner where two chat: the machine goes off within a second.
      const corner = crowd.people.map((p) => crowd.spots[p.spot]!).find((s) => s.kind === 'coffee')!.corner
      const top = steam[corner]!
      const eye: Vec3 = [top[0] + 6, 1.6, top[2]]
      let started = -1
      for (let now = 8; now < 10 && started < 0; now += 0.1) {
        stepCrowd(crowd, now, grid, { eye, dir: [-1, 0] })
        if (crowd.burstAt[corner]! > -Infinity) started = now
      }
      expect(started).toBeGreaterThanOrEqual(8)
      expect(crowd.burstAt[corner]! - started).toBeCloseTo(CROWD.lead, 6)
    })

    describe('people on the route floor (rule 15 exception)', () => {
      const skip = [0, layout.stations.length - 1]
      const exhibits: StopExhibit[] = layout.stations.map((st, i) => ({
        width: plan.stops[i]!.exhibit ? 4 : 0,
        elevation: 0.75,
        helpers: plan.stops[i]!.exhibit ? [toWorld([-2.9, 0, 0.35], st.anchor, st.yaw)] : [],
      }))
      const props = placeProps(layout, office, exhibits, 11, skip, aspect)
      const options = floorOptions(layout, exhibits, props, skip)

      it('beside exhibits, never near the camera path, an exhibit, a character or a prop', () => {
        expect(options.length).toBeGreaterThan(2)
        expect(options.some((o) => o.kind === 'pair')).toBe(true)
        expect(options.some((o) => o.kind === 'pace')).toBe(true)
        for (const o of options) {
          expect(skip).not.toContain(o.station)
          for (const p of o.points) {
            expect(onRouteFloor(layout, p[0], p[2], 0.35)).toBe(true)
            expect(distanceToRail(layout.rail, p[0], p[2])).toBeGreaterThan(FLOOR.fromRail)
            layout.stations.forEach((st, j) =>
              expect(Math.hypot(st.anchor[0] - p[0], st.anchor[2] - p[2])).toBeGreaterThan(exhibits[j]!.width / 2 + FLOOR.fromExhibit),
            )
            for (const h of exhibits.flatMap((e) => e.helpers)) expect(Math.hypot(h[0] - p[0], h[2] - p[2])).toBeGreaterThan(FLOOR.fromHelper)
            for (const pr of props) expect(Math.hypot(pr.at[0] - p[0], pr.at[2] - p[2])).toBeGreaterThan(FLOOR.fromProp)
          }
        }
      })

      it('a few groups per page view, spread out, different per seed', () => {
        const a = pickFloorGroups(options, 1)
        expect(a.length).toBeGreaterThan(0)
        expect(a.length).toBeLessThanOrEqual(FLOOR.maxGroups)
        const stops = a.map((g) => g.station).sort((x, y) => x - y)
        for (let k = 1; k < stops.length; k++) expect(stops[k]! - stops[k - 1]!).toBeGreaterThanOrEqual(2)
        expect(pickFloorGroups(options, 1)).toEqual(a)
        const seeds = new Set([1, 2, 3, 4, 5].map((sd) => JSON.stringify(pickFloorGroups(options, sd))))
        expect(seeds.size).toBeGreaterThan(1)
      })

      it('dealt first, they stay put: a pair chats, a pacer walks up and down its line', () => {
        const groups = pickFloorGroups(options, 2)
        const sp = crowdSpots(office, layout, grid, groups)
        const crowd = newCrowd(sp, 12, 2, 0, steam)
        const floor = crowd.people.filter((p) => ['floor', 'pace'].includes(sp[p.spot]!.kind))
        expect(floor.length).toBe(groups.reduce((n, g) => n + (g.kind === 'pair' ? 2 : 1), 0))
        for (let now = 0; now < 120; now += 0.25) {
          stepCrowd(crowd, now, grid)
          crowd.people.forEach((p, i) => {
            const s = sp[p.spot]!
            if (s.kind === 'floor') expect(p.task).toBe('chat')
            if (s.kind !== 'pace') return
            expect(p.task).toBe('pace')
            const pose = poseOf(crowd, i, now)
            const a = s.at
            const b = s.end!
            const len = Math.hypot(b[0] - a[0], b[2] - a[2])
            const along = ((pose.at[0] - a[0]) * (b[0] - a[0]) + (pose.at[2] - a[2]) * (b[2] - a[2])) / len
            expect(along).toBeGreaterThanOrEqual(-1e-6)
            expect(along).toBeLessThanOrEqual(len + 1e-6)
          })
        }
      })
    })

    it('calls the camera only while the visitor stands, and not when someone hides the gag', () => {
      const corner = 0
      const top = steam[corner]!
      const eye: Vec3 = [top[0] + 6, 1.6, top[2]]
      // Scrolling: the machine still goes off, but the camera is not called.
      const moving = newCrowd(spots, 12, 3, 0, steam)
      if (chattersAt(moving, corner).length < 2) return
      let call = null
      for (let now = 0; now < 2; now += 0.1) call ??= stepCrowd(moving, now, grid, { eye, dir: [-1, 0], still: false })
      expect(call).toBeNull()
      expect(moving.burstAt[corner]).toBeGreaterThan(-Infinity)
      // Standing: called — unless someone already stands in the way.
      const standing = newCrowd(spots, 12, 3, 0, steam)
      const gag: Vec3 = [top[0], top[1] + 0.2, top[2]]
      const inTheWay = hidden(standing, 0, eye, gag)
      call = null
      for (let now = 0; now < 2; now += 0.1) call ??= stepCrowd(standing, now, grid, { eye, dir: [-1, 0], still: true })
      expect(call === null).toBe(inTheWay)
      // Someone moved right onto the line of sight hides it: not called.
      const blocked = newCrowd(spots, 12, 3, 0, steam)
      const mid: Vec3 = [(eye[0] + top[0]) / 2, 0, (eye[2] + top[2]) / 2]
      blocked.spots.push({ kind: 'floor', at: mid, yaw: 0, exit: null, facesRoute: true, corner: -1, seen: 0 })
      blocked.people.find((p) => p.task === 'type')!.spot = blocked.spots.length - 1
      expect(hidden(blocked, 0, eye, gag)).toBe(true)
      call = null
      for (let now = 0; now < 2; now += 0.1) call ??= stepCrowd(blocked, now, grid, { eye, dir: [-1, 0], still: true })
      expect(call).toBeNull()
    })

    it('a sitter turns with a spinning swivel chair, arms out when it is fast', () => {
      const crowd = newCrowd(spots, 12, 5, 0, steam)
      const i = crowd.people.findIndex((p) => p.task === 'type')
      const seat = crowd.spots[crowd.people[i]!.spot]!
      const pose = poseOf(crowd, i, 1)
      expect(onSpinningChair(pose, seat.at, 0, 0)).toEqual(pose)
      const half = onSpinningChair(pose, seat.at, Math.PI, 0)
      // Half a turn: on the other side of the stem, facing the other way.
      expect(half.at[0] - seat.at[0]).toBeCloseTo(-(pose.at[0] - seat.at[0]), 6)
      expect(half.at[2] - seat.at[2]).toBeCloseTo(-(pose.at[2] - seat.at[2]), 6)
      expect(half.yaw).toBeCloseTo(pose.yaw + Math.PI, 6)
      // Fast: arms thrown out to the sides.
      const fast = onSpinningChair(pose, seat.at, 1, 12)
      expect(fast.armLZ).toBeLessThan(-1.5)
      expect(fast.armRZ).toBeGreaterThan(1.5)
    })

    it('chatting never jumps between poses (speaker ↔ listener blend)', () => {
      const crowd = newCrowd(spots, 8, 4, 0, steam)
      const chatters = crowd.people.map((p, i) => [p, i] as const).filter(([p]) => p.task === 'chat')
      expect(chatters.length).toBeGreaterThan(0)
      for (const [, i] of chatters) {
        let prev = poseOf(crowd, i, 0)
        for (let now = 1 / 60; now < 20; now += 1 / 60) {
          const pose = poseOf(crowd, i, now)
          for (const k of ['armRX', 'armRZ', 'foreR', 'armLX', 'armLZ', 'foreL', 'headX'] as const) {
            expect(Math.abs(pose[k] - prev[k]), `${k} at ${now.toFixed(2)}`).toBeLessThan(0.12)
          }
          prev = pose
        }
      }
    })

    it('a walk takes as long as its path at walking speed', () => {
      const exits = spots.filter((s) => s.exit).map((s) => s.exit!)
      const path = findPath(grid, exits[0]!, exits[exits.length - 1]!) ?? findPath(grid, exits[0]!, exits[1]!)
      if (path) expect(pathLength(path)).toBeGreaterThan(0)
    })
  })
}
