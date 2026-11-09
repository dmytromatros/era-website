/**
 * Two-bone inverse kinematics for the blocky characters (docs/wow-plan.md, task C1): given where
 * a hand (or a foot) should be, find how the upper bone points and how much the middle joint
 * (elbow / knee) bends. Used now for hands that hold a heading or point at an element and for
 * feet that stay on the floor while the body dips; walking characters (later) plant their feet
 * on stairs with the same `solveTwoBone`.
 *
 * Pure (plain tuples, no three.js objects); tested in ik.test.ts.
 *
 * How the result maps onto a limb (rest pose: the limb hangs along −y from its root) — see
 * `upperBasis` / `lowerBend`. The rig's own convention decides the signs: an elbow bends the
 * forearm FORWARD with rotation.x < 0, a knee bends the shin BACK with rotation.x > 0. The basis
 * keeps the limb's +z on the body's forward side either way, so a nearly straight limb is
 * (nearly) the rest pose — never the rest pose turned 180° around its own axis. (It was, for
 * knees: blending between the two made standing legs twist sideways and back.)
 */

/** Which way the middle joint bends, in the rig's terms. */
export type Joint = 'elbow' | 'knee'

export type V3 = [number, number, number]

export interface TwoBoneSolution {
  /** Unit direction of the upper bone (root → middle joint). */
  dir: V3
  /** Unit vector ⟂ `dir`, towards which the lower bone bends (away from the pole). */
  side: V3
  /** Middle-joint bend (radians, 0 = straight). */
  bend: number
  /** Length factor of both bones (> 1 only when the target is out of reach and stretching is allowed). */
  stretch: number
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

function normalize(a: V3, fallback: V3): V3 {
  const l = len(a)
  return l > 1e-9 ? scale(a, 1 / l) : fallback
}

/** Component of `v` perpendicular to the unit vector `axis`, normalised (any perpendicular if parallel). */
function perpendicular(v: V3, axis: V3): V3 {
  const p = sub(v, scale(axis, dot(v, axis)))
  if (len(p) > 1e-6) return normalize(p, [0, 0, 1])
  // `v` is parallel to the axis: take the world axis least aligned with it.
  const helper: V3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]
  return normalize(sub(helper, scale(axis, dot(helper, axis))), [0, 0, 1])
}

/**
 * @param target   end point relative to the chain root
 * @param l1, l2   bone lengths (root → middle joint → end)
 * @param pole     direction the middle joint should point to (elbows back/out, knees forward)
 * @param maxStretch  > 1 lets both bones lengthen (cartoon stretch) to reach a far target
 */
export function solveTwoBone(target: V3, l1: number, l2: number, pole: V3, maxStretch = 1): TwoBoneSolution {
  const reach = l1 + l2
  const distance = len(target)
  const stretch = clamp(distance / reach, 1, Math.max(1, maxStretch))
  const a = l1 * stretch
  const b = l2 * stretch
  // Keep the triangle valid: a hair short of straight, never folded flat.
  const d = clamp(distance, Math.abs(a - b) + 1e-4, (a + b) * (1 - 1e-6))
  const toTarget = normalize(target, [0, -1, 0])
  const towardsPole = perpendicular(pole, toTarget)

  const cosRoot = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1)
  const sinRoot = Math.sqrt(1 - cosRoot * cosRoot)
  const dir = normalize(add(scale(toTarget, cosRoot), scale(towardsPole, sinRoot)), toTarget)

  const elbow = scale(dir, a)
  const lower = normalize(sub(scale(toTarget, d), elbow), dir)
  const bend = Math.acos(clamp(dot(dir, lower), -1, 1))
  // The lower bone bends away from the pole (an elbow points back → the forearm goes forward).
  // Straight limb: no bend to measure, but keep the same side, or the basis flips at bend 0.
  const side = bend > 1e-5 ? perpendicular(lower, dir) : perpendicular(scale(towardsPole, -1), dir)
  return { dir, side, bend, stretch }
}

/** End point the solution actually reaches (for tests and debugging). */
export function endPoint(s: TwoBoneSolution, l1: number, l2: number): V3 {
  const lowerDir = add(scale(s.dir, Math.cos(s.bend)), scale(s.side, Math.sin(s.bend)))
  return add(scale(s.dir, l1 * s.stretch), scale(lowerDir, l2 * s.stretch))
}

/**
 * Columns (X, Y, Z) of the upper bone's rotation matrix in its parent's space — feed them to
 * `Matrix4.makeBasis` and take the quaternion. The bone hangs along −Y at rest, so Y = −dir;
 * Z is the limb's forward side: where an elbow bends the forearm, opposite to where a knee
 * bends the shin.
 */
export function upperBasis(s: TwoBoneSolution, joint: Joint): [V3, V3, V3] {
  const y = scale(s.dir, -1)
  const z = joint === 'elbow' ? s.side : scale(s.side, -1)
  return [cross(y, z), y, z]
}

/** rotation.x of the lower bone in that basis: the lower bone then points along cos·dir + sin·side. */
export const lowerBend = (s: TwoBoneSolution, joint: Joint) => (joint === 'elbow' ? -s.bend : s.bend)
