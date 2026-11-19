/**
 * The letter's paper plane (wow-plan E9): the sheet folded into a plane, and the show's timing.
 * Pure — tested in letter.test.ts; drawn by <LetterFlight>.
 *
 * The fold is real origami kinematics on a grid: a few creases through the sheet (lines in its
 * flat plane), each turning everything beyond it about that line. They nest — the corner flap
 * rides on the side flap, which rides on the wing, which rides on its half — so every point is
 * turned by its creases from the outermost (the keel) in (product of exponentials, each axis
 * taken flat). Triangles that straddle a crease bend across it: a soft fold, as paper does.
 *
 * Sheet space: x across (−½ … ½), y up (−r/2 … r/2, r = height / width), the written side +z.
 * Folded: the nose at +y, the keel line on x = 0, both halves standing out towards +z (the
 * plane's "up"), the wings flat again, out to the sides.
 */
export type Vec3 = [number, number, number]

/** The folds: corners to the middle, the sides to the middle, in half, the wings out. */
export interface FoldAngles {
  corners: number
  sides: number
  keel: number
  wings: number
}

/** Fully folded (rad). Just short of flat, so folded layers never lie in one plane (no z-fight). */
export const FOLDED: FoldAngles = { corners: Math.PI * 0.955, sides: Math.PI * 0.955, keel: Math.PI * 0.46, wings: -Math.PI * 0.47 }

/** A crease through the apex (the top middle of the sheet), `angle` from straight down. */
interface Crease {
  angle: number
}

export interface Creases {
  apex: [number, number]
  corners: Crease
  sides: Crease
  wings: Crease
}

/** Where the creases run on a sheet of height / width `r`. */
export function creasesOf(r: number): Creases {
  return {
    apex: [0, r / 2],
    // Corners: 45° (the top edge to the middle line).
    corners: { angle: Math.PI / 4 },
    // Sides: half of that again (the new slanted edge to the middle line).
    sides: { angle: Math.PI / 8 },
    // Wings: a narrow keel — 9 % of the width at the tail.
    wings: { angle: Math.atan(0.09 / r) },
  }
}

/** Is (x, y) beyond the crease, on the left half (outside the line from the apex down-left)? */
function beyond(x: number, y: number, apex: [number, number], c: Crease): boolean {
  // The crease's direction (on the left half): down and left.
  const dx = -Math.sin(c.angle)
  const dy = -Math.cos(c.angle)
  const px = x - apex[0]
  const py = y - apex[1]
  // Beyond = on the outer-edge side of the line (where the top-left corner is): cross < 0.
  return dx * py - dy * px < 0
}

/** Rotate p about the line through `o` along unit `d` by `a` (Rodrigues). */
function rotateAbout(p: Vec3, o: Vec3, d: Vec3, a: number): Vec3 {
  if (a === 0) return p
  const v: Vec3 = [p[0] - o[0], p[1] - o[1], p[2] - o[2]]
  const c = Math.cos(a)
  const s = Math.sin(a)
  const dot = v[0] * d[0] + v[1] * d[1] + v[2] * d[2]
  const cx = d[1] * v[2] - d[2] * v[1]
  const cy = d[2] * v[0] - d[0] * v[2]
  const cz = d[0] * v[1] - d[1] * v[0]
  return [
    o[0] + v[0] * c + cx * s + d[0] * dot * (1 - c),
    o[1] + v[1] * c + cy * s + d[1] * dot * (1 - c),
    o[2] + v[2] * c + cz * s + d[2] * dot * (1 - c),
  ]
}

/**
 * Where the flat sheet point (x, y) is with the folds at `f`. The left half is worked out and
 * the right half mirrored (x → −x), so the plane is symmetric.
 */
export function foldPoint(x: number, y: number, c: Creases, f: FoldAngles): Vec3 {
  const side = x < 0 ? 1 : -1 // 1 = left half
  const lx = x * side // as if on the left half (lx ≤ 0)
  const apex: Vec3 = [0, c.apex[1], 0]
  let p: Vec3 = [lx, y, 0]
  const along = (cr: Crease): Vec3 => [-Math.sin(cr.angle), -Math.cos(cr.angle), 0]
  // Leaf first (corner), root last (keel): each axis is its flat one.
  if (beyond(lx, y, c.apex, c.corners)) p = rotateAbout(p, apex, along(c.corners), -f.corners)
  if (beyond(lx, y, c.apex, c.sides)) p = rotateAbout(p, apex, along(c.sides), -f.sides)
  if (beyond(lx, y, c.apex, c.wings)) p = rotateAbout(p, apex, along(c.wings), -f.wings)
  if (lx < 0) p = rotateAbout(p, [0, 0, 0], [0, 1, 0], f.keel)
  return [p[0] * side, p[1], p[2]]
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)
const ease = (v: number) => {
  const t = clamp01(v)
  return t * t * (3 - 2 * t)
}

/* ------------------------------------------------------------------ the show */

/**
 * The show, in scene seconds from Send: the sheet goes to the helper's hands, is folded and thrown,
 * and the plane loops across the office and away into the distance while the camera turns its
 * head after it (Dima 2026-11-19: the window gag and the chasing camera are gone).
 */
export const SHOW = {
  /** Writing: the camera's flight up to the stand (s), and back when the sheet is closed. */
  dive: 0.75,
  undive: 0.6,
  toHands: [0, 0.8],
  fold: [0.8, 2.0],
  windup: [2.0, 2.35],
  /** The plane's flight: a loop and away. */
  away: [2.35, 5.6],
  /** The camera's head turns after it, then back to the helper. */
  look: [2.3, 2.9],
  lookBack: [5.4, 6.2],
  delivered: 5.9,
  end: 6.3,
  /** How long the helper's last line stays after the show (s). */
  lineAfter: 2.6,
} as const

/** The fold's three stages over its window: corners, sides, then in half with the wings out. */
export function foldAt(t: number, folds = true): FoldAngles {
  const [a, b] = SHOW.fold
  const k = (t - a) / (b - a)
  if (!folds) {
    // `low`: no folding to watch — folded in one beat at the start of it.
    return k >= 0 ? { ...FOLDED } : { corners: 0, sides: 0, keel: 0, wings: 0 }
  }
  return {
    corners: FOLDED.corners * ease(k / 0.3),
    sides: FOLDED.sides * ease((k - 0.32) / 0.3),
    keel: FOLDED.keel * ease((k - 0.64) / 0.2),
    wings: FOLDED.wings * ease((k - 0.8) / 0.2),
  }
}

/** 0 → 1 over a [from, to] window. */
export const phaseOf = (t: number, w: readonly [number, number]) => clamp01((t - w[0]) / (w[1] - w[0]))
export const eased = (t: number, w: readonly [number, number]) => ease(phaseOf(t, w))

/** A point on a cubic Bézier. */
export function bezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, k: number): Vec3 {
  const u = 1 - k
  const a = u * u * u
  const b = 3 * u * u * k
  const c = 3 * u * k * k
  const d = k * k * k
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
  ]
}
