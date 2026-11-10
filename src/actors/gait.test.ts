import { describe, expect, it } from 'vitest'
import { GAIT, gaitAt } from './gait'

describe('character walk (D3)', () => {
  it('a foot on the floor stays put in the world while the body walks over it', () => {
    for (const i of [0, 1] as const) {
      let world: number | null = null
      for (let walked = 0; walked < 3; walked += 0.005) {
        const [, lift, z] = gaitAt(walked, 0.14).feet[i]
        if (lift === 0 && z > -GAIT.stride / 2 + 1e-6 && z < GAIT.stride / 2 - 1e-6) {
          const w = walked + z // the body is at `walked`, the foot `z` ahead of it
          if (world === null || Math.abs(w - world) > 0.05) world = w // a new step
          expect(w).toBeCloseTo(world, 6)
        }
      }
    }
  })

  it('one foot is always on the floor, the other swings forward in an arc', () => {
    for (let walked = 0; walked < 3; walked += 0.01) {
      const [l, r] = gaitAt(walked, 0.14).feet
      expect(Math.min(l[1], r[1])).toBe(0)
      expect(Math.max(l[1], r[1])).toBeLessThanOrEqual(GAIT.lift + 1e-9)
    }
  })

  it('swings the left arm forward with the right foot', () => {
    // Right foot just landed in front (start of its stance): walked = stride.
    const g = gaitAt(GAIT.stride, 0.14)
    expect(g.feet[1][2]).toBeCloseTo(GAIT.stride / 2, 6)
    expect(g.swing).toBeGreaterThan(0)
  })

  it('keeps the feet apart sideways', () => {
    const [l, r] = gaitAt(1.234, 0.14).feet
    expect(l[0]).toBeLessThan(0)
    expect(r[0]).toBeGreaterThan(0)
  })
})
