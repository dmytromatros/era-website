/**
 * The arcade machine (E3): flying the camera into its screen and back — where the camera ends up
 * (the screen just fills the frame), how far along the flight is, and whether the way there is
 * clear. Pure, tested in arcade.test.ts; the state is in arcadeState.ts, the drawing in Arcade.tsx.
 */
import type { Box, Vec3 } from '../layout'
import { arcadeEye, crosses, type ArcadeCabinet } from '../officeModel'

export const ARCADE = {
  /** Flight into the screen and back out (s). */
  enter: 1.25,
  leave: 0.95,
  /** Further than this (m), a click on the screen says "come closer" instead. */
  reach: 16,
  /** The attract screen is redrawn only this near (m) and in view. */
  drawRange: 22,
  /** "Come closer" shows this long (s). */
  closer: 1.6,
} as const

export type ArcadePhase = 'idle' | 'entering' | 'inside' | 'leaving'

/** Where the camera looks at the screen from: straight on, the whole screen in the frame. */
export function screenView(screen: ArcadeCabinet['screen'], aspect: number): { eye: Vec3; look: Vec3; distance: number } {
  const eye = arcadeEye(screen.center, screen.normal, aspect)
  const c = screen.center
  return { eye, look: [c[0], c[1], c[2]], distance: Math.hypot(eye[0] - c[0], eye[2] - c[2]) }
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

/**
 * How far the camera is from the rail into the screen (0 = on the rail, 1 = at the screen), `age`
 * seconds into the phase; leaving starts from `from` (it may turn round mid-flight).
 */
export function flightWeight(phase: ArcadePhase, age: number, from = 1): number {
  switch (phase) {
    case 'idle':
      return 0
    case 'entering':
      return ease(Math.min(Math.max(age / ARCADE.enter, 0), 1))
    case 'inside':
      return 1
    case 'leaving':
      return from * (1 - ease(Math.min(Math.max(age / ARCADE.leave, 0), 1)))
  }
}

/** Distance from (x, z) to the floor segment a → b. */
function segmentDistance(x: number, z: number, a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const len2 = dx * dx + dz * dz
  const t = len2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / len2)) : 0
  return Math.hypot(a[0] + dx * t - x, a[2] + dz * t - z)
}

/**
 * Can the camera fly from `from` to the screen in a straight line? Not too far, no glass
 * partition and nothing standing (furniture, columns, the exhibits) on the way. The cabinet's own
 * footprint does not count, nor does anything the camera already stands in.
 */
export function flightClear(
  from: Vec3,
  cabinet: ArcadeCabinet,
  to: Vec3,
  walls: Box[],
  blockers: { x: number; z: number; r: number }[],
): boolean {
  if (Math.hypot(to[0] - from[0], to[2] - from[2]) > ARCADE.reach) return false
  if (walls.some((w) => crosses(from, to, w))) return false
  return blockers.every((b) => {
    if (Math.hypot(b.x - cabinet.at[0], b.z - cabinet.at[2]) < 1.2) return true
    if (Math.hypot(b.x - from[0], b.z - from[2]) < b.r) return true
    return segmentDistance(b.x, b.z, from, to) > b.r * 0.8
  })
}
