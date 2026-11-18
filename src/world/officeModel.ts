/**
 * The office the route runs through: a light, Scandinavian open-plan floor. Built from the route
 * layout (pure, seeded — same office on every visit; unit-tested):
 *
 * - shell: ceiling with light panels, columns on a grid, a perimeter of tall windows;
 * - corridor sides become glass partitions (frosted band low, clear glass above);
 * - stairs lead to a mezzanine on pillars with a glass railing;
 * - furniture (desk clusters, plants, shelves, sofas) fills free floor beside the path;
 * - a coffee corner or two (E2a): where the office's people meet (world/crowd);
 * - a stand-up meeting corner (E2b): a high table and a whiteboard with a chart;
 * - an arcade machine (E3): in plain view of a stop, its screen facing it;
 * - a big monitor on a standing desk (E5) showing the 2D landing: the same kind of spot.
 *
 * Everything is made of primitives (boxes, cylinders, balls) in a few materials, so the renderer
 * can draw all of it with a handful of instanced meshes. Nothing may stand on `clear` floor.
 */
import { seeded } from '@/lib/random'
import { ENTRANCE_GEOMETRY, forward, right, type Box, type ClearRect, type Frame, type Vec3, type WorldLayout } from './layout'

export type Mat =
  | 'wall'
  | 'wood'
  | 'woodDark'
  | 'frame'
  | 'metal'
  | 'fabricA'
  | 'fabricB'
  | 'plant'
  | 'plantDark'
  | 'pot'
  | 'screen'
  | 'bookA'
  | 'bookB'
  | 'bookC'

/** A solid primitive. `size` = box extents, or [diameter, height, diameter] for cyl / ball. */
export interface Prim {
  shape: 'box' | 'cyl' | 'ball'
  center: Vec3
  size: Vec3
  yaw: number
  mat: Mat
  /** Part of a swivel chair seat: the floor point of its stem (C2: it spins around it). */
  pivot?: Vec3
}

/** A swivel chair whose seat and back spin around the stem (C2). Prims in world space. */
export interface Chair {
  pivot: Vec3
  prims: Prim[]
}

/** A coffee corner (E2a): the machine's spout, and where two people stand to chat. */
export interface CoffeeCorner {
  /** Floor point under the counter's centre and the yaw its front faces (three.js yaw). */
  at: Vec3
  yaw: number
  /** Top of the machine (the steam bursts from there). */
  steam: Vec3
  /** Where two people stand, facing each other across the corner (yaw = their facing). */
  spots: { at: Vec3; yaw: number }[]
}

/** A stand-up meeting corner (E2b): a high table, a whiteboard with a bar chart, four places. */
export interface MeetingCorner {
  at: Vec3
  yaw: number
  /** The chart's bars on the board (world): bottom centre, size [w, h, d], colour key. */
  bars: { base: Vec3; size: Vec3; color: 'accentA' | 'accentB' | 'accentC' }[]
  /** Where the presenter stands (beside the board) and the three around the table. */
  presenter: { at: Vec3; yaw: number }
  attendees: { at: Vec3; yaw: number }[]
  /** The board's yaw (its face looks along it). */
  boardYaw: number
}

/** A sofa (lounge, E2b): its seat's top centre and yaw (the seat runs along its local x). */
export interface Sofa {
  seat: Vec3
  yaw: number
}

/**
 * An arcade machine (E3): the cabinet's floor point and yaw (front = the way it faces), its screen
 * (a canvas texture drawn by world/arcade), where someone may stand and play, and the stop that
 * sees it best (the camera flies from the rail into the screen).
 */
export interface ArcadeCabinet {
  at: Vec3
  yaw: number
  screen: {
    /** Centre of the screen's face (world) and its size [width, height] (m). */
    center: Vec3
    size: [number, number]
    /** The way the screen faces (unit, on the floor plane). */
    normal: [number, number]
  }
  /** Where someone plays it; `aside`: where they step to while the guest has it (out of the camera's way). */
  player: { at: Vec3; yaw: number; aside: Vec3; asideYaw: number }
  /** Index of the stop that sees it best, and from how far (m). */
  station: number
  seen: number
}

/**
 * A big monitor on a standing desk (E5): its screen shows the 2D landing (world/monitor); the
 * camera flies from the rail into it and the visitor is back at the top of the 2D page.
 */
export interface MonitorDesk {
  at: Vec3
  yaw: number
  screen: ArcadeCabinet['screen']
  /** Index of the stop that sees it best, and from how far (m). */
  station: number
  seen: number
  /** The portal hall's stop it stands by (E5). */
  hall?: number
}

export interface Office {
  solid: Prim[]
  glass: Box[]
  frosted: Box[]
  /** Ceiling light panels (drawn unlit, bright). */
  lights: Box[]
  /** Window panes (drawn unlit, bright). */
  windows: Box[]
  ceiling: { center: Vec3; size: [number, number] }
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  /** Footprints of placed furniture and columns (for tests and future collision / WASD). */
  footprints: { x: number; z: number; r: number; kind: 'furniture' | 'column' }[]
  /** Floor that must stay free: the route's clear floor plus the ground under mezzanines. */
  keepOff: ClearRect[]
  /** Swivel chairs (their seats are not in `solid`). */
  chairs: Chair[]
  /** Coffee corners (E2a), 0–2. */
  coffee: CoffeeCorner[]
  /** A stand-up meeting corner (E2b), 0–1. */
  meeting: MeetingCorner[]
  /** Every sofa (E2b: someone may sleep on one). */
  sofas: Sofa[]
  /** The arcade machine (E3), 0–1. */
  arcade: ArcadeCabinet[]
  /** The monitor showing the landing (E5), 0–1. */
  monitor: MonitorDesk[]
}

export const OFFICE = {
  ceilingY: 7.2,
  /** Free floor between the route and the outer windows. */
  margin: 10,
  columnGrid: 9,
  lightGrid: 4.5,
  windowBay: 3,
  sill: 0.9,
  head: 6.4,
}

/* ------------------------------------------------------------------ geometry helpers */

/** Point `along`/`across` in a frame, at height `up` above its floor. */
function inFrame(f: Frame, along: number, across: number, up = 0): Vec3 {
  const fw = forward(f.heading)
  const rt = right(f.heading)
  return [f.origin[0] + fw[0] * along + rt[0] * across, f.level + up, f.origin[2] + fw[2] * along + rt[2] * across]
}

/** Is a circle of radius `r` around (x, z) on any clear floor? */
export function blocked(x: number, z: number, r: number, clear: ClearRect[]): boolean {
  return clear.some((c) => {
    const fw = forward(c.frame.heading)
    const rt = right(c.frame.heading)
    const dx = x - c.frame.origin[0]
    const dz = z - c.frame.origin[2]
    const along = dx * fw[0] + dz * fw[2]
    const across = dx * rt[0] + dz * rt[2]
    return along >= c.from - r && along <= c.to + r && Math.abs(across) <= c.half + r
  })
}

/** Does the floor segment a → b cross a (thin, upright) layout box, seen from above? */
export function crosses(a: Vec3, b: Vec3, box: Box): boolean {
  // Into the box's own frame (its mesh turns by −yaw, officeModel's Boxes).
  const t = -box.yaw
  const c = Math.cos(t)
  const s = Math.sin(t)
  const local = (p: Vec3) => {
    const dx = p[0] - box.center[0]
    const dz = p[2] - box.center[2]
    return [c * dx - s * dz, s * dx + c * dz] as const
  }
  const [ax, az] = local(a)
  const [bx, bz] = local(b)
  const hx = box.size[0] / 2
  const hz = box.size[2] / 2
  // Liang–Barsky against the box's footprint.
  let t0 = 0
  let t1 = 1
  const dx = bx - ax
  const dz = bz - az
  for (const [p, q] of [
    [-dx, ax + hx],
    [dx, hx - ax],
    [-dz, az + hz],
    [dz, hz - az],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const r = q / p
    if (p < 0) t0 = Math.max(t0, r)
    else t1 = Math.min(t1, r)
    if (t0 > t1) return false
  }
  return true
}

/** Does the floor segment a → b pass through circle `c` (not counting its last metre at b)? */
function lineHits(a: Vec3, b: Vec3, c: { x: number; z: number; r: number }): boolean {
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return false
  const t = ((c.x - a[0]) * dx + (c.z - a[2]) * dz) / (len * len)
  if (t <= 0 || t * len >= len - 1) return false
  return Math.hypot(a[0] + dx * t - c.x, a[2] + dz * t - c.z) < c.r * 0.8
}

/**
 * How close a stop sees floor point `p` from (m): it must be within the camera's view at that
 * stop (±35° around where it looks). Behind a frosted glass band it counts as twice as far:
 * seen, but paler (excluding it emptied every glass corridor — Dima 2026-11-16: "behind the
 * glass there is almost nobody"). ∞ = no stop sees it.
 */
export function seenFrom(
  p: Vec3,
  stations: WorldLayout['stations'],
  frosted: Box[],
  /** If given, furniture in the way hides it from that stop (a circle the line passes through). */
  blockers?: { x: number; z: number; r: number }[],
): number {
  let best = Infinity
  for (const st of stations) {
    const lx = st.focus[0] - st.viewpoint[0]
    const lz = st.focus[2] - st.viewpoint[2]
    const px = p[0] - st.viewpoint[0]
    const pz = p[2] - st.viewpoint[2]
    const d = Math.hypot(px, pz)
    if (d <= 0 || d >= best || (lx * px + lz * pz) / (Math.hypot(lx, lz) * d) <= Math.cos(0.6)) continue
    if (blockers?.some((b) => lineHits(st.viewpoint, p, b))) continue
    best = Math.min(best, frosted.some((f) => crosses(st.viewpoint, p, f)) ? d * 2 : d)
  }
  return best
}

/**
 * Where the camera looks at the arcade's screen from (E3): straight in front, at the distance where
 * the whole screen fits the frame with ARCADE_CAB.margin round it (`aspect` = width / height).
 */
export function arcadeEye(center: Vec3, normal: [number, number], aspect: number): Vec3 {
  const t = Math.tan((ENTRANCE_GEOMETRY.fov * Math.PI) / 360)
  const [w, h] = ARCADE_CAB.screen.size
  const d = Math.max(h / 2 / t, w / 2 / (t * aspect)) * ARCADE_CAB.margin
  return [center[0] + normal[0] * d, center[1], center[2] + normal[1] * d]
}

/**
 * Where the camera ends its flight into the monitor (E5): straight in front, so close that the
 * screen covers the whole frame (a hair more than edge to edge, MONITOR_DESK.margin) — the frame
 * then shows nothing but the landing drawn on it, the moment the page swaps to the real one.
 */
export function monitorEye(center: Vec3, normal: [number, number], aspect: number): Vec3 {
  const t = Math.tan((ENTRANCE_GEOMETRY.fov * Math.PI) / 360)
  const [w, h] = MONITOR_DESK.screen.size
  const d = Math.min(h / 2 / t, w / 2 / (t * aspect)) * MONITOR_DESK.margin
  return [center[0] + normal[0] * d, center[1], center[2] + normal[1] * d]
}

/** Distance from (x, z) to the floor segment a → b. */
function segmentDistance(x: number, z: number, a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const len2 = dx * dx + dz * dz
  const t = len2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / len2)) : 0
  return Math.hypot(a[0] + dx * t - x, a[2] + dz * t - z)
}

/** A point in a prop's local space (+z = its front) in the world. */
function placePoint(v: Vec3, at: Vec3, yaw: number): Vec3 {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [at[0] + v[0] * c + v[2] * s, at[1] + v[1], at[2] - v[0] * s + v[2] * c]
}

function place(local: Prim[], at: Vec3, yaw: number): Prim[] {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const move = (v: Vec3): Vec3 => [at[0] + v[0] * c + v[2] * s, at[1] + v[1], at[2] - v[0] * s + v[2] * c]
  return local.map((p) => ({ ...p, center: move(p.center), yaw: p.yaw + yaw, ...(p.pivot ? { pivot: move(p.pivot) } : {}) }))
}

const box = (center: Vec3, size: Vec3, mat: Mat, yaw = 0): Prim => ({ shape: 'box', center, size, yaw, mat })
const cyl = (center: Vec3, d: number, h: number, mat: Mat): Prim => ({ shape: 'cyl', center, size: [d, h, d], yaw: 0, mat })
const ball = (center: Vec3, d: number, mat: Mat): Prim => ({ shape: 'ball', center, size: [d, d, d], yaw: 0, mat })

/* ------------------------------------------------------------------ props (local space) */

function desk(x: number, z: number, facing: 1 | -1): Prim[] {
  const f = facing // chair side
  return [
    box([x, 0.74, z], [1.4, 0.04, 0.72], 'wood'),
    box([x - 0.66, 0.36, z], [0.04, 0.72, 0.66], 'metal'),
    box([x + 0.66, 0.36, z], [0.04, 0.72, 0.66], 'metal'),
    box([x, 1.0, z - f * 0.22], [0.56, 0.34, 0.03], 'screen'),
    box([x, 0.82, z - f * 0.24], [0.05, 0.14, 0.05], 'metal'),
    // chair: seat and back swivel on the stem (C2)
    { ...box([x, 0.46, z + f * 0.62], [0.48, 0.08, 0.46], 'fabricA'), pivot: [x, 0, z + f * 0.62] },
    { ...box([x, 0.78, z + f * 0.84], [0.48, 0.52, 0.06], 'fabricA'), pivot: [x, 0, z + f * 0.62] },
    cyl([x, 0.21, z + f * 0.62], 0.08, 0.42, 'metal'),
  ]
}

/** Four desks facing each other in pairs, with a soft divider. Footprint ≈ 3 × 3.2. */
function deskCluster(): Prim[] {
  return [
    ...desk(-0.72, -0.38, -1),
    ...desk(0.72, -0.38, -1),
    ...desk(-0.72, 0.38, 1),
    ...desk(0.72, 0.38, 1),
    box([0, 0.98, 0], [2.9, 0.36, 0.04], 'fabricB'),
  ]
}

function plant(tall: boolean): Prim[] {
  const h = tall ? 1.5 : 1
  return [
    cyl([0, 0.22, 0], 0.46, 0.44, 'pot'),
    cyl([0, 0.44 + h * 0.3, 0], 0.05, h * 0.6, 'woodDark'),
    ball([0, 0.44 + h * 0.62, 0], 0.62, 'plant'),
    ball([0.18, 0.44 + h * 0.85, 0.08], 0.48, 'plantDark'),
    ball([-0.16, 0.44 + h * 0.9, -0.1], 0.44, 'plant'),
  ]
}

function shelf(seed: number): Prim[] {
  const rand = seeded(seed)
  const books: Prim[] = []
  const mats: Mat[] = ['bookA', 'bookB', 'bookC', 'woodDark']
  for (const y of [0.42, 0.98, 1.54]) {
    let x = -0.55
    while (x < 0.5) {
      const w = 0.05 + rand() * 0.06
      const h = 0.26 + rand() * 0.14
      if (rand() > 0.2) books.push(box([x + w / 2, y + h / 2, 0], [w, h, 0.26], mats[Math.floor(rand() * mats.length)]!))
      x += w + 0.01
    }
  }
  return [
    box([-0.62, 0.95, 0], [0.04, 1.9, 0.36], 'wood'),
    box([0.62, 0.95, 0], [0.04, 1.9, 0.36], 'wood'),
    ...[0.02, 0.4, 0.96, 1.52, 1.88].map((y) => box([0, y, 0], [1.24, 0.03, 0.36], 'wood')),
    ...books,
  ]
}

/** Counter with a coffee machine and two cups. Footprint ≈ 1.4 × 0.7; front = +z. */
function coffeeCounter(): Prim[] {
  return [
    box([0, 0.45, 0], [1.3, 0.9, 0.6], 'wood'),
    box([0, 0.92, 0], [1.36, 0.04, 0.66], 'woodDark'),
    box([-0.28, 1.17, -0.05], [0.36, 0.46, 0.34], 'metal'),
    box([-0.28, 1.25, 0.125], [0.24, 0.12, 0.01], 'frame'),
    box([-0.28, 1.0, 0.1], [0.06, 0.07, 0.06], 'frame'),
    cyl([0.22, 0.99, 0.08], 0.08, 0.1, 'wall'),
    cyl([0.38, 0.99, -0.1], 0.08, 0.1, 'wall'),
  ]
}
/** Where the two people chat, in the counter's space: in front of it, facing each other. */
const COFFEE_SPOTS: { at: Vec3; yaw: number }[] = [
  { at: [-0.5, 0, 1.45], yaw: Math.PI / 2 - 0.35 },
  { at: [0.5, 0, 1.45], yaw: -Math.PI / 2 + 0.35 },
]
const COFFEE_STEAM: Vec3 = [-0.28, 1.42, -0.05]

/**
 * A stand-up meeting corner (E2b), front = +z: a high table, and behind it a whiteboard on legs
 * facing the table. The chart on the board is drawn by the crowd (its bars fall off).
 */
function meetingCorner(): Prim[] {
  return [
    box([0, 1.0, 0], [1.3, 0.04, 0.7], 'wood'),
    box([-0.55, 0.5, 0], [0.05, 1.0, 0.05], 'metal'),
    box([0.55, 0.5, 0], [0.05, 1.0, 0.05], 'metal'),
    box([0, 0.06, 0], [1.2, 0.04, 0.06], 'metal'),
    // whiteboard: white panel in a dark frame, on two legs
    box([0, 1.5, -1.25], [1.7, 1.05, 0.03], 'wall'),
    box([0, 2.04, -1.25], [1.76, 0.04, 0.05], 'frame'),
    box([0, 0.96, -1.25], [1.76, 0.04, 0.05], 'frame'),
    box([-0.86, 1.05, -1.25], [0.04, 2.1, 0.05], 'frame'),
    box([0.86, 1.05, -1.25], [0.04, 2.1, 0.05], 'frame'),
    box([-0.86, 0.02, -1.25], [0.06, 0.04, 0.5], 'metal'),
    box([0.86, 0.02, -1.25], [0.06, 0.04, 0.5], 'metal'),
  ]
}
const MEETING = {
  bars: [
    { x: -0.45, h: 0.28, color: 'accentA' },
    { x: -0.12, h: 0.44, color: 'accentB' },
    { x: 0.21, h: 0.66, color: 'accentC' },
  ] as const,
  barBase: 1.1,
  boardZ: -1.25 + 0.03,
  presenter: { at: [1.2, 0, -0.95] as Vec3, yaw: -0.5 },
  attendees: [
    { at: [-1.05, 0, 0.15] as Vec3, yaw: Math.PI * 0.8 },
    { at: [1.05, 0, 0.3] as Vec3, yaw: -Math.PI * 0.85 },
    { at: [-0.35, 0, 0.95] as Vec3, yaw: Math.PI },
  ],
}

/**
 * The arcade machine (E3), front = +z: a cabinet in the page's accent (fabricA) with a dark screen
 * housing, a control panel for two players (a joystick and two buttons each). The screen itself is a canvas
 * texture in front of the housing (ARCADE_CAB.screen); the lit marquee on top goes with the
 * ceiling lights (unlit, bright). Footprint ≈ 0.8 × 0.7.
 */
function arcadeCabinet(): Prim[] {
  return [
    box([0, 0.47, -0.02], [0.7, 0.94, 0.6], 'fabricA'),
    box([0, 0.45, 0.285], [0.24, 0.3, 0.02], 'frame'),
    box([-0.05, 0.52, 0.298], [0.03, 0.07, 0.01], 'metal'),
    box([0.05, 0.52, 0.298], [0.03, 0.07, 0.01], 'metal'),
    box([0, 0.98, 0.16], [0.74, 0.09, 0.36], 'frame'),
    cyl([-0.26, 1.07, 0.2], 0.025, 0.1, 'metal'),
    ball([-0.26, 1.13, 0.2], 0.065, 'bookA'),
    cyl([-0.13, 1.035, 0.22], 0.055, 0.025, 'bookB'),
    cyl([-0.05, 1.035, 0.2], 0.055, 0.025, 'bookC'),
    cyl([0.1, 1.07, 0.2], 0.025, 0.1, 'metal'),
    ball([0.1, 1.13, 0.2], 0.065, 'bookB'),
    cyl([0.23, 1.035, 0.22], 0.055, 0.025, 'bookA'),
    cyl([0.31, 1.035, 0.2], 0.055, 0.025, 'bookC'),
    box([0, 1.4, -0.06], [0.7, 0.84, 0.56], 'frame'),
    box([-0.37, 0.98, -0.02], [0.04, 1.96, 0.66], 'fabricA'),
    box([0.37, 0.98, -0.02], [0.04, 1.96, 0.66], 'fabricA'),
    box([0, 1.975, -0.02], [0.78, 0.03, 0.66], 'frame'),
  ]
}
/** Where the arcade's parts are in its own space (front +z). */
export const ARCADE_CAB = {
  /** The screen: 2 cm in front of the housing's face (z 0.22), 4 : 3. */
  screen: { center: [0, 1.4, 0.24] as Vec3, size: [0.56, 0.42] as [number, number] },
  marquee: { center: [0, 1.88, 0.02] as Vec3, size: [0.7, 0.16, 0.5] as Vec3 },
  /**
   * The player stands square at player 1's controls, the left half of the panel (Dima 2026-11-18:
   * standing off to the side, turned in, looked crooked). So that the stop still sees the screen
   * past them, the cabinet is turned away from the stop by `turn` (rad), the stop on its right:
   * the player is off the line of sight.
   */
  player: { at: [-0.3, 0, 0.7] as Vec3, yaw: Math.PI },
  turn: -0.75,
  /**
   * Where the player steps to while the guest has the machine: out of the camera's way (it flies
   * in on the middle, ≈ 0.7 m out, from the stop's side), to the left, turned to the screen.
   */
  aside: { at: [-0.95, 0, 0.42] as Vec3, yaw: Math.PI + 0.85 },
  /** Free floor it needs: a circle this big around this point. */
  footprint: { at: [0, 0, 0.2] as Vec3, r: 0.75 },
  /** Seen from a stop this near … far (m): a smaller screen would not read, a nearer one crowds the frame. */
  view: [3.5, 12] as const,
  /** Within this share of the frame's half-width around where the stop looks: seen, not at the very edge. */
  cone: 0.7,
  /** The coffee corners and the meeting stay this far away (m). */
  apart: 6.5,
  /**
   * Flying in, the screen fills the frame with this much of the cabinet round it (1 = edge to
   * edge): room for the header above and the way-out button below, outside the screen.
   */
  margin: 1.24,
}

/**
 * The monitor (E5), front = +z: a standing desk with a big display on a stand, a keyboard, a mug
 * and a sticky note on the bezel. The screen itself is a canvas texture 2 cm in front of the
 * bezel (MONITOR_DESK.screen), drawn by world/monitor. Footprint ≈ 1.5 × 0.7.
 */
function monitorDesk(): Prim[] {
  return [
    box([0, 1.02, 0], [1.5, 0.05, 0.7], 'wood'),
    box([-0.68, 0.5, 0], [0.06, 1.0, 0.6], 'metal'),
    box([0.68, 0.5, 0], [0.06, 1.0, 0.6], 'metal'),
    box([0, 0.3, -0.25], [1.3, 0.05, 0.05], 'metal'),
    box([0, 1.055, -0.14], [0.36, 0.02, 0.22], 'metal'),
    box([0, 1.2, -0.19], [0.07, 0.3, 0.04], 'metal'),
    box([0, 1.55, -0.12], [1.26, 0.81, 0.05], 'frame'),
    box([0, 1.55, -0.165], [0.6, 0.4, 0.04], 'frame'),
    box([0, 1.055, 0.16], [0.52, 0.02, 0.17], 'frame'),
    box([0.4, 1.06, 0.18], [0.06, 0.025, 0.1], 'frame'),
    cyl([-0.52, 1.1, 0.12], 0.09, 0.11, 'wall'),
    box([0.5, 1.87, -0.092], [0.11, 0.11, 0.006], 'bookC', 0.12),
  ]
}

/** Where the monitor's parts are in its own space (front +z). */
export const MONITOR_DESK = {
  /** The screen: 2 cm in front of the bezel's face (z −0.095), 16 : 10. */
  screen: { center: [0, 1.55, -0.075] as Vec3, size: [1.2, 0.75] as [number, number] },
  /** Turned this much from facing the stop square on (rad): seen as a thing, the screen still reads. */
  turn: 0.35,
  footprint: { at: [0, 0, 0] as Vec3, r: 0.9 },
  view: [3.5, 12] as const,
  cone: 0.7,
  /** The arcade, the coffee corners and the meeting stay this far away (m). */
  apart: 6.5,
  /** Flying in, the screen covers the frame by this much (< 1: a hair beyond edge to edge). */
  margin: 0.98,
}

function lounge(): Prim[] {
  return [
    box([0, 0.22, -0.3], [1.9, 0.44, 0.84], 'fabricB'),
    box([0, 0.62, -0.64], [1.9, 0.5, 0.18], 'fabricB'),
    box([-0.95, 0.4, -0.3], [0.18, 0.56, 0.84], 'fabricB'),
    box([0.95, 0.4, -0.3], [0.18, 0.56, 0.84], 'fabricB'),
    cyl([0, 0.2, 0.55], 0.9, 0.4, 'wood'),
    ...place(plant(false), [1.45, 0, -0.55], 0),
  ]
}

/* ------------------------------------------------------------------ the office */

/** Glass partition from a wall box: frame posts, rails, frosted band, clear glass above. */
function partition(w: Box, solid: Prim[], glass: Box[], frosted: Box[]) {
  const alongZ = w.size[2] >= w.size[0]
  const length = alongZ ? w.size[2] : w.size[0]
  const H = w.size[1]
  const base = w.center[1] - H / 2
  const dir: Vec3 = alongZ ? [Math.sin(-w.yaw), 0, Math.cos(-w.yaw)] : [Math.cos(-w.yaw), 0, -Math.sin(-w.yaw)]
  const yaw = alongZ ? w.yaw : w.yaw + Math.PI / 2
  const sized = (thick: number, height: number, len: number): Vec3 => [thick, height, len]
  const at = (along: number, y: number): Vec3 => [w.center[0] + dir[0] * along, base + y, w.center[2] + dir[2] * along]

  const posts = Math.max(1, Math.round(length / 3))
  for (let i = 0; i <= posts; i++) {
    solid.push(box(at(-length / 2 + (length * i) / posts, H / 2), sized(0.07, H, 0.07), 'frame', -yaw))
  }
  solid.push(box(at(0, 0.05), sized(0.08, 0.1, length), 'frame', -yaw))
  solid.push(box(at(0, H - 0.04), sized(0.08, 0.08, length), 'frame', -yaw))
  frosted.push({ center: at(0, 0.1 + 0.75), size: sized(0.03, 1.5, length), yaw })
  glass.push({ center: at(0, 1.6 + (H - 1.68) / 2), size: sized(0.03, H - 1.68, length), yaw })
}

/**
 * `aspect` (width / height of the screen) decides how wide the camera sees at a stop (E3);
 * `monitorAt`: where the monitor stands (E5, monitor/monitorModel.ts `monitorSpot`).
 */
export function buildOffice(
  layout: WorldLayout,
  seed = 11,
  aspect = 16 / 9,
  monitorAt?: { at: Vec3; face: Vec3; station: number; hall: number },
): Office {
  const { walls, stairs, mezzanines, clear } = layout.architecture
  const solid: Prim[] = []
  const glass: Box[] = []
  const frosted: Box[] = []
  const lights: Box[] = []
  const windows: Box[] = []
  const rand = seeded(seed)

  // ---- bounds: everything the route touches, plus a margin of office floor ----
  const pts: Vec3[] = [...layout.rail, ...layout.stations.map((s) => s.anchor)]
  for (const c of clear) {
    for (const along of [c.from, c.to]) for (const across of [-c.half, c.half]) pts.push(inFrame(c.frame, along, across))
  }
  const m = OFFICE.margin
  const bounds = {
    minX: Math.min(...pts.map((p) => p[0])) - m,
    maxX: Math.max(...pts.map((p) => p[0])) + m,
    minZ: Math.min(...pts.map((p) => p[2])) - m,
    maxZ: Math.max(...pts.map((p) => p[2])) + m,
  }
  const H = OFFICE.ceilingY

  // ---- partitions instead of walls ----
  for (const w of walls) partition(w, solid, glass, frosted)

  // ---- stairs: white blocks with a wooden tread on each step ----
  for (const s of stairs) {
    solid.push(box(s.center, s.size, 'wall', -s.yaw))
    const top = s.center[1] + s.size[1] / 2
    solid.push(box([s.center[0], top + 0.015, s.center[2]], [s.size[0], 0.03, s.size[2] * 0.98], 'wood', -s.yaw))
  }

  // ---- mezzanines: a slab on pillars with a glass railing (open towards the stairs) ----
  const mezzClear: ClearRect[] = []
  for (const mz of mezzanines) {
    const lvl = mz.frame.level
    const ground: Frame = { ...mz.frame, level: 0 }
    const len = mz.to - mz.from
    const mid = (mz.from + mz.to) / 2
    solid.push(box(inFrame(ground, mid, 0, lvl - 0.18), [mz.half * 2, 0.36, len], 'wall', -mz.frame.heading))
    solid.push(box(inFrame(ground, mid, 0, lvl + 0.01), [mz.half * 2, 0.02, len], 'wood', -mz.frame.heading))
    const n = Math.max(1, Math.round(len / 6))
    for (let i = 0; i <= n; i++) {
      for (const s of [-1, 1]) {
        solid.push(box(inFrame(ground, mz.from + (len * i) / n, s * (mz.half - 0.25), (lvl - 0.36) / 2), [0.35, lvl - 0.36, 0.35], 'wall'))
      }
    }
    const rail = (along: number, across: number, size: Vec3) => {
      glass.push({ center: inFrame(mz.frame, along, across, 0.5), size, yaw: mz.frame.heading })
      // wooden handrail: a black one draws a hard line across exhibits seen against it
      solid.push(box(inFrame(mz.frame, along, across, 1.02), [size[0] + 0.04, 0.05, size[2] + 0.04], 'wood', -mz.frame.heading))
    }
    for (const s of [-1, 1]) rail(mid, s * (mz.half - 0.05), [0.03, 1, len])
    rail(mz.to - 0.05, 0, [mz.half * 2, 1, 0.03])
    // plants in the free band near the far corners
    for (const s of [-1, 1]) solid.push(...place(plant(true), inFrame(mz.frame, mz.to - 0.8, s * (mz.half - 0.7)), 0))
    // nothing on the ground underneath
    mezzClear.push({ frame: ground, from: mz.from - 0.3, to: mz.to + 0.3, half: mz.half + 0.3 })
  }
  const keepOff = [...clear, ...mezzClear]

  // ---- furniture beside each zone's free floor ----
  const sofas: Sofa[] = []
  const placed: { x: number; z: number; r: number }[] = []
  // Lines of sight kept free (the arcade's, E3): nothing stands on them.
  const sight: [Vec3, Vec3][] = []
  const fits = (x: number, z: number, r: number) =>
    x - r > bounds.minX + 1 &&
    x + r < bounds.maxX - 1 &&
    z - r > bounds.minZ + 1 &&
    z + r < bounds.maxZ - 1 &&
    !blocked(x, z, r, keepOff) &&
    placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r + 0.4) &&
    sight.every(([a, b]) => segmentDistance(x, z, a, b) > r + 0.3)
  const tryPlace = (local: Prim[], at: Vec3, yaw: number, r: number) => {
    if (at[1] > 0.01 || !fits(at[0], at[2], r)) return false
    placed.push({ x: at[0], z: at[2], r })
    solid.push(...place(local, at, yaw))
    return true
  }

  // ---- an arcade machine (E3), first of the furniture (the floor beside the path fills up
  // with desks): where a stop sees it best — no exhibit, no glass on the line (the camera flies
  // there in a straight line) — its screen turned to that stop. The line stays free of whatever
  // comes after (furniture, columns, the coffee, the meeting); the rest of the office is the same,
  // bar a piece that would have stood on it ----
  const arcade: ArcadeCabinet[] = []
  const exhibitsInView = layout.stations.map((st) => ({ x: st.anchor[0], z: st.anchor[2], r: 2.4 }))
  // Candidates in each ground-floor stop's frame (from a mezzanine the flight would dive through
  // its railing), nearest first: the first that fits wins. A narrow (phone) frame may have no
  // room beside the exhibits: then within a wide screen's frame — seen when the camera turns,
  // walking past.
  const tan = Math.tan((ENTRANCE_GEOMETRY.fov * Math.PI) / 360)
  /**
   * The nearest spot a ground-floor stop sees for a thing with a screen (E3, E5): its footprint
   * fits, `ok` agrees, no exhibit nor glass on the line of sight nor on the camera's way to `eye`.
   */
  function screenSpot(spec: {
    turn: number
    footprint: { at: Vec3; r: number }
    view: readonly [number, number]
    cone: number
    screen: Vec3
    eye: (center: Vec3, normal: [number, number]) => Vec3
    ok: (at: Vec3, yaw: number) => boolean
  }) {
    let best: { at: Vec3; yaw: number; station: number; seen: number } | null = null
    for (const a of aspect < 16 / 9 ? [aspect, 16 / 9] : [aspect]) best ??= spotIn(Math.atan(tan * a) * spec.cone)
    return best
    function spotIn(halfWidth: number) {
      const candidates: { at: Vec3; station: number; d: number }[] = []
      const step = halfWidth / Math.max(2, Math.round(halfWidth / 0.08))
      layout.stations.forEach((st, station) => {
        if (st.viewpoint[1] > OFFICE.sill + 1.5) return
        const look = Math.atan2(st.focus[0] - st.viewpoint[0], st.focus[2] - st.viewpoint[2])
        for (let a = -halfWidth; a <= halfWidth + 1e-9; a += step) {
          for (let d = spec.view[0]; d <= spec.view[1]; d += 0.5) {
            candidates.push({ at: [st.viewpoint[0] + Math.sin(look + a) * d, 0, st.viewpoint[2] + Math.cos(look + a) * d], station, d })
          }
        }
      })
      candidates.sort((p, q) => p.d - q.d)
      for (const { at, station, d } of candidates) {
        const vp = layout.stations[station]!.viewpoint
        const yaw = Math.atan2(vp[0] - at[0], vp[2] - at[2]) + spec.turn
        const foot = placePoint(spec.footprint.at, at, yaw)
        if (!fits(foot[0], foot[2], spec.footprint.r)) continue
        if (!spec.ok(at, yaw)) continue
        if (exhibitsInView.some((b) => lineHits(vp, at, b)) || walls.some((w) => crosses(vp, at, w))) continue
        // The camera's way in, too: from the stop to straight in front of the screen.
        const eye = spec.eye(placePoint(spec.screen, at, yaw), [Math.sin(yaw), Math.cos(yaw)])
        if (walls.some((w) => crosses(vp, eye, w))) continue
        if (exhibitsInView.some((b) => segmentDistance(b.x, b.z, vp, eye) <= b.r * 0.8)) continue
        return { at, yaw, station, seen: d }
      }
      return null
    }
  }
  const arcBest = screenSpot({
    ...ARCADE_CAB,
    screen: ARCADE_CAB.screen.center,
    eye: (c, n) => arcadeEye(c, n, aspect),
    ok: (at, yaw) => {
      const player = placePoint(ARCADE_CAB.player.at, at, yaw)
      if (!fits(player[0], player[2], 0.35)) return false
      const aside = placePoint(ARCADE_CAB.aside.at, at, yaw)
      return fits(aside[0], aside[2], 0.3)
    },
  })

  if (arcBest) {
    const { at, yaw, station, seen } = arcBest
    const local = (v: Vec3) => placePoint(v, at, yaw)
    const foot = local(ARCADE_CAB.footprint.at)
    placed.push({ x: foot[0], z: foot[2], r: ARCADE_CAB.footprint.r })
    solid.push(...place(arcadeCabinet(), at, yaw))
    // Layout boxes carry a route heading: the mesh turns by −yaw.
    lights.push({ center: local(ARCADE_CAB.marquee.center), size: ARCADE_CAB.marquee.size, yaw: -yaw })
    const screen = local(ARCADE_CAB.screen.center)
    arcade.push({
      at,
      yaw,
      screen: { center: screen, size: ARCADE_CAB.screen.size, normal: [Math.sin(yaw), Math.cos(yaw)] },
      player: {
        at: local(ARCADE_CAB.player.at),
        yaw: yaw + ARCADE_CAB.player.yaw,
        aside: local(ARCADE_CAB.aside.at),
        asideYaw: yaw + ARCADE_CAB.aside.yaw,
      },
      station,
      seen,
    })
    // Nothing is placed on the line of sight nor on the way in (the flight checks the same).
    const vp = layout.stations[station]!.viewpoint
    sight.push([vp, screen], [vp, arcadeEye(screen, [Math.sin(yaw), Math.cos(yaw)], aspect)])
  }

  // ---- the monitor showing the landing (E5), right after the arcade and the same way: in plain
  // view of a stop, the camera's way to it kept free; away from the arcade ----
  const monitor: MonitorDesk[] = []
  // The monitor stands on the portal hall's podium, across from the character of the stop before
  // it (Dima 2026-11-18: "by the portals, it is empty there anyway" → "not in a row with the
  // portals, just on the podium, opposite the guy, only on the left"). It faces the stop that sees
  // it; it stands by the exhibits, so the route's clear floor does not exclude it (like a helper).
  if (monitorAt) {
    const { at, face, station, hall } = monitorAt
    const yaw = Math.atan2(face[0] - at[0], face[2] - at[2])
    solid.push(...place(monitorDesk(), at, yaw))
    const normal: [number, number] = [Math.sin(yaw), Math.cos(yaw)]
    const screen = placePoint(MONITOR_DESK.screen.center, at, yaw)
    monitor.push({ at, yaw, screen: { center: screen, size: MONITOR_DESK.screen.size, normal }, station, hall, seen: Math.hypot(face[0] - at[0], face[2] - at[2]) })
  }

  // The other gags keep their distance (they would pile up in one place).
  const nearArcade = (x: number, z: number) =>
    arcade.some((a) => Math.hypot(a.at[0] - x, a.at[2] - z) < ARCADE_CAB.apart) ||
    monitor.some((a) => Math.hypot(a.at[0] - x, a.at[2] - z) < MONITOR_DESK.apart)

  clear.forEach((c, ci) => {
    if (c.frame.level > 0 || ci === 0) return // nothing on mezzanines (handled) or in the entrance
    for (let along = c.from + 1.5; along < c.to - 1; along += 4.6) {
      for (const s of [-1, 1]) {
        const roll = rand()
        // face the path
        const yaw = Math.atan2(-right(c.frame.heading)[0] * s, -right(c.frame.heading)[2] * s)
        if (roll < 0.55) tryPlace(deskCluster(), inFrame(c.frame, along, s * (c.half + 2.6)), yaw, 2)
        else if (roll < 0.7) tryPlace(shelf(Math.floor(rand() * 1000)), inFrame(c.frame, along, s * (c.half + 1.3)), yaw, 0.8)
        else if (roll < 0.85) {
          const at = inFrame(c.frame, along, s * (c.half + 2))
          if (tryPlace(lounge(), at, yaw, 1.5)) {
            // The seat (lounge(): box at local (0, 0.22, −0.3), 0.44 high): its top centre.
            const k = Math.cos(yaw)
            const sn = Math.sin(yaw)
            sofas.push({ seat: [at[0] + -0.3 * sn, 0.44, at[2] + -0.3 * k], yaw })
          }
        }
        tryPlace(plant(rand() < 0.5), inFrame(c.frame, along + 2.3, s * (c.half + 0.9)), 0, 0.45)
      }
    }
  })

  // ---- columns on a grid, wherever the floor is free ----
  const columns: { x: number; z: number; r: number }[] = []
  const g = OFFICE.columnGrid
  for (let x = Math.ceil(bounds.minX / g) * g; x <= bounds.maxX; x += g) {
    for (let z = Math.ceil(bounds.minZ / g) * g; z <= bounds.maxZ; z += g) {
      if (blocked(x, z, 0.6, keepOff) || placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 0.6)) continue
      if (sight.some(([a, b]) => segmentDistance(x, z, a, b) < 0.6)) continue
      solid.push(box([x, H / 2, z], [0.45, H, 0.45], 'wall'))
      columns.push({ x, z, r: 0.3 })
    }
  }

  // ---- coffee corners (E2a), after the columns and with their own random stream: the rest
  // of the office stays exactly as it was ----
  const coffee: CoffeeCorner[] = []
  const randCoffee = seeded(seed * 31 + 7)
  const free = (x: number, z: number, r: number) =>
    fits(x, z, r) && columns.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + r + 0.3)
  const candidates: { at: Vec3; yaw: number }[] = []
  clear.forEach((c, ci) => {
    if (c.frame.level > 0 || ci === 0) return
    for (let along = c.from + 3.8; along < c.to - 1.5; along += 4.6) {
      for (const s of [-1, 1]) {
        // Side-on to the path: the front faces along it, so the two chat in profile to the camera.
        // Next to the path between the desk clusters if there is room, else behind them.
        const fw = forward(c.frame.heading)
        for (const out of [2.2, 6.2]) candidates.push({ at: inFrame(c.frame, along, s * (c.half + out)), yaw: Math.atan2(fw[0], fw[2]) })
      }
    }
  })
  // Where the camera stops and looks: a corner in view of a stop (not behind frosted glass)
  // comes first, the closer the better, so the gag is seen; the rest in random order.
  const order = candidates.map((c) => ({ c, seen: seenFrom(c.at, layout.stations, frosted), r: randCoffee() })).sort((a, b) => a.seen - b.seen || a.r - b.r)
  candidates.length = 0
  candidates.push(...order.map((o) => o.c))
  while (candidates.length && coffee.length < 2) {
    const { at, yaw } = candidates.shift()!
    const c = Math.cos(yaw)
    const sn = Math.sin(yaw)
    const toWorld = (v: Vec3): Vec3 => [at[0] + v[0] * c + v[2] * sn, at[1] + v[1], at[2] - v[0] * sn + v[2] * c]
    const spots = COFFEE_SPOTS.map((sp) => ({ at: toWorld(sp.at), yaw: sp.yaw + yaw }))
    if (!free(at[0], at[2], 0.8) || !spots.every((sp) => free(sp.at[0], sp.at[2], 0.45))) continue
    if (coffee.some((k) => Math.hypot(k.at[0] - at[0], k.at[2] - at[2]) < 12) || nearArcade(at[0], at[2])) continue
    placed.push({ x: at[0], z: at[2], r: 0.8 })
    solid.push(...place(coffeeCounter(), at, yaw))
    coffee.push({ at, yaw, steam: toWorld(COFFEE_STEAM), spots })
  }

  // ---- a stand-up meeting corner (E2b): the best spot a stop sees with no furniture in the
  // way (a first try behind the desks was hidden by their screens), board facing the way the
  // camera comes from (so the chart and the presenter's face are seen) ----
  const meeting: MeetingCorner[] = []
  const blockers = [...placed, ...columns]
  const meetCandidates: { at: Vec3; yaw: number }[] = []
  clear.forEach((c, ci) => {
    if (c.frame.level > 0 || ci === 0) return
    const fw = forward(c.frame.heading)
    for (let along = c.from + 1.5; along < c.to - 1.5; along += 2.3) {
      for (const s of [-1, 1]) {
        for (const out of [2.4, 4.4, 6.4]) meetCandidates.push({ at: inFrame(c.frame, along, s * (c.half + out)), yaw: Math.atan2(fw[0], fw[2]) })
      }
    }
  })
  const meetOrder = meetCandidates
    .map((c) => ({ c, seen: seenFrom(c.at, layout.stations, frosted, blockers) }))
    .filter((o) => Number.isFinite(o.seen))
    .sort((a, b) => a.seen - b.seen)
  for (const { c: { at: base, yaw: along } } of meetOrder) {
    if (meeting.length) break
    const yaw = along + Math.PI
    const c = Math.cos(yaw)
    const sn = Math.sin(yaw)
    const toWorld = (v: Vec3): Vec3 => [base[0] + v[0] * c + v[2] * sn, base[1] + v[1], base[2] - v[0] * sn + v[2] * c]
    const centre = toWorld([0, 0, -0.5])
    const people = [MEETING.presenter, ...MEETING.attendees].map((p) => toWorld(p.at))
    if (!free(centre[0], centre[2], 1.3) || !people.every((p) => free(p[0], p[2], 0.4))) continue
    if (coffee.some((k) => Math.hypot(k.at[0] - centre[0], k.at[2] - centre[2]) < 8) || nearArcade(centre[0], centre[2])) continue
    placed.push({ x: centre[0], z: centre[2], r: 1.3 })
    solid.push(...place(meetingCorner(), base, yaw))
    meeting.push({
      at: base,
      yaw,
      boardYaw: yaw,
      bars: MEETING.bars.map((b) => ({
        base: toWorld([b.x, MEETING.barBase, MEETING.boardZ]),
        size: [0.2, b.h, 0.03] as Vec3,
        color: b.color,
      })),
      presenter: { at: people[0]!, yaw: MEETING.presenter.yaw + yaw },
      attendees: MEETING.attendees.map((a, i) => ({ at: people[i + 1]!, yaw: a.yaw + yaw })),
    })
  }

  // ---- ceiling light panels ----
  const lg = OFFICE.lightGrid
  for (let x = bounds.minX + lg / 2; x < bounds.maxX; x += lg) {
    for (let z = bounds.minZ + lg / 2; z < bounds.maxZ; z += lg) lights.push({ center: [x, H - 0.03, z], size: [1.3, 0.04, 1.3], yaw: 0 })
  }

  // ---- perimeter: tall windows between a sill and a header ----
  const { sill, head, windowBay } = OFFICE
  const side = (a: Vec3, b: Vec3) => {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2])
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]) // +z of a box along a→b
    const mid: Vec3 = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2]
    solid.push(box([mid[0], sill / 2, mid[2]], [0.3, sill, len], 'wall', yaw))
    solid.push(box([mid[0], (head + H) / 2, mid[2]], [0.3, H - head, len], 'wall', yaw))
    windows.push({ center: [mid[0], (sill + head) / 2, mid[2]], size: [0.1, head - sill, len], yaw: -yaw })
    const bays = Math.round(len / windowBay)
    for (let i = 0; i <= bays; i++) {
      const t = i / bays
      solid.push(box([a[0] + (b[0] - a[0]) * t, (sill + head) / 2, a[2] + (b[2] - a[2]) * t], [0.16, head - sill, 0.16], 'frame', yaw))
    }
  }
  const { minX, maxX, minZ, maxZ } = bounds
  side([minX, 0, minZ], [maxX, 0, minZ])
  side([maxX, 0, minZ], [maxX, 0, maxZ])
  side([maxX, 0, maxZ], [minX, 0, maxZ])
  side([minX, 0, maxZ], [minX, 0, minZ])

  // Swivel chair seats leave `solid`: they spin on their own (Office.tsx).
  const chairsByPivot = new Map<string, Chair>()
  for (const p of solid) {
    if (!p.pivot) continue
    const key = p.pivot.map((v) => v.toFixed(3)).join()
    const chair = chairsByPivot.get(key) ?? { pivot: p.pivot, prims: [] }
    chair.prims.push(p)
    chairsByPivot.set(key, chair)
  }

  return {
    solid: solid.filter((p) => !p.pivot),
    glass,
    frosted,
    lights,
    windows,
    ceiling: { center: [(minX + maxX) / 2, H, (minZ + maxZ) / 2], size: [maxX - minX, maxZ - minZ] },
    bounds,
    footprints: [
      ...placed.map((p) => ({ ...p, kind: 'furniture' as const })),
      ...columns.map((c) => ({ ...c, kind: 'column' as const })),
    ],
    keepOff,
    chairs: [...chairsByPivot.values()],
    coffee,
    meeting,
    sofas,
    arcade,
    monitor,
  }
}
