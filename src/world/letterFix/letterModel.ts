/**
 * A letter knocked off the hero heading (E4, Dima 2026-11-16): click a letter — it drops to the
 * floor, bounces and lies on its side; the character holding the heading lets go of it, runs
 * over, picks the letter up, carries it back over the head, the letter springs back into its
 * slot, and the character grumbles. Pure, tested in letterModel.test.ts.
 *
 * The letter is still its glyph in the ONE troika text of the heading (B1, rule 26): the shader
 * moves it by an offset, so the fall costs no draw call and no physics worker — a few numbers
 * stepped here. Offsets are in the text's local space, relative to the glyph's rest centre.
 *
 * Shared between the heading (KineticText: steps the fall, draws the letter, tells where it is
 * in the world) and the holder (Helper: walks there and back, says where it carries the letter).
 */
import type { Vec3 } from '../layout'

export const DROP = {
  /** Gravity (m/s²), the push towards the viewer as it comes off (m/s) and its spin (rad/s). */
  gravity: 9.8,
  toViewer: 1.2,
  spin: 7,
  /** Bounce: what is left of the speed down at each hit; sideways speed kept on a hit. */
  bounce: 0.38,
  friction: 0.6,
  /** Slower than this (m/s) on hitting the floor, it stops bouncing and lies down. */
  settle: 0.7,
  /** Lying down: how fast it rolls onto its side and comes to rest (1/s). */
  lie: 9,
} as const

/** The holder (s, m/s): sees it fall, a beat, runs, picks it up, runs back, puts it in, grumbles. */
export const FIX = {
  notice: 0.55,
  run: 2.6,
  /** Stops this far short of the letter (m). */
  standoff: 0.38,
  pick: 0.5,
  /** Carried in both hands over the head: this high above the holder's floor point (m, × scale). */
  carryUp: 2.05,
  carryForward: 0.12,
  grumble: 3,
  /** The heading sags while nobody holds it: this far down (font sizes) and tilted (rad). */
  sag: 0.32,
  sagTilt: 0.05,
} as const

export type FixPhase = 'idle' | 'falling' | 'lying' | 'carried' | 'back'

export interface LetterFix {
  phase: FixPhase
  /** Which glyph (index in the heading's text). */
  glyph: number
  /** Scene time the phase started. */
  since: number
  /** Offset from the glyph's rest centre and tilt (text-local units), with velocities. */
  ox: number
  oy: number
  oz: number
  a: number
  vx: number
  vy: number
  vz: number
  va: number
  /** Where the letter is in the world (written by the heading every frame). */
  world: Vec3
  /** Carried: the world point it follows (written by the holder every frame). */
  carry: Vec3 | null
  /** The holder is away from its post (0..1; the heading sags). Written by the holder. */
  away: number
}

export const newFix = (): LetterFix => ({
  phase: 'idle',
  glyph: -1,
  since: 0,
  ox: 0,
  oy: 0,
  oz: 0,
  a: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  va: 0,
  world: [0, 0, 0],
  carry: null,
  away: 0,
})

/** The one letter that can be off the heading at a time (one heading is kinetic: the hero's). */
export const letterFix: LetterFix = newFix()

/** Back to nothing happening (leaving the hero, back to 2D, a new page). */
export function resetFix(f: LetterFix = letterFix) {
  Object.assign(f, newFix())
}

/**
 * Knock glyph `glyph` off (from its current spring offset): it pops up a little, towards the
 * viewer, and spins away from the click (`side` −1 / 1). `scale` = world metres per text unit.
 */
export function knock(f: LetterFix, glyph: number, from: { ox: number; oy: number; oz: number; a: number }, side: number, scale: number, now: number) {
  if (f.phase !== 'idle') return false
  Object.assign(f, newFix(), { phase: 'falling' as FixPhase, glyph, since: now, ...from })
  f.vy = 0.9 / scale
  f.vz = DROP.toViewer / scale
  f.vx = side * 0.25 / scale
  f.va = -side * DROP.spin
  return true
}

/** Half the height of a glyph tilted by `a` (half width hw, half height hh). */
const halfHeight = (a: number, hw: number, hh: number) => Math.abs(Math.cos(a)) * hh + Math.abs(Math.sin(a)) * hw

/**
 * Advance a falling / lying letter by `dt`. `floor` = the floor's height in the text's local space
 * relative to the glyph's rest centre (negative: below it); hw / hh = the glyph's half size.
 */
export function stepDrop(f: LetterFix, dt: number, now: number, floor: number, hw: number, hh: number, scale: number) {
  const g = DROP.gravity / scale
  for (let t = 0; t < dt - 1e-9; t += 1 / 120) {
    const h = Math.min(1 / 120, dt - t)
    if (f.phase === 'falling') {
      f.vy -= g * h
      f.ox += f.vx * h
      f.oy += f.vy * h
      f.oz += f.vz * h
      f.a += f.va * h
      const bottom = f.oy - halfHeight(f.a, hw, hh)
      if (bottom < floor && f.vy < 0) {
        f.oy = floor + halfHeight(f.a, hw, hh)
        if (-f.vy * scale < DROP.settle) {
          f.phase = 'lying'
          f.since = now
          f.vy = 0
        } else {
          f.vy = -f.vy * DROP.bounce
          f.va *= 0.55
        }
        f.vx *= DROP.friction
        f.vz *= DROP.friction
      }
    } else if (f.phase === 'lying') {
      // Rolls onto the nearer side and settles there; slides to a stop.
      // The nearest odd multiple of π/2: on its left or right side.
      const lie = (2 * Math.round((f.a - Math.PI / 2) / Math.PI) + 1) * (Math.PI / 2)
      const k = 1 - Math.exp(-DROP.lie * h)
      f.a += (lie - f.a) * k
      f.oy += (floor + hw - f.oy) * k
      f.vx *= 1 - k
      f.vz *= 1 - k
      f.ox += f.vx * h
      f.oz += f.vz * h
    }
  }
}

/** Carried: follow the holder's hands (`to` = that point as an offset in text space), upright. */
export function carryTo(f: LetterFix, to: { x: number; y: number; z: number }, dt: number) {
  const k = 1 - Math.exp(-14 * dt)
  f.ox += (to.x - f.ox) * k
  f.oy += (to.y - f.oy) * k
  f.oz += (to.z - f.oz) * k
  f.a += (0 - f.a) * k
}

/** The holder's walk: where it is on its way (from → to, `run` m/s), and whether it is there. */
export function walkStep(at: { x: number; z: number }, to: { x: number; z: number }, dt: number) {
  const dx = to.x - at.x
  const dz = to.z - at.z
  const d = Math.hypot(dx, dz)
  const step = FIX.run * dt
  if (d <= step) return { x: to.x, z: to.z, moved: d, arrived: true, yaw: d > 1e-6 ? Math.atan2(dx, dz) : null }
  return { x: at.x + (dx / d) * step, z: at.z + (dz / d) * step, moved: step, arrived: false, yaw: Math.atan2(dx, dz) }
}

/** Where to stop next to the letter: `standoff` short of it, on the way from `from`. */
export function standNear(from: { x: number; z: number }, letter: { x: number; z: number }) {
  const dx = letter.x - from.x
  const dz = letter.z - from.z
  const d = Math.hypot(dx, dz)
  if (d <= FIX.standoff) return { x: from.x, z: from.z }
  return { x: letter.x - (dx / d) * FIX.standoff, z: letter.z - (dz / d) * FIX.standoff }
}
