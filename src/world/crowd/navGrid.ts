/**
 * Where the office's people can walk (E2a): a grid over the office floor, blocked under furniture,
 * columns and the route's clear floor (the corridor, exhibits, stairs — people never walk into
 * the camera's way or in front of an exhibit), and an A* path finder with string pulling.
 * Pure, tested in navGrid.test.ts. Built once per office; a path costs well under a millisecond
 * on the home page's floor and is asked for only when someone decides to go somewhere.
 */
import { forward, right, type Vec3 } from '../layout'
import type { Office } from '../officeModel'

/** Grid cell (m) and the clearance a walking person keeps around them (m). */
export const NAV = { cell: 0.5, body: 0.35 } as const

export interface NavGrid {
  minX: number
  minZ: number
  cols: number
  rows: number
  /** 1 = blocked. */
  cells: Uint8Array
  /** Connected area of each walkable cell (0 = blocked): no search between two areas. */
  area: Int32Array
}

export function buildNavGrid(office: Pick<Office, 'bounds' | 'footprints' | 'keepOff'>): NavGrid {
  const { minX, maxX, minZ, maxZ } = office.bounds
  const cols = Math.ceil((maxX - minX) / NAV.cell)
  const rows = Math.ceil((maxZ - minZ) / NAV.cell)
  const cells = new Uint8Array(cols * rows)
  const cx = (c: number) => minX + (c + 0.5) * NAV.cell
  const cz = (r: number) => minZ + (r + 0.5) * NAV.cell
  // Mark only the cells around each obstacle (not every cell against every obstacle): a few
  // milliseconds instead of ~0.1–0.2 s on the home page's floor.
  const mark = (x0: number, x1: number, z0: number, z1: number, hit: (x: number, z: number) => boolean) => {
    const c0 = Math.max(0, Math.floor((x0 - minX) / NAV.cell))
    const c1 = Math.min(cols - 1, Math.floor((x1 - minX) / NAV.cell))
    const r0 = Math.max(0, Math.floor((z0 - minZ) / NAV.cell))
    const r1 = Math.min(rows - 1, Math.floor((z1 - minZ) / NAV.cell))
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (hit(cx(c), cz(r))) cells[r * cols + c] = 1
  }
  // The building's edge.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = cx(c)
      const z = cz(r)
      if (x < minX + 1 || x > maxX - 1 || z < minZ + 1 || z > maxZ - 1) cells[r * cols + c] = 1
    }
  }
  for (const f of office.footprints) {
    const R = f.r + NAV.body
    mark(f.x - R, f.x + R, f.z - R, f.z + R, (x, z) => Math.hypot(f.x - x, f.z - z) < R)
  }
  // Clear floor (same test as officeModel's `blocked`, one rectangle at a time).
  for (const k of office.keepOff) {
    const fw = forward(k.frame.heading)
    const rt = right(k.frame.heading)
    const o = k.frame.origin
    const corners = [k.from - NAV.body, k.to + NAV.body].flatMap((a) =>
      [-1, 1].map((s) => [o[0] + fw[0] * a + rt[0] * s * (k.half + NAV.body), o[2] + fw[2] * a + rt[2] * s * (k.half + NAV.body)]),
    )
    const xs = corners.map((p) => p[0]!)
    const zs = corners.map((p) => p[1]!)
    mark(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), (x, z) => {
      const along = (x - o[0]) * fw[0] + (z - o[2]) * fw[2]
      const across = (x - o[0]) * rt[0] + (z - o[2]) * rt[2]
      return along >= k.from - NAV.body && along <= k.to + NAV.body && Math.abs(across) <= k.half + NAV.body
    })
  }
  // Label the connected areas (flood fill, 8-neighbour like the search, no corner cutting).
  const area = new Int32Array(cols * rows)
  let label = 0
  const stack: number[] = []
  for (let s = 0; s < cells.length; s++) {
    if (cells[s] || area[s]) continue
    area[s] = ++label
    stack.push(s)
    while (stack.length) {
      const i = stack.pop()!
      const c = i % cols
      const r = Math.floor(i / cols)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nc = c + dc
          const nr = r + dr
          if ((!dr && !dc) || nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
          const j = nr * cols + nc
          if (cells[j] || area[j]) continue
          if (dr && dc && (cells[r * cols + nc] || cells[nr * cols + c])) continue
          area[j] = label
          stack.push(j)
        }
      }
    }
  }
  return { minX, minZ, cols, rows, cells, area }
}

const cellOf = (g: NavGrid, x: number, z: number): [number, number] => [
  Math.floor((x - g.minX) / NAV.cell),
  Math.floor((z - g.minZ) / NAV.cell),
]
const centre = (g: NavGrid, c: number, r: number): [number, number] => [g.minX + (c + 0.5) * NAV.cell, g.minZ + (r + 0.5) * NAV.cell]

/** Is the floor at (x, z) walkable? */
export function walkable(g: NavGrid, x: number, z: number): boolean {
  const [c, r] = cellOf(g, x, z)
  return c >= 0 && r >= 0 && c < g.cols && r < g.rows && g.cells[r * g.cols + c] === 0
}

/** The connected walkable area a floor point is in (0 = blocked / outside). */
export function areaOf(g: NavGrid, x: number, z: number): number {
  const [c, r] = cellOf(g, x, z)
  return c >= 0 && r >= 0 && c < g.cols && r < g.rows ? g.area[r * g.cols + c]! : 0
}

/** A straight walk from a to b stays on walkable floor (sampled every quarter cell). */
export function clearLine(g: NavGrid, a: readonly [number, number], b: readonly [number, number]): boolean {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (NAV.cell / 4))
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0
    if (!walkable(g, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false
  }
  return true
}

/**
 * Shortest walk from `from` to `to` (floor points, both walkable), as corner points including
 * both ends; null if there is none (another side of the corridor, say).
 */
export function findPath(g: NavGrid, from: Vec3, to: Vec3, maxNodes = 20000): Vec3[] | null {
  if (!walkable(g, from[0], from[2]) || !walkable(g, to[0], to[2])) return null
  const y = from[1]
  const [sc, sr] = cellOf(g, from[0], from[2])
  const [tc, tr] = cellOf(g, to[0], to[2])
  const start = sr * g.cols + sc
  const goal = tr * g.cols + tc
  if (g.area[start] !== g.area[goal]) return null
  const cost = new Float32Array(g.cols * g.rows).fill(Infinity)
  const prev = new Int32Array(g.cols * g.rows).fill(-1)
  const closed = new Uint8Array(g.cols * g.rows)
  // A small binary heap of [f, index].
  const heap: [number, number][] = []
  const push = (f: number, i: number) => {
    heap.push([f, i])
    let k = heap.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (heap[p]![0] <= heap[k]![0]) break
      ;[heap[p], heap[k]] = [heap[k]!, heap[p]!]
      k = p
    }
  }
  const pop = (): number => {
    const top = heap[0]!
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let k = 0
      for (;;) {
        const l = 2 * k + 1
        const r = l + 1
        let m = k
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r
        if (m === k) break
        ;[heap[m], heap[k]] = [heap[k]!, heap[m]!]
        k = m
      }
    }
    return top[1]
  }
  const h = (i: number) => Math.hypot((i % g.cols) - tc, Math.floor(i / g.cols) - tr)
  cost[start] = 0
  push(h(start), start)
  let visited = 0
  while (heap.length) {
    const i = pop()
    if (closed[i]) continue
    closed[i] = 1
    if (i === goal) break
    if (++visited > maxNodes) return null
    const c = i % g.cols
    const r = Math.floor(i / g.cols)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue
        const j = nr * g.cols + nc
        if (g.cells[j] || closed[j]) continue
        // No cutting a blocked corner diagonally.
        if (dr && dc && (g.cells[r * g.cols + nc] || g.cells[nr * g.cols + c])) continue
        const step = dr && dc ? Math.SQRT2 : 1
        if (cost[i]! + step < cost[j]!) {
          cost[j] = cost[i]! + step
          prev[j] = i
          push(cost[j]! + h(j), j)
        }
      }
    }
  }
  if (prev[goal] === -1 && goal !== start) return null
  const cellsPath: number[] = []
  for (let i = goal; i !== -1; i = prev[i]!) cellsPath.push(i)
  cellsPath.reverse()
  // String pulling: keep only the corners a straight walk cannot skip.
  const pts: [number, number][] = [[from[0], from[2]], ...cellsPath.slice(1, -1).map((i) => centre(g, i % g.cols, Math.floor(i / g.cols))), [to[0], to[2]]]
  const out: [number, number][] = [pts[0]!]
  let k = 0
  while (k < pts.length - 1) {
    let far = k + 1
    for (let m = pts.length - 1; m > k + 1; m--) {
      if (clearLine(g, pts[k]!, pts[m]!)) {
        far = m
        break
      }
    }
    out.push(pts[far]!)
    k = far
  }
  return out.map(([x, z]) => [x, y, z] as Vec3)
}

/** Length of a path (m). */
export const pathLength = (p: Vec3[]) => p.reduce((n, v, i) => (i ? n + Math.hypot(v[0] - p[i - 1]![0], v[2] - p[i - 1]![2]) : 0), 0)

/** Point and heading `d` metres along a path. */
export function alongPath(p: Vec3[], d: number): { at: Vec3; yaw: number } {
  let left = Math.max(d, 0)
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!
    const b = p[i]!
    const len = Math.hypot(b[0] - a[0], b[2] - a[2])
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2])
    if (left <= len || i === p.length - 1) {
      const t = len ? Math.min(left / len, 1) : 1
      return { at: [a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t], yaw }
    }
    left -= len
  }
  return { at: p[p.length - 1] ?? [0, 0, 0], yaw: 0 }
}
