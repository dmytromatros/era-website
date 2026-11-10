/**
 * Shards of the film flying out of the burst (wow-plan D1): pieces of the "page" spin out of
 * the hole towards the visitor, who falls through after them, and drop out of view. Pure,
 * closed-form (no simulation): position = start + velocity·t + gravity·t²/2, deterministic per
 * shard — tested in shardsModel.test.ts, drawn as ONE instanced mesh by <Shards>.
 */
import { ENTRANCE_GEOMETRY } from '../layout'
import type { Uv, Vec3 } from './handsModel'

export const SHARDS = {
  /** Shards live this long after the crack (s); then the mesh is not drawn at all. */
  life: 1.5,
  /** Spawn radius around the burst point (world units, on the film) and size range. */
  spread: 1.6,
  size: [0.16, 0.48],
  /** Out of the hole (radial) and towards the camera (+z), world units / s; gravity. */
  radial: [0.6, 2.6],
  toward: [2.5, 7.5],
  gravity: -7,
} as const

/** The burst point on the film (world), from its screen uv at the start view. */
export function burstOrigin(uv: Uv, aspect: number): Vec3 {
  const { cameraStart, membraneDistance, fov } = ENTRANCE_GEOMETRY
  const h = 2 * membraneDistance * Math.tan(((fov / 2) * Math.PI) / 180)
  return [(uv.x - 0.5) * h * aspect, cameraStart[1] + (uv.y - 0.5) * h, cameraStart[2] - membraneDistance]
}

/** Deterministic 0..1 noise per shard and channel. */
export const rand = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}
const lerp = (r: readonly [number, number], t: number) => r[0] + (r[1] - r[0]) * t

export interface Shard {
  position: Vec3
  /** Euler XYZ. */
  rotation: Vec3
  /** Uniform scale (0 = gone). */
  scale: number
}

/** Shard `i` at `t` seconds after the crack; `origin` = the burst point on the film (world). */
export function shardAt(i: number, t: number, origin: Vec3): Shard | null {
  if (t < 0 || t >= SHARDS.life) return null
  const a = rand(i, 0) * Math.PI * 2
  const r = Math.sqrt(rand(i, 1)) * SHARDS.spread
  const dir: [number, number] = [Math.cos(a), Math.sin(a)]
  const out = lerp(SHARDS.radial, rand(i, 2))
  const toward = lerp(SHARDS.toward, rand(i, 3))
  const p0: Vec3 = [origin[0] + dir[0] * r, origin[1] + dir[1] * r, origin[2] + 0.03]
  const spin: Vec3 = [(rand(i, 4) - 0.5) * 14, (rand(i, 5) - 0.5) * 14, (rand(i, 6) - 0.5) * 10]
  // A shard pops out a moment after the crack, nearer ones first; shrinks away at the end.
  const delay = (r / SHARDS.spread) * 0.08
  const tt = Math.max(t - delay, 0)
  const grow = Math.min(tt / 0.06, 1)
  const fade = 1 - Math.max((t - (SHARDS.life - 0.35)) / 0.35, 0)
  return {
    position: [
      p0[0] + dir[0] * out * tt,
      p0[1] + dir[1] * out * tt + 0.5 * SHARDS.gravity * tt * tt,
      p0[2] + toward * tt,
    ],
    rotation: [rand(i, 7) * 6 + spin[0] * tt, rand(i, 8) * 6 + spin[1] * tt, rand(i, 9) * 6 + spin[2] * tt],
    scale: lerp(SHARDS.size, rand(i, 10)) * grow * Math.max(fade, 0),
  }
}
