import { describe, expect, it } from 'vitest'
import { glyphsFromBounds, KINETIC_MAX_GLYPHS, stepGlyphs, tap, writeMotion } from './kineticModel'

/** A row of `n` glyphs, 1 unit wide, on y ∈ [-1, 0] (font size 1). */
const row = (n: number) => glyphsFromBounds(Array.from({ length: n }, (_, i) => [i, -1, i + 1, 0]).flat())
const SIZE = 1

/** Run the springs for `seconds` at 60 fps; returns whether anything still moves. */
function run(glyphs: ReturnType<typeof row>, pointer: { x: number; y: number } | null, seconds: number, start = 0) {
  let moving = false
  for (let t = 0; t < seconds; t += 1 / 60) moving = stepGlyphs(glyphs, { size: SIZE, pointer }, start + t, 1 / 60)
  return moving
}

describe('kinetic headline (B1)', () => {
  it('takes glyph centres from troika bounds and caps the count', () => {
    const g = row(3)
    expect(g.map((x) => [x.cx, x.cy])).toEqual([
      [0.5, -0.5],
      [1.5, -0.5],
      [2.5, -0.5],
    ])
    expect(row(KINETIC_MAX_GLYPHS + 10)).toHaveLength(KINETIC_MAX_GLYPHS)
  })

  it('moves nothing at weight 0 — the handover shows the untouched heading', () => {
    const g = row(5)
    run(g, { x: 2.5, y: -0.5 }, 0.3)
    const centers = new Float32Array(KINETIC_MAX_GLYPHS * 4)
    const motion = new Float32Array(KINETIC_MAX_GLYPHS * 4).fill(9)
    writeMotion(g, centers, motion, 0, SIZE, 1.2)
    expect(motion.every((v) => v === 0)).toBe(true)
    expect(centers[4]).toBe(1.5)
  })

  it('pushes glyphs near the cursor away from it and towards the viewer', () => {
    const g = row(5)
    run(g, { x: 2.2, y: -0.5 }, 0.5)
    expect(g[1]!.ox).toBeLessThan(0) // left of the cursor → pushed left
    expect(g[3]!.ox).toBeGreaterThan(0)
    expect(g[2]!.oz).toBeGreaterThan(0)
    // far away from the cursor: untouched
    const far = row(20)
    run(far, { x: 0.5, y: -0.5 }, 0.5)
    expect(far[19]!.ox).toBe(0)
  })

  it('springs back to exactly rest once the cursor leaves', () => {
    const g = row(5)
    run(g, { x: 2.2, y: -0.5 }, 0.5)
    expect(run(g, null, 4)).toBe(false)
    expect(g.every((x) => x.ox === 0 && x.oy === 0 && x.oz === 0 && x.a === 0)).toBe(true)
  })

  it('a tap sends a wave: the glyph under the finger jumps first, then all settle', () => {
    const g = row(10)
    tap(g, 0.5, SIZE, 0)
    stepGlyphs(g, { size: SIZE, pointer: null }, 0, 1 / 60)
    expect(g[0]!.oy).toBeGreaterThan(0)
    expect(g[9]!.oy).toBe(0)
    expect(run(g, null, 4, 1 / 60)).toBe(false)
  })

  it('stays stable on a long frame (tab switch, slow phone)', () => {
    const g = row(5)
    for (let i = 0; i < 30; i++) stepGlyphs(g, { size: SIZE, pointer: { x: 2.2, y: -0.5 } }, i * 0.1, 0.1)
    expect(g.every((x) => Math.abs(x.ox) < 1 && Math.abs(x.oz) < 1)).toBe(true)
  })
})
