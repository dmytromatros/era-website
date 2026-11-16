/**
 * The office the route runs through: a light, Scandinavian open-plan floor. Built from the route
 * layout (pure, seeded — same office on every visit; unit-tested):
 *
 * - shell: ceiling with light panels, columns on a grid, a perimeter of tall windows;
 * - corridor sides become glass partitions (frosted band low, clear glass above);
 * - stairs lead to a mezzanine on pillars with a glass railing;
 * - furniture (desk clusters, plants, shelves, sofas) fills free floor beside the path;
 * - a coffee corner or two (E2a): where the office's people meet (world/crowd);
 * - a stand-up meeting corner (E2b): a high table and a whiteboard with a chart.
 *
 * Everything is made of primitives (boxes, cylinders, balls) in a few materials, so the renderer
 * can draw all of it with a handful of instanced meshes. Nothing may stand on `clear` floor.
 */
import { seeded } from '@/lib/random'
import { forward, right, type Box, type ClearRect, type Frame, type Vec3, type WorldLayout } from './layout'

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

/** Transform primitives given in a prop's local space (+z = its front) into the world. */
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

export function buildOffice(layout: WorldLayout, seed = 11): Office {
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
  const fits = (x: number, z: number, r: number) =>
    x - r > bounds.minX + 1 &&
    x + r < bounds.maxX - 1 &&
    z - r > bounds.minZ + 1 &&
    z + r < bounds.maxZ - 1 &&
    !blocked(x, z, r, keepOff) &&
    placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r + 0.4)
  const tryPlace = (local: Prim[], at: Vec3, yaw: number, r: number) => {
    if (at[1] > 0.01 || !fits(at[0], at[2], r)) return false
    placed.push({ x: at[0], z: at[2], r })
    solid.push(...place(local, at, yaw))
    return true
  }

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
    if (coffee.some((k) => Math.hypot(k.at[0] - at[0], k.at[2] - at[2]) < 12)) continue
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
    if (coffee.some((k) => Math.hypot(k.at[0] - centre[0], k.at[2] - centre[2]) < 8)) continue
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
  }
}
