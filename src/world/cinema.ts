/**
 * Camera "cinema" (docs/wow-plan.md, task B3). Pure; tested in cinema.test.ts.
 *
 * Dolly zoom ("vertigo") on the way in: once the membrane has torn (CLAUDE.md rule 3), the
 * field of view widens while the camera closes in on the first stop by exactly as much as
 * keeps that stop the same size on screen — so the hero being flown to holds still while the
 * office behind it stretches away. It eases back to the normal field of view by the end of
 * the entrance: the rest of the route is framed for ENTRANCE_GEOMETRY.fov (layout.fitDistance).
 * At the top (e = 0) the field of view is exactly the normal one, so the 2D → 3D swap is
 * untouched.
 */
import { ENTRANCE_GEOMETRY, type Vec3 } from './layout'

export const DOLLY = {
  /** Entrance progress where the vertigo starts / ends (the tear is complete by e ≈ 0.42). */
  from: 0.4,
  to: 1,
  /** Widest field of view, degrees (normal: ENTRANCE_GEOMETRY.fov). */
  peakFov: 62,
} as const

const tanHalf = (deg: number) => Math.tan((deg * Math.PI) / 360)

/** Field of view at entrance progress `e` (0…1): a smooth bump from the normal value and back. */
export function dollyFov(e: number): number {
  const s = Math.min(Math.max((e - DOLLY.from) / (DOLLY.to - DOLLY.from), 0), 1)
  const bump = Math.sin(Math.PI * s) ** 2 // zero slope at both ends: no jolt in or out
  return ENTRANCE_GEOMETRY.fov + (DOLLY.peakFov - ENTRANCE_GEOMETRY.fov) * bump
}

/**
 * Camera position for field of view `fov` that keeps `target` the same size on screen as it is
 * from `pos` at the normal field of view: move along the line to the target so that
 * distance × tan(fov / 2) stays constant.
 */
export function dollyPosition(pos: Vec3, target: Vec3, fov: number): Vec3 {
  const ratio = tanHalf(ENTRANCE_GEOMETRY.fov) / tanHalf(fov)
  return [
    target[0] + (pos[0] - target[0]) * ratio,
    target[1] + (pos[1] - target[1]) * ratio,
    target[2] + (pos[2] - target[2]) * ratio,
  ]
}

/**
 * Distance from the camera to what it looks at (at a stop: the exhibit), written by CameraRig
 * every frame from the rail — so it follows `live.progress` (rule 1), no smoothing of its own.
 * The background blur focuses here (effects/DepthBlurEffect.ts).
 */
export const cameraFocus = {
  distance: ENTRANCE_GEOMETRY.heroDistance,
  /** 0…1: how much the camera is at an accent (a key stop) — the blur only shows there. */
  accent: 0,
}

/**
 * Accent of the camera at rail position `railIndex`: 1 while it stands at a key stop, fading
 * to 0 as it leaves — so the background blurs only where the camera stops on something, and
 * the flight between (corners, stairs, minor stops it glides past) stays sharp (Dima,
 * 2026-11-08). Distances in rail points: the camera lingers near a key stop (dwell 0.85), so
 * ±0.08 is the last ~20 % of the approach and 0.25 about a third of it.
 */
export const ACCENT = { full: 0.08, none: 0.25 } as const

export function accentAt(railIndex: number, keyRail: number[]): number {
  let near = Infinity
  for (const r of keyRail) near = Math.min(near, Math.abs(railIndex - r))
  if (near <= ACCENT.full) return 1
  if (near >= ACCENT.none) return 0
  const x = (ACCENT.none - near) / (ACCENT.none - ACCENT.full)
  return x * x * (3 - 2 * x)
}

/** tan(fov / 2) for a field of view in degrees (exported for the size-invariance test). */
export const dollyTanHalf = tanHalf
