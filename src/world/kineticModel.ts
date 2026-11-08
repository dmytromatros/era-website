/**
 * Kinetic headline (docs/wow-plan.md, task B1): the hero heading's letters live on their own —
 * they spring away from the cursor (a finger on phones), jump in a wave on a tap, and sway in
 * time with the character holding the heading up.
 *
 * The heading stays ONE troika text (same layout, kerning and draw call as every other text).
 * troika draws each glyph as one instance of a quad, so a vertex shader can move glyph number
 * `gl_InstanceID` by an offset from a uniform array. The springs run here, on the CPU (a couple
 * of dozen glyphs — nothing), and the result is uploaded as that array.
 *
 * Seam safety (CLAUDE.md rule 4): every offset is multiplied by `weight`, which is exactly 0
 * until the hero has finished flying to its spot after the handover — at the swap the heading
 * is the very same picture as before.
 *
 * Pure logic (no React, no three.js objects); tested in kineticModel.test.ts.
 */

/** Glyphs beyond this count do not move (the hero heading has ~17). Two vec4 uniforms each. */
export const KINETIC_MAX_GLYPHS = 48

/** Tuned "playful": a visible bounce that settles in about a second. */
export const KINETIC = {
  /** Cursor reach, in font sizes. */
  radius: 1.6,
  /** How far a glyph right under the cursor is pushed, in font sizes (sideways / to the viewer). */
  push: 0.45,
  pushTowardsViewer: 0.6,
  /** Tilt of a pushed glyph (radians at full push). */
  tilt: 0.45,
  /** Spring stiffness and damping (damping ratio ≈ 0.4: underdamped, bouncy). */
  stiffness: 140,
  damping: 9.5,
  /** Tap on a phone: upward kick (font sizes per second) and how fast the wave runs (font sizes per second). */
  kick: 7,
  waveSpeed: 14,
  /** Sway while a character holds the heading: bob (font sizes) and tilt (radians), per glyph wave. */
  swayBob: 0.035,
  swayTilt: 0.05,
  swayWave: 0.6,
  /** Physics step (s): small and fixed, so springs behave the same at 30 and 120 fps. */
  step: 1 / 120,
  /** Below this (in font sizes) a glyph counts as at rest. */
  rest: 0.0005,
} as const

export interface Glyph {
  /** Rest centre in the text's local space (world units). */
  cx: number
  cy: number
  /** Spring offset (x, y, z) and tilt, with velocities. */
  ox: number
  oy: number
  oz: number
  a: number
  vx: number
  vy: number
  vz: number
  va: number
  /** Time (s) when a tap wave reaches this glyph; Infinity = none pending. */
  kickAt: number
  /** Which way the kicked glyph spins: away from the tap. */
  kickDir: number
}

/** Glyph centres from troika's `textRenderInfo.glyphBounds` ([minX, minY, maxX, maxY] per glyph). */
export function glyphsFromBounds(bounds: ArrayLike<number>): Glyph[] {
  const count = Math.min(Math.floor(bounds.length / 4), KINETIC_MAX_GLYPHS)
  return Array.from({ length: count }, (_, i) => ({
    cx: (bounds[i * 4]! + bounds[i * 4 + 2]!) / 2,
    cy: (bounds[i * 4 + 1]! + bounds[i * 4 + 3]!) / 2,
    ox: 0,
    oy: 0,
    oz: 0,
    a: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    va: 0,
    kickAt: Infinity,
    kickDir: 1,
  }))
}

export interface KineticInput {
  /** Font size in world units (all distances scale with it). */
  size: number
  /** Cursor / finger on the text's plane, in its local space; null = none. */
  pointer: { x: number; y: number } | null
}

/** Start a tap wave at local x: each glyph gets its kick when the wave reaches it. */
export function tap(glyphs: Glyph[], x: number, size: number, now: number) {
  for (const g of glyphs) {
    g.kickAt = now + Math.abs(g.cx - x) / (KINETIC.waveSpeed * size)
    g.kickDir = g.cx >= x ? -1 : 1
  }
}

/** Advance the springs by `dt` seconds (fixed sub-steps). Returns true while anything moves. */
export function stepGlyphs(glyphs: Glyph[], input: KineticInput, now: number, dt: number): boolean {
  const { size, pointer } = input
  const reach = KINETIC.radius * size
  let moving = false
  for (const g of glyphs) {
    // Where the cursor wants this glyph to be (constant over the frame).
    let tx = 0
    let ty = 0
    let tz = 0
    let ta = 0
    if (pointer) {
      const dx = g.cx - pointer.x
      const dy = g.cy - pointer.y
      const dist = Math.hypot(dx, dy)
      if (dist < reach) {
        const f = (1 - dist / reach) ** 2
        const nx = dist > 1e-6 ? dx / dist : 0
        const ny = dist > 1e-6 ? dy / dist : 1
        tx = nx * f * KINETIC.push * size
        ty = ny * f * KINETIC.push * size
        tz = f * KINETIC.pushTowardsViewer * size
        ta = -nx * f * KINETIC.tilt
      }
    }
    if (now >= g.kickAt) {
      g.vy += KINETIC.kick * size
      g.vz += KINETIC.kick * size * 0.5
      g.va += g.kickDir * 4
      g.kickAt = Infinity
    }
    for (let t = 0; t < dt - 1e-9; t += KINETIC.step) {
      const h = Math.min(KINETIC.step, dt - t)
      g.vx += (KINETIC.stiffness * (tx - g.ox) - KINETIC.damping * g.vx) * h
      g.vy += (KINETIC.stiffness * (ty - g.oy) - KINETIC.damping * g.vy) * h
      g.vz += (KINETIC.stiffness * (tz - g.oz) - KINETIC.damping * g.vz) * h
      g.va += (KINETIC.stiffness * (ta - g.a) - KINETIC.damping * g.va) * h
      g.ox += g.vx * h
      g.oy += g.vy * h
      g.oz += g.vz * h
      g.a += g.va * h
    }
    const eps = KINETIC.rest * size
    const still =
      Math.abs(g.ox) < eps &&
      Math.abs(g.oy) < eps &&
      Math.abs(g.oz) < eps &&
      Math.abs(g.a) < KINETIC.rest &&
      Math.abs(g.vx) + Math.abs(g.vy) + Math.abs(g.vz) < eps &&
      Math.abs(g.va) < KINETIC.rest &&
      g.kickAt === Infinity
    if (still) {
      g.ox = g.oy = g.oz = g.a = g.vx = g.vy = g.vz = g.va = 0
    } else moving = true
  }
  return moving
}

/** Sway of glyph `g` while a character holds the heading (phase = the holder's strain phase). */
export function sway(g: Glyph, size: number, phase: number): { bob: number; tilt: number } {
  const s = Math.sin(phase - (g.cx / size) * KINETIC.swayWave)
  return { bob: s * KINETIC.swayBob * size, tilt: s * KINETIC.swayTilt }
}

/**
 * Fill the shader's per-glyph arrays: `centers` (x, y of the rotation pivot) and `motion`
 * (offset x, y, z, tilt), everything scaled by `weight`. Glyphs past the end are zeroed.
 */
export function writeMotion(
  glyphs: Glyph[],
  centers: Float32Array,
  motion: Float32Array,
  weight: number,
  size: number,
  holdPhase: number | null,
) {
  motion.fill(0)
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i]!
    centers[i * 4] = g.cx
    centers[i * 4 + 1] = g.cy
    if (weight <= 0) continue
    const s = holdPhase === null ? { bob: 0, tilt: 0 } : sway(g, size, holdPhase)
    motion[i * 4] = g.ox * weight
    motion[i * 4 + 1] = (g.oy + s.bob) * weight
    motion[i * 4 + 2] = g.oz * weight
    motion[i * 4 + 3] = (g.a + s.tilt) * weight
  }
}
