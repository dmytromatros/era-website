/**
 * People standing about on the route's own floor (E2a, Dima 2026-11-16: "the ones who stand,
 * talk, walk — scatter them in the middle too; not right on the road, but not behind a desk or
 * the glass either"): two chatting beside an exhibit, someone pacing up and down on the phone.
 * They stand beside an exhibit, a little behind its front: at the stop itself the exhibit fills
 * the frame, so they are seen on the way to it — in front of the camera, sharp (the blur is off
 * between stops), not on the screen's edge.
 *
 * E2b: a sofa with someone asleep on it, the same way (Dima: "the sofa can go in the corridor
 * too") — the office's own sofas are all behind glass or desks, out of sight; this one faces the
 * camera's path.
 *
 * This is a stated exception to CLAUDE.md rule 15 (nothing on the clear floor), like the props
 * (C2): never near the camera's path, beside an exhibit (not in front of it), not on a
 * character's place or a prop's, not on stairs or under a mezzanine. Pure, tested in
 * crowd.test.ts.
 */
import { seeded } from '@/lib/random'
import { toWorld } from '../exhibitModel'
import { forward, right, type ClearRect, type Vec3, type WorldLayout } from '../layout'
import { distanceToRail, onRouteFloor, type PropSpot, type StopExhibit } from '../physics/propsModel'

export const FLOOR = {
  /** Keep this far (m) from the camera's path, characters, props and other exhibits' edges. */
  fromRail: 1.7,
  fromHelper: 2.0,
  fromProp: 1.1,
  fromExhibit: 0.9,
  /** The sofa's edges (a still thing, like the props) may come this near the path. */
  sofaFromRail: 1.3,
  /** Two who chat stand this far apart (m); a pacer walks this long a line (m). */
  pairGap: 1.0,
  paceLength: 2.6,
  /** At most this many groups on a page, at most one per stop. */
  maxGroups: 4,
  /** Seen on the way to the stop: within this angle (rad) of where the camera heads, and range (m). */
  approachAngle: 0.5,
  approachRange: [3, 16] as const,
} as const

/** Where the camera is on the way to stop `i`: halfway from the previous stop's viewpoint. */
function approachEye(layout: WorldLayout, i: number): readonly [number, number, number] {
  const st = layout.stations[i]!
  const prev = layout.stations[i - 1]
  return prev ? [(prev.viewpoint[0] + st.viewpoint[0]) / 2, 0, (prev.viewpoint[2] + st.viewpoint[2]) / 2] : st.viewpoint
}

/** No character stands in the line of sight from the approach to `p` (within `width` of it). */
export function unblockedOnApproach(layout: WorldLayout, i: number, p: Vec3, helpers: Vec3[], width = 0.7): boolean {
  const eye = approachEye(layout, i)
  const dx = p[0] - eye[0]
  const dz = p[2] - eye[2]
  const len = Math.hypot(dx, dz)
  return helpers.every((h) => {
    const t = ((h[0] - eye[0]) * dx + (h[2] - eye[2]) * dz) / (len * len || 1)
    if (t <= 0 || t >= 1) return true
    return Math.hypot(eye[0] + dx * t - h[0], eye[2] + dz * t - h[2]) > width
  })
}

/**
 * Seen while walking up to stop `i`: from halfway between the previous stop's viewpoint and this
 * one, looking at this stop, the point is near the middle of the picture and not too far.
 */
export function seenOnApproach(layout: WorldLayout, i: number, p: Vec3): boolean {
  const st = layout.stations[i]!
  const eye = approachEye(layout, i)
  const lx = st.focus[0] - eye[0]
  const lz = st.focus[2] - eye[2]
  const px = p[0] - eye[0]
  const pz = p[2] - eye[2]
  const d = Math.hypot(px, pz)
  const [near, far] = FLOOR.approachRange
  if (d < near || d > far) return false
  return (lx * px + lz * pz) / (Math.hypot(lx, lz) * d) > Math.cos(FLOOR.approachAngle)
}

export interface FloorGroup {
  kind: 'pair' | 'pace' | 'sofa'
  /** Pair: where the two stand (they face each other). Pace: the two ends of the walk. Sofa: its centre (twice). */
  points: [Vec3, Vec3]
  station: number
  /** Sofa: its yaw — the front faces the camera's path, the seat runs along its local x. */
  yaw?: number
}

/** A corridor sofa's size (m): length along its x, depth along its z; seat top height. */
/** `wallGap`: the sofa's centre this far in from the clear floor's edge (its back ≈ 0.3 m off the glass). */
export const SOFA = { length: 2.1, depth: 0.86, seat: 0.44, wallGap: 1.05 } as const

/** Across-the-zone coordinate of a floor point (+ = the zone's right). */
function across(z: ClearRect, p: Vec3): number {
  const rt = right(z.frame.heading)
  return (p[0] - z.frame.origin[0]) * rt[0] + (p[2] - z.frame.origin[2]) * rt[2]
}

/** Every place on the route's floor where a group fits, per stop (deterministic). */
export function floorOptions(
  layout: WorldLayout,
  exhibits: StopExhibit[],
  props: PropSpot[],
  skip: number[],
): FloorGroup[] {
  const helpers = exhibits.flatMap((e) => e.helpers)
  const fits = (p: Vec3, st: number) => roomFor(p) && seenOnApproach(layout, st, p)
  // Room on the floor (not near the path, characters, props, exhibits) — seen or not.
  const roomFor = (p: Vec3, fromRail: number = FLOOR.fromRail) =>
    onRouteFloor(layout, p[0], p[2], 0.35) &&
    distanceToRail(layout.rail, p[0], p[2]) > fromRail &&
    helpers.every((h) => Math.hypot(h[0] - p[0], h[2] - p[2]) > FLOOR.fromHelper) &&
    props.every((s) => Math.hypot(s.at[0] - p[0], s.at[2] - p[2]) > FLOOR.fromProp) &&
    layout.stations.every(
      (o, j) => Math.hypot(o.anchor[0] - p[0], o.anchor[2] - p[2]) > (exhibits[j]?.width ?? 0) / 2 + FLOOR.fromExhibit,
    )
  // A straight line between two points stays fit (sampled every 0.3 m).
  const lineFits = (a: Vec3, b: Vec3, st: number) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.3)
    for (let i = 0; i <= n; i++) {
      const t = i / n
      if (!fits([a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t], st)) return false
    }
    return true
  }
  const out: FloorGroup[] = []
  layout.stations.forEach((st, i) => {
    const ex = exhibits[i]
    if (!ex || ex.width <= 0 || skip.includes(i) || st.anchor[1] > 0.01) return
    // Beside the exhibit, level with it or a little behind (its frame: +x across, +z to the camera).
    for (const side of [-1, 1]) {
      const fit: Vec3[] = []
      for (let o = 1.1; o <= 3.1 + 1e-9; o += 0.4) {
        for (let fwd = 0.4; fwd >= -1.6 - 1e-9; fwd -= 0.4) {
          const x = side * (ex.width / 2 + o)
          // A pair: side by side across, facing each other.
          const a = toWorld([x, 0, fwd], st.anchor, st.yaw)
          if (!fits(a, i)) continue
          fit.push(a)
          const b = toWorld([x + side * FLOOR.pairGap, 0, fwd], st.anchor, st.yaw)
          if (fits(b, i)) out.push({ kind: 'pair', points: [a, b], station: i })
        }
      }
      // A sofa: against the corridor's glass wall, its back to the glass and its front to the
      // corridor (Dima 2026-11-16: "a bit dumb when a sofa stands right in the middle of the
      // road"), level with a fitting point; the whole of it must have room.
      for (const c of fit) {
        const zone = layout.architecture.clear.find((z) => {
          if (z.frame.level > 0) return false
          const fw = forward(z.frame.heading)
          const along = (c[0] - z.frame.origin[0]) * fw[0] + (c[2] - z.frame.origin[2]) * fw[2]
          return along > z.from && along < z.to && Math.abs(across(z, c)) < z.half
        })
        if (!zone) continue
        const fw = forward(zone.frame.heading)
        const rt = right(zone.frame.heading)
        const along = (c[0] - zone.frame.origin[0]) * fw[0] + (c[2] - zone.frame.origin[2]) * fw[2]
        const side = Math.sign(across(zone, c)) || 1
        const off = side * (zone.half - SOFA.wallGap)
        const centre: Vec3 = [zone.frame.origin[0] + fw[0] * along + rt[0] * off, 0, zone.frame.origin[2] + fw[2] * along + rt[2] * off]
        // Front: away from the wall, across the corridor.
        const front = [-rt[0] * side, -rt[2] * side] as const
        const yaw = Math.atan2(front[0], front[1])
        const lx = Math.cos(yaw)
        const lz = -Math.sin(yaw)
        const at = (a: number, b: number): Vec3 => [centre[0] + lx * a + front[0] * b, 0, centre[2] + lz * a + front[1] * b]
        const h = SOFA.length / 2
        const d = SOFA.depth / 2
        const corners = [at(0, 0), at(-h, 0), at(h, 0), at(0, d), at(0, -d), at(-h, d), at(h, d), at(-h, -d), at(h, -d)]
        if (!seenOnApproach(layout, i, centre)) continue
        // Not hidden behind the exhibit's character on the way there (a first try was).
        if (!unblockedOnApproach(layout, i, centre, helpers, 0.8)) continue
        // Its edges may come a little nearer the path than a person (it does not move): as near
        // as the props (C2).
        if (corners.every((p) => roomFor(p, FLOOR.sofaFromRail))) out.push({ kind: 'sofa', points: [centre, centre], station: i, yaw })
      }
      // A pacer: up and down a straight line between two fitting points 1.6–2.6 m apart.
      for (let m = 0; m < fit.length; m++) {
        for (let n = m + 1; n < fit.length; n++) {
          const a = fit[m]!
          const b = fit[n]!
          const d = Math.hypot(b[0] - a[0], b[2] - a[2])
          if (d >= 1.6 && d <= FLOOR.paceLength && lineFits(a, b, i)) out.push({ kind: 'pace', points: [a, b], station: i })
        }
      }
    }
  })
  return out
}

/** This page view's groups: at most one per stop, spread over the page, kinds mixed. */
export function pickFloorGroups(options: FloorGroup[], seed: number, max: number = FLOOR.maxGroups): FloorGroup[] {
  const rand = seeded(seed * 131 + 5)
  const byStop = new Map<number, FloorGroup[]>()
  for (const o of options) byStop.set(o.station, [...(byStop.get(o.station) ?? []), o])
  const stops = [...byStop.keys()]
  // Shuffle the stops, take every other one first so the groups do not bunch up.
  for (let i = stops.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[stops[i], stops[j]] = [stops[j]!, stops[i]!]
  }
  const out: FloorGroup[] = []
  // One sofa first (E2b: someone asleep on it), at a random stop that has room for one.
  const sofaStops = stops.filter((s) => byStop.get(s)!.some((g) => g.kind === 'sofa'))
  if (sofaStops.length && max > 0) {
    const s = sofaStops[Math.floor(rand() * sofaStops.length)]!
    const sofas = byStop.get(s)!.filter((g) => g.kind === 'sofa')
    out.push(sofas[Math.floor(rand() * sofas.length)]!)
  }
  let wantPair = rand() < 0.5
  for (const s of stops) {
    if (out.length >= max) break
    if (out.some((g) => Math.abs(g.station - s) < 2)) continue
    const list = byStop.get(s)!.filter((g) => g.kind !== 'sofa')
    if (!list.length) continue
    const kind = list.filter((g) => g.kind === (wantPair ? 'pair' : 'pace'))
    const pool = kind.length ? kind : list
    const g = pool[Math.floor(rand() * pool.length)]!
    out.push(g)
    wantPair = g.kind !== 'pair'
  }
  return out
}
