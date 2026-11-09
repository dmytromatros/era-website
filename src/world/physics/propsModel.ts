/**
 * Things you can push (docs/wow-plan.md, task C2) — the pure part: where balls and box stacks
 * stand, what they are made of, and the static world they bump into. No three.js, no Rapier;
 * tested in propsModel.test.ts. The simulation runs in a worker (physics.worker.ts).
 *
 * Placement (Dima, 2026-11-09: "beside the cards"): seeded per page, by an exhibit's foot and seen
 * from its stop. A stop frames its exhibit edge to edge, so the floor in view is the strip at the
 * exhibit's base, under the floating elements — props stand there, near the stand's legs, lower
 * than the elements (never covering them), never on the camera's line, never where a character
 * stands. Static things stay off the clear floor (CLAUDE.md rule 15);
 * these props may stand on it because they move: the camera pushes aside whatever is in its way.
 */
import { seeded } from '@/lib/random'
import { ENTRANCE_GEOMETRY, type StationLayout, type Vec3, type WorldLayout } from '../layout'
import { toWorld } from '../exhibitModel'
import type { Office, Prim } from '../officeModel'

export type PropKind = 'ball' | 'stack'

export interface PropSpot {
  kind: PropKind
  /** Floor point. */
  at: Vec3
  yaw: number
  /** The stop it is seen from. */
  station: number
  /** Free height above it (under the exhibit's elements, or open). */
  headroom: number
}

/** What placement needs to know about each stop's exhibit (by station index). */
export interface StopExhibit {
  /** Exhibit width (0: no exhibit there). */
  width: number
  /** Bottom of its elements above the floor: a prop under them stays lower. */
  elevation: number
  /** Floor points where its characters stand (world). */
  helpers: Vec3[]
}

export const PROPS = {
  maxBalls: 4,
  maxStacks: 3,
  /** Share of the possible props (maxBalls + maxStacks) a page gets, spread evenly over its stops. */
  perStop: 0.8,
  /** Room a prop needs on the floor (radius), and between props. */
  room: 0.45,
  spacing: 2.6,
  /** Keep this far (horizontally) from the camera's path and from characters. */
  fromRail: 1.3,
  fromHelper: 0.9,
  /** Seen from the stop: within this distance, and inside this part of the picture's width. */
  minView: 2.2,
  maxView: 16,
  viewFill: 0.85,
  ballRadius: 0.17,
} as const

/** Half the horizontal field of view for a screen shape (radians). */
export const halfHfov = (aspect: number) =>
  Math.atan(Math.tan(((ENTRANCE_GEOMETRY.fov / 2) * Math.PI) / 180) * aspect)

/**
 * Is a point (`y` above its floor) in the picture from a stop: close enough, inside most of the
 * width, and above the bottom edge?
 */
export function seenFrom(st: StationLayout, x: number, z: number, aspect: number, y = 0.2): boolean {
  const dx = x - st.viewpoint[0]
  const dz = z - st.viewpoint[2]
  const d = Math.hypot(dx, dz)
  if (d < PROPS.minView || d > PROPS.maxView) return false
  const vx = st.focus[0] - st.viewpoint[0]
  const vz = st.focus[2] - st.viewpoint[2]
  const vl = Math.hypot(vx, vz) || 1
  const side = Math.acos(Math.max(-1, Math.min(1, (dx * vx + dz * vz) / (d * vl))))
  if (side > halfHfov(aspect) * PROPS.viewFill) return false
  // below the view axis by no more than most of half the vertical field of view
  const axisPitch = Math.atan2(st.focus[1] - st.viewpoint[1], vl)
  const pitch = Math.atan2(y - st.viewpoint[1], d)
  return axisPitch - pitch < (((ENTRANCE_GEOMETRY.fov / 2) * Math.PI) / 180) * PROPS.viewFill
}

/** Signed distance of a floor point across an exhibit (its local x). */
export function across(p: Vec3, st: StationLayout): number {
  const dx = p[0] - st.anchor[0]
  const dz = p[2] - st.anchor[2]
  return dx * Math.cos(st.yaw) - dz * Math.sin(st.yaw)
}

/** Horizontal distance from a point to the camera's path (rail polyline). */
export function distanceToRail(rail: Vec3[], x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i + 1 < rail.length; i++) {
    const [ax, , az] = rail[i]!
    const [bx, , bz] = rail[i + 1]!
    const lx = bx - ax
    const lz = bz - az
    const l2 = lx * lx + lz * lz || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / l2))
    best = Math.min(best, Math.hypot(x - (ax + lx * t), z - (az + lz * t)))
  }
  return best
}

/** Inside a ground-level stretch of the route, away from its edges (partitions), stairs and mezzanine ground. */
function onRouteFloor(layout: WorldLayout, x: number, z: number, r: number): boolean {
  const { clear, stairs, mezzanines } = layout.architecture
  const local = (f: { origin: Vec3; heading: number }) => {
    const dx = x - f.origin[0]
    const dz = z - f.origin[2]
    return {
      along: dx * Math.sin(f.heading) - dz * Math.cos(f.heading),
      across: dx * Math.cos(f.heading) + dz * Math.sin(f.heading),
    }
  }
  const inside = clear.some((c) => {
    if (c.frame.level > 0) return false
    const p = local(c.frame)
    return p.along > c.from + r && p.along < c.to - r && Math.abs(p.across) < c.half - r - 0.25
  })
  if (!inside) return false
  if (stairs.some((s) => Math.hypot(s.center[0] - x, s.center[2] - z) < Math.max(s.size[0], s.size[2]) / 2 + r + 0.6)) return false
  return mezzanines.every((m) => {
    const p = local(m.frame)
    return !(p.along > m.from - r - 0.5 && p.along < m.to + r + 0.5 && Math.abs(p.across) < m.half + r + 0.5)
  })
}

/**
 * @param exhibits  per station: its exhibit width and where its characters stand
 * @param skipStops stops that never get a prop (the entrance: the hero is the only thing that
 *                  moves there; the portal hall)
 * @param aspect    screen width / height (what "seen from the stop" means)
 */
export function placeProps(
  layout: WorldLayout,
  office: Office,
  exhibits: StopExhibit[],
  seed: number,
  skipStops: number[],
  aspect: number,
): PropSpot[] {
  const rand = seeded(seed * 7919 + 13)
  const helpers = exhibits.flatMap((e) => e.helpers)
  const spots: PropSpot[] = []
  let balls = 0
  let stacks = 0
  let nextKind: PropKind = rand() < 0.5 ? 'ball' : 'stack'

  const fits = (p: Vec3, st: number) =>
    onRouteFloor(layout, p[0], p[2], PROPS.room) &&
    distanceToRail(layout.rail, p[0], p[2]) > PROPS.fromRail &&
    helpers.every((h) => Math.hypot(h[0] - p[0], h[2] - p[2]) > PROPS.fromHelper) &&
    // not inside another exhibit
    layout.stations.every(
      (o, j) => j === st || Math.hypot(o.anchor[0] - p[0], o.anchor[2] - p[2]) > (exhibits[j]?.width ?? 0) / 2 + PROPS.room + 0.3,
    ) &&
    office.footprints.every((f) => Math.hypot(f.x - p[0], f.z - p[2]) > f.r + PROPS.room + 0.2) &&
    seenFrom(layout.stations[st]!, p[0], p[2], aspect)

  // Options per stop first, then stops spread evenly over the page (not all at its start).
  const eligible: { i: number; options: Vec3[] }[] = []
  layout.stations.forEach((st, i) => {
    const ex = exhibits[i]
    if (!ex || ex.width <= 0 || skipStops.includes(i) || st.anchor[1] > 0.01) return
    // At the exhibit's foot, towards its edges (its local frame: +x across, +z towards the camera).
    const options: Vec3[] = []
    for (const side of [-1, 1]) {
      for (const out of [-0.5, -0.15, 0.25, 0.65]) {
        for (const fwd of [0.35, 0.8, 1.25]) {
          const p = toWorld([side * (ex.width / 2 + out), 0, fwd], st.anchor, st.yaw)
          if (fits(p, i)) options.push(p)
        }
      }
    }
    if (options.length) eligible.push({ i, options })
  })
  const want = Math.min(eligible.length, Math.round((PROPS.maxBalls + PROPS.maxStacks) * PROPS.perStop))
  const picked = new Set<number>()
  for (let n = 0; n < want; n++) picked.add(Math.min(eligible.length - 1, Math.floor(((n + 0.5) * eligible.length) / want)))

  eligible.forEach(({ i, options }, e) => {
    if (!picked.has(e)) return
    const st = layout.stations[i]!
    const ex = exhibits[i]!
    // spacing to props placed so far
    const free = options.filter((p) => spots.every((s) => Math.hypot(s.at[0] - p[0], s.at[2] - p[2]) > PROPS.spacing))
    if (!free.length) return
    let kind = nextKind
    if (kind === 'ball' && balls >= PROPS.maxBalls) kind = 'stack'
    if (kind === 'stack' && stacks >= PROPS.maxStacks) kind = 'ball'
    if ((kind === 'ball' && balls >= PROPS.maxBalls) || (kind === 'stack' && stacks >= PROPS.maxStacks)) return
    const at = free[Math.floor(rand() * free.length)]!
    const under = Math.abs(across(at, st)) < ex.width / 2 + 0.3
    spots.push({ kind, at, yaw: rand() * Math.PI * 2, station: i, headroom: under ? ex.elevation : 3 })
    if (kind === 'ball') balls++
    else stacks++
    nextKind = kind === 'ball' ? 'stack' : 'ball'
  })
  return spots
}

/* ------------------------------------------------------------------ bodies */

export interface PropBody {
  kind: 'ball' | 'box'
  /** Ball: [r, r, r]; box: half extents. */
  half: Vec3
  /** Centre at rest, and yaw. */
  pos: Vec3
  yaw: number
  /** Colour variant (index into the theme's prop palette). */
  tone: number
  /** The prop (spot) it belongs to. */
  prop: number
}

/** A ball, or a small pyramid of cardboard boxes (2 + 1, sometimes 3 + 2 + 1). */
export function propBodies(spots: PropSpot[], seed: number): PropBody[] {
  const rand = seeded(seed * 104729 + 7)
  const bodies: PropBody[] = []
  spots.forEach((spot, prop) => {
    const [x, y, z] = spot.at
    if (spot.kind === 'ball') {
      const r = PROPS.ballRadius
      bodies.push({ kind: 'ball', half: [r, r, r], pos: [x, y + r, z], yaw: 0, tone: Math.floor(rand() * 4), prop })
      return
    }
    const c = Math.cos(spot.yaw)
    const s = Math.sin(spot.yaw)
    // Two rows fit under floating elements (≥ 0.75 m up); a third only where there is room.
    const rows = rand() < 0.4 && spot.headroom > 1.1 ? [3, 2, 1] : [2, 1]
    let height = y
    rows.forEach((n, row) => {
      const h = 0.15 + rand() * 0.03
      for (let i = 0; i < n; i++) {
        const along = (i - (n - 1) / 2) * 0.5 + (rand() - 0.5) * 0.02
        const half: Vec3 = [0.21 + rand() * 0.02, h, 0.19 + rand() * 0.03]
        bodies.push({
          kind: 'box',
          half,
          // +0.002: a hair of air, so the solver does not start with boxes pushed into each other
          pos: [x + along * c, height + h + 0.002, z - along * s],
          // a slight twist each, small enough that neighbours never start inside each other
          yaw: spot.yaw + (rand() - 0.5) * 0.08,
          tone: (row + i) % 3,
          prop,
        })
      }
      height += h * 2 + 0.004
    })
  })
  return bodies
}

/* ------------------------------------------------------------------ static world */

/** A fixed collider. Boxes: half extents; cylinders: [radius, half height, radius]; balls: [r, r, r]. */
export interface StaticShape {
  shape: 'box' | 'cyl' | 'ball'
  pos: Vec3
  half: Vec3
  /** Rotation around y, three.js convention. */
  yaw: number
}

/** Office pieces this close (horizontally) to a prop are colliders; the rest of the office is not. */
export const COLLIDE_RADIUS = 9

/**
 * The static world near the props: office primitives, glass, window panes, plus the exhibits and
 * characters passed in (`extra`). Far things are left out — the simulation stays tiny.
 */
export function staticShapes(office: Office, spots: PropSpot[], extra: StaticShape[]): StaticShape[] {
  const near = (p: Vec3) => spots.some((s) => Math.hypot(s.at[0] - p[0], s.at[2] - p[2]) < COLLIDE_RADIUS)
  const fromPrim = (p: Prim): StaticShape =>
    p.shape === 'box'
      ? { shape: 'box', pos: p.center, half: [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2], yaw: p.yaw }
      : p.shape === 'cyl'
        ? { shape: 'cyl', pos: p.center, half: [p.size[0] / 2, p.size[1] / 2, p.size[0] / 2], yaw: 0 }
        : { shape: 'ball', pos: p.center, half: [p.size[0] / 2, p.size[0] / 2, p.size[0] / 2], yaw: 0 }
  // Layout boxes (glass, windows) carry a route heading: three.js yaw is its negative.
  const fromBox = (b: { center: Vec3; size: Vec3; yaw: number }): StaticShape => ({
    shape: 'box',
    pos: b.center,
    half: [b.size[0] / 2, b.size[1] / 2, b.size[2] / 2],
    yaw: -b.yaw,
  })
  return [
    ...office.solid.filter((p) => near(p.center)).map(fromPrim),
    // Chairs stand as their seats at rest (a ball does not stop a spinning chair).
    ...office.chairs.flatMap((c) => c.prims).filter((p) => near(p.center)).map(fromPrim),
    ...[...office.glass, ...office.frosted, ...office.windows].filter((b) => near(b.center)).map(fromBox),
    ...extra.filter((e) => near(e.pos)),
  ]
}
