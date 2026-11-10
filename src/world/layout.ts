/**
 * Turns the route plan into a place: where every exhibit stands, where the camera stops to look
 * at it, the corner / stair waypoints in between, and the architecture (walls, steps, raised
 * floors). Pure — unit-tested.
 *
 * It walks like a turtle: a frame (position + heading + floor level) moves forward through each
 * zone, turns 90° at corners and climbs at stairs. Everything is placed relative to that frame,
 * so a turn changes the whole space after it, not just a number.
 *
 * Directions: heading 0 = travelling towards −z. `forward(h)` and `right(h)` give unit vectors.
 */
import { isTurn, type RoutePlan, type Transition, type ZoneShape } from './route'

export type Vec3 = [number, number, number]

export interface ExhibitSize {
  /** Footprint in world units (including helpers standing next to it). */
  width: number
  /** Height of its top above its floor. */
  height: number
}

export interface StationLayout {
  /** Floor point under the exhibit's centre — the exhibit's local origin. */
  anchor: Vec3
  /** Y rotation so the exhibit faces its viewpoint. */
  yaw: number
  /** Where the camera stops to look at it. */
  viewpoint: Vec3
  /** What the camera looks at from the viewpoint. */
  focus: Vec3
}

/** A box in its own frame: centre, size (x = across, y = up, z = along), yaw. */
export interface Box {
  center: Vec3
  size: Vec3
  yaw: number
}

/** A strip of floor that must stay free (path, exhibits, corners, stairs), in a frame's coordinates. */
export interface ClearRect {
  frame: Frame
  /** Along the frame's heading, from…to (metres from its origin). */
  from: number
  to: number
  /** Half width across. */
  half: number
}

/** A raised floor (antresol) reached by stairs; `frame.level` is its top. */
export interface Mezzanine {
  frame: Frame
  from: number
  to: number
  half: number
}

/** One flight of stairs, as the walking camera needs it (D2: a step onto each stair). */
export interface StairFlight {
  /** Floor point where the first step starts. */
  from: Vec3
  heading: number
  /** Length along the heading (m), height (m, negative = down), number of steps. */
  run: number
  rise: number
  steps: number
}

export interface Architecture {
  /** Corridor sides (rendered as glass partitions by the office). */
  walls: Box[]
  /** Stair steps, solid blocks standing on the ground. */
  stairs: Box[]
  /** The same stairs as flights. */
  flights: StairFlight[]
  mezzanines: Mezzanine[]
  /** Floor that furniture and columns must keep off. */
  clear: ClearRect[]
}

export interface WorldLayout {
  /** One per stop (indexed like plan.stops). */
  stations: StationLayout[]
  /** Camera rail control points: [start, entered, ...plan items]. */
  rail: Vec3[]
  /** Look-at targets, one per rail point. */
  look: Vec3[]
  architecture: Architecture
  /** Half width of corridors on this page. */
  corridorHalfWidth: number
  /** Where each zone starts, its heading and floor level (one per plan zone). */
  zoneFrames: Frame[]
}

/** Entrance geometry (camera starts looking at the hero "page"). */
export const ENTRANCE_GEOMETRY = {
  cameraStart: [0, 2.6, 10] as Vec3,
  /** Distance from the start camera to the plane where the hero twins sit. */
  heroDistance: 6,
  /** The membrane sits just behind the twins. */
  membraneDistance: 6.3,
  cameraEntered: [0, 1.9, 0.5] as Vec3,
  fov: 42,
}

export const PATH = {
  /** Gap between the path centre and the inner edge of an exhibit in an open zone. */
  clearance: 0.6,
  /** Extra room around an exhibit when fitting it on screen (vertical needs more: feet, bubbles). */
  marginX: 1.15,
  marginY: 1.45,
  minDistance: 3.2,
}

export const ARCH = {
  /** Office glass partitions. */
  wallHeight: 3,
  wallThickness: 0.2,
  minHalfWidth: 3.2,
  /** Exhibits in corridors are angled towards the approaching visitor by this much (radians). */
  corridorAngle: (40 * Math.PI) / 180,
  stairRise: 2.4,
  stairSteps: 12,
  stairRun: 6,
  stairWidth: 2.8,
  eye: 1.7,
  /** Free band around the path on a mezzanine (room for its railing and a plant or two). */
  mezzanineMargin: 1.2,
}

export const forward = (h: number): Vec3 => [Math.sin(h), 0, -Math.cos(h)]
export const right = (h: number): Vec3 => [Math.cos(h), 0, Math.sin(h)]

/** Camera distance at which a box of `w × h` fits the screen. */
export function fitDistance(w: number, h: number, aspect: number): number {
  const t = Math.tan(((ENTRANCE_GEOMETRY.fov / 2) * Math.PI) / 180)
  return Math.max((h * PATH.marginY) / (2 * t), (w * PATH.marginX) / (2 * t * aspect), PATH.minDistance)
}

/** Y rotation that makes an object's +z face along `dir`. */
const yawOf = (dir: Vec3) => Math.atan2(dir[0], dir[2])

export interface Frame {
  /** Zone origin on the floor (y is ignored; `level` is the floor height). */
  origin: Vec3
  heading: number
  level: number
}

/** Point `along` metres forward, `across` metres to the right of a frame's origin, `up` above its floor. */
export function at(f: Frame, along: number, across: number, up = 0): Vec3 {
  const fw = forward(f.heading)
  const rt = right(f.heading)
  return [
    f.origin[0] + fw[0] * along + rt[0] * across,
    f.level + up,
    f.origin[2] + fw[2] * along + rt[2] * across,
  ]
}

/** Corridor half width that fits every corridor exhibit of the page (see the corridor branch). */
export function corridorHalfWidth(sizes: ExhibitSize[], aspect: number): number {
  const phi = ARCH.corridorAngle
  return sizes.reduce((hw, s) => {
    const d = fitDistance(s.width, s.height, aspect)
    // the inner edge stays clear of the camera path; the viewpoint stays inside the opposite wall
    const forEdge = 0.95 + s.width * Math.sin(phi)
    const forView = (0.85 + 0.5 * s.width * Math.sin(phi) + d * Math.cos(phi)) / 2
    return Math.max(hw, forEdge, forView)
  }, ARCH.minHalfWidth)
}

export interface ZoneRecord {
  shape: ZoneShape
  frame: Frame
  before: Transition
  /** Distance along the zone where its content ends. */
  length: number
  /** Widest lateral extent of its content (for raised floors). */
  span: number
}

export function layoutRoute(plan: RoutePlan, sizes: ExhibitSize[], aspect = 16 / 9): WorldLayout {
  const { cameraStart, cameraEntered } = ENTRANCE_GEOMETRY
  const corridorSizes = plan.stops.flatMap((stop, i) =>
    plan.zones[stop.blockIndex]?.shape === 'corridor' && stop.exhibit ? [sizes[i]!] : [],
  )
  const hw = corridorHalfWidth(corridorSizes, aspect)
  const phi = ARCH.corridorAngle

  const stations: StationLayout[] = []
  const rail: Vec3[] = [cameraStart, cameraEntered]
  const look: Vec3[] = [
    [cameraStart[0], cameraStart[1], cameraStart[2] - 20],
    [cameraEntered[0], cameraEntered[1] - 0.2, cameraEntered[2] - 20],
  ]
  const stairs: Box[] = []
  const flights: StairFlight[] = []
  const clear: ClearRect[] = []
  const zones: ZoneRecord[] = []

  let frame: Frame = { origin: [cameraEntered[0], 0, cameraEntered[2]], heading: 0, level: 0 }
  // The entrance (camera start → hall) stays free too.
  clear.push({ frame, from: cameraEntered[2] - cameraStart[2] - 2, to: 0, half: 4 })
  let cursor = 0 // distance along the current zone
  let side = 0 // alternates exhibits left / right across the whole page

  for (const zone of plan.zones) {
    // ---- transition into the zone -------------------------------------------------------
    if (isTurn(zone.before)) {
      const turn = zone.before === 'right' ? 1 : -1
      const corner = at(frame, cursor + hw + 1, 0)
      const before: Frame = { origin: corner, heading: frame.heading, level: frame.level }
      const after: Frame = { origin: corner, heading: frame.heading + (turn * Math.PI) / 2, level: frame.level }
      rail.push(at(before, -1.2, 0, ARCH.eye), at(after, 1.2, 0, ARCH.eye))
      look.push(at(after, 6, 0, ARCH.eye), at(after, 12, 0, ARCH.eye))
      frame = after
      cursor = hw // start beyond the corner square
    } else if (zone.before === 'stairs-up' || (zone.before === 'stairs-down' && frame.level > 0)) {
      const rise = zone.before === 'stairs-up' ? ARCH.stairRise : -Math.min(ARCH.stairRise, frame.level)
      const start = cursor + 1
      const { stairSteps: n, stairRun: run } = ARCH
      for (let k = 0; k < n; k++) {
        const top = Math.max(frame.level + (rise * (k + 1)) / n, 0.02)
        const c = at(frame, start + ((k + 0.5) * run) / n, 0)
        stairs.push({ center: [c[0], top / 2, c[2]], size: [ARCH.stairWidth, top, run / n], yaw: frame.heading })
      }
      clear.push({ frame, from: start - 0.6, to: start + run + 0.6, half: ARCH.stairWidth / 2 + 0.6 })
      flights.push({ from: at(frame, start, 0), heading: frame.heading, run, rise, steps: n })
      rail.push(at(frame, start, 0, ARCH.eye), at(frame, start + run, 0, ARCH.eye + rise))
      look.push(at(frame, start + run + 4, 0, ARCH.eye + rise), at(frame, start + run + 10, 0, ARCH.eye + rise))
      const top = at(frame, start + run + 0.5, 0)
      frame = { origin: top, heading: frame.heading, level: frame.level + rise }
      cursor = 0
    } else if (zones.length > 0) {
      // straight on: the new zone simply starts where the last one ended
      frame = { origin: at(frame, cursor, 0), heading: frame.heading, level: frame.level }
      cursor = 0
    }

    const zoneFrame = frame
    let span = 2

    // ---- the zone's exhibits ------------------------------------------------------------
    plan.stops.forEach((stop, i) => {
      if (stop.blockIndex !== zone.blockIndex) return
      const size = sizes[i]!
      const d = fitDistance(size.width, size.height, aspect)
      const focusUp = size.height / 2
      const eyeUp = Math.max(focusUp, 1.2)

      if (!stop.exhibit) {
        // Doors: on the path, straight ahead, facing the visitor.
        const viewAt = cursor + 2
        const anchorAt = viewAt + d
        stations[i] = {
          anchor: at(frame, anchorAt, 0),
          yaw: yawOf(forward(frame.heading + Math.PI)),
          viewpoint: at(frame, viewAt, 0, eyeUp),
          focus: at(frame, anchorAt, 0, focusUp),
        }
        span = Math.max(span, size.width / 2 + 1.5)
        cursor = anchorAt + 2.5
      } else if (zone.shape === 'corridor') {
        // Against a wall, angled by `phi` towards the approaching visitor; viewed head-on.
        const s = side++ % 2 === 0 ? -1 : 1
        const lat = s * (hw - 0.25 - (size.width / 2) * Math.sin(phi))
        const anchorAt = cursor + d * Math.sin(phi) + 1
        const viewLat = Math.max(-(hw - 0.5), Math.min(hw - 0.5, lat - s * d * Math.cos(phi)))
        const viewAt = anchorAt - d * Math.sin(phi)
        const anchor = at(frame, anchorAt, lat)
        const viewpoint = at(frame, viewAt, viewLat, eyeUp)
        stations[i] = {
          anchor,
          yaw: yawOf([viewpoint[0] - anchor[0], 0, viewpoint[2] - anchor[2]]),
          viewpoint,
          focus: at(frame, anchorAt, lat, focusUp),
        }
        cursor = anchorAt + (size.width / 2) * Math.cos(phi) + 1.2
      } else {
        // Open zone: beside the path, turned towards a viewpoint near the path centre.
        const s = side++ % 2 === 0 ? -1 : 1
        const lat = s * (size.width / 2 + PATH.clearance)
        const viewLat = s * 0.2
        const dx = lat - viewLat
        const viewAt = cursor + 2
        const anchorAt = viewAt + Math.sqrt(Math.max(d * d - dx * dx, 1))
        const anchor = at(frame, anchorAt, lat)
        const viewpoint = at(frame, viewAt, viewLat, eyeUp)
        stations[i] = {
          anchor,
          yaw: yawOf([viewpoint[0] - anchor[0], 0, viewpoint[2] - anchor[2]]),
          viewpoint,
          focus: at(frame, anchorAt, lat, focusUp),
        }
        span = Math.max(span, Math.abs(lat) + size.width / 2 + 1.5)
        cursor = anchorAt + 2.5
      }
      rail.push(stations[i]!.viewpoint)
      look.push(stations[i]!.focus)
    })

    zones.push({ shape: zone.shape, frame: zoneFrame, before: zone.before, length: cursor, span })
  }

  return {
    stations,
    rail,
    look,
    architecture: {
      walls: buildWalls(zones, hw),
      stairs,
      flights,
      mezzanines: mezzanines(zones, hw),
      clear: [...clear, ...zoneClears(zones, hw)],
    },
    corridorHalfWidth: hw,
    zoneFrames: zones.map((z) => z.frame),
  }
}

/**
 * Corridor walls. At a corner, the outer wall of the corridor before it runs on to close the
 * corner and the inner wall stops short, so the next zone only appears as you turn.
 */
export function buildWalls(zones: ZoneRecord[], hw: number): Box[] {
  const walls: Box[] = []
  const { wallHeight: H, wallThickness: T } = ARCH

  const wall = (f: Frame, lat: number, from: number, to: number) => {
    if (to - from < 0.05) return
    const c = at(f, (from + to) / 2, lat, H / 2)
    walls.push({ center: c, size: [T, H, to - from], yaw: f.heading })
  }
  const cap = (f: Frame, along: number) => {
    walls.push({ center: at(f, along, 0, H / 2), size: [2 * hw + T, H, T], yaw: f.heading })
  }

  zones.forEach((z, i) => {
    if (z.shape !== 'corridor') return
    const next = zones[i + 1]
    // Entered by a turn: the zone origin is the corner centre.
    const inTurn = isTurn(z.before) ? (z.before === 'right' ? 1 : -1) : 0
    const startOf = (s: number) => (inTurn === 0 ? 0 : s === -inTurn ? -hw : hw)

    let endOf: (s: number) => number = () => z.length
    if (next && isTurn(next.before)) {
      const out = next.before === 'right' ? 1 : -1
      const corner = z.length + hw + 1
      endOf = (s) => (s === -out ? corner + hw : corner - hw)
      if (next.shape !== 'corridor') cap(z.frame, corner + hw)
    }
    for (const s of [-1, 1]) wall(z.frame, s * hw, startOf(s), endOf(s))
  })
  return walls
}

/** Free floor of each zone: its path and exhibits, plus the corner square when it turns on. */
function zoneClears(zones: ZoneRecord[], hw: number): ClearRect[] {
  return zones.map((z, i) => {
    const next = zones[i + 1]
    const from = isTurn(z.before) ? -hw - 0.5 : -0.5
    const to = z.length + (next && isTurn(next.before) ? 2 * hw + 1.5 : 0.5)
    const half = z.shape === 'corridor' ? hw + 0.3 : z.span
    return { frame: z.frame, from, to, half }
  })
}

/**
 * Raised floors: consecutive zones above ground that continue straight on share one slab
 * (from the top of the stairs to past the last of them). Starting any earlier would put the
 * slab's front edge in the middle of the stairs.
 */
function mezzanines(zones: ZoneRecord[], hw: number): Mezzanine[] {
  const out: Mezzanine[] = []
  zones.forEach((z) => {
    if (z.frame.level <= 0) return
    const half = (z.shape === 'corridor' ? hw + 0.5 : z.span) + ARCH.mezzanineMargin
    const last = out[out.length - 1]
    if (last && z.before === 'straight' && last.frame.level === z.frame.level && last.frame.heading === z.frame.heading) {
      // continue the previous slab: express this zone's end in the slab's frame
      const fw = forward(last.frame.heading)
      const offset = (z.frame.origin[0] - last.frame.origin[0]) * fw[0] + (z.frame.origin[2] - last.frame.origin[2]) * fw[2]
      last.to = Math.max(last.to, offset + z.length + 2.5)
      last.half = Math.max(last.half, half)
      return
    }
    out.push({ frame: z.frame, from: -0.5, to: z.length + 2.5, half })
  })
  return out
}
