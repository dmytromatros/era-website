/**
 * The office the route runs through: a light, Scandinavian open-plan floor. Built from the route
 * layout (pure, seeded — same office on every visit; unit-tested):
 *
 * - shell: ceiling with light panels, columns on a grid, a perimeter of tall windows;
 * - corridor sides become glass partitions (frosted band low, clear glass above);
 * - stairs lead to a mezzanine on pillars with a glass railing;
 * - furniture (desk clusters, plants, shelves, sofas) fills free floor beside the path.
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

/** Transform primitives given in a prop's local space (+z = its front) into the world. */
function place(local: Prim[], at: Vec3, yaw: number): Prim[] {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return local.map((p) => ({
    ...p,
    center: [at[0] + p.center[0] * c + p.center[2] * s, at[1] + p.center[1], at[2] - p.center[0] * s + p.center[2] * c],
    yaw: p.yaw + yaw,
  }))
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
    // chair
    box([x, 0.46, z + f * 0.62], [0.48, 0.08, 0.46], 'fabricA'),
    box([x, 0.78, z + f * 0.84], [0.48, 0.52, 0.06], 'fabricA'),
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
        else if (roll < 0.85) tryPlace(lounge(), inFrame(c.frame, along, s * (c.half + 2)), yaw, 1.5)
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

  return {
    solid,
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
  }
}
