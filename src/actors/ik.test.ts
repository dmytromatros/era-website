import { describe, expect, it } from 'vitest'
import { cross, endPoint, lowerBend, solveTwoBone, upperBasis, type Joint, type V3 } from './ik'

const L1 = 0.29
const L2 = 0.29
const close = (a: V3, b: V3, eps = 1e-4) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, -Math.log10(eps)))
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

describe('two-bone IK (C1)', () => {
  it('reaches a target inside its range exactly', () => {
    for (const target of [
      [0.1, -0.3, 0.2],
      [0.3, 0.2, -0.1],
      [0, 0.45, 0],
      [-0.2, -0.2, 0.25],
    ] as V3[]) {
      const s = solveTwoBone(target, L1, L2, [0, 0, -1])
      expect(s.stretch).toBe(1)
      close(endPoint(s, L1, L2), target)
    }
  })

  it('straightens towards a target out of reach, and stretches only when allowed', () => {
    const far: V3 = [0, 0.8, 0]
    const rigid = solveTwoBone(far, L1, L2, [1, 0, 0])
    expect(rigid.bend).toBeLessThan(0.01)
    close(rigid.dir, [0, 1, 0], 1e-2)
    expect(rigid.stretch).toBe(1)

    const springy = solveTwoBone(far, L1, L2, [1, 0, 0], 1.5)
    expect(springy.stretch).toBeCloseTo(0.8 / 0.58, 4)
    close(endPoint(springy, L1, L2), far, 1e-3)
    // …but never beyond the allowed factor.
    expect(solveTwoBone([0, 3, 0], L1, L2, [1, 0, 0], 1.25).stretch).toBe(1.25)
  })

  it('bends the middle joint towards the pole', () => {
    const target: V3 = [0, -0.4, 0] // straight down, closer than full length → must bend
    const knee = solveTwoBone(target, L1, L2, [0, 0, 1])
    const elbow = solveTwoBone(target, L1, L2, [0, 0, -1])
    expect(knee.dir[2]).toBeGreaterThan(0) // knee forward
    expect(elbow.dir[2]).toBeLessThan(0) // elbow back
    expect(knee.bend).toBeGreaterThan(0.5)
  })

  it('gives a right-handed orthonormal basis for the upper bone', () => {
    const s = solveTwoBone([0.2, 0.1, 0.3], L1, L2, [0.5, -0.3, -1])
    for (const joint of ['elbow', 'knee'] as Joint[]) {
      const [x, y, z] = upperBasis(s, joint)
      for (const v of [x, y, z]) expect(Math.hypot(...v)).toBeCloseTo(1, 6)
      expect(dot(x, y)).toBeCloseTo(0, 6)
      expect(dot(y, z)).toBeCloseTo(0, 6)
      close(cross(x, y), z, 1e-6)
    }
  })

  /** Lower bone direction the rig produces from upperBasis + lowerBend (rotation.x around X). */
  function rigLowerDir(target: V3, l1: number, l2: number, pole: V3, joint: Joint): V3 {
    const s = solveTwoBone(target, l1, l2, pole)
    const [, y, z] = upperBasis(s, joint)
    const r = lowerBend(s, joint)
    // Rx(r)·(0, −1, 0) = (0, −cos r, −sin r) in the upper bone's space.
    return [0, 1, 2].map((i) => -Math.cos(r) * y[i]! - Math.sin(r) * z[i]!) as V3
  }

  it('maps onto the rig so the limb really reaches the target (elbow and knee conventions)', () => {
    for (const [joint, pole, target] of [
      ['elbow', [0.6, -0.4, -1], [0.15, 0.2, 0.3]],
      ['knee', [0, 0, 1], [0, -0.5, -0.05]],
    ] as [Joint, V3, V3][]) {
      const s = solveTwoBone(target, 0.3, 0.3, pole)
      const lower = rigLowerDir(target, 0.3, 0.3, pole, joint)
      const elbow: V3 = [s.dir[0] * 0.3, s.dir[1] * 0.3, s.dir[2] * 0.3]
      close([elbow[0] + lower[0] * 0.3, elbow[1] + lower[1] * 0.3, elbow[2] + lower[2] * 0.3], target, 1e-3)
    }
  })

  it('never turns a standing leg round: nearly straight and straight give the rest pose', () => {
    // The sole straight under the hip, then a hair closer (the body breathes down 1–6 mm).
    for (const dip of [0, 0.001, 0.006, 0.03]) {
      const s = solveTwoBone([0, -(0.62 - dip), 0], 0.31, 0.31, [0, 0, 1])
      const [x, , z] = upperBasis(s, 'knee')
      expect(x[0]).toBeGreaterThan(0.99) // X stays +x (was −x: turned 180° round the leg)
      expect(z[2]).toBeGreaterThan(0.95) // the leg's front stays at the front
      expect(lowerBend(s, 'knee')).toBeGreaterThanOrEqual(0) // knees bend back, the natural way
    }
    // An arm hanging straight vs a hair bent: the same basis (no flip at bend 0), front at the front.
    const [straight, bent] = [0, 0.004].map((dip) => solveTwoBone([0, -(0.58 - dip), 0], 0.29, 0.29, [0.6, -0.4, -1]))
    const zs = upperBasis(straight!, 'elbow')[2]
    const zb = upperBasis(bent!, 'elbow')[2]
    expect(dot(zs, zb)).toBeGreaterThan(0.99)
    expect(zb[2]).toBeGreaterThan(0.8) // forward (and a little out: the elbow points out-back)
    expect(lowerBend(bent!, 'elbow')).toBeLessThanOrEqual(0)
  })

  it('keeps a foot on a lower or higher step (walking characters, later)', () => {
    // Hip dipped to 0.58 above the floor (legs 0.31 + 0.31): the sole lands on the step under it.
    for (const step of [-0.03, 0.12, 0.2, 0.3]) {
      const target: V3 = [0, step - 0.58, 0.05]
      const s = solveTwoBone(target, 0.31, 0.31, [0, 0, 1])
      close(endPoint(s, 0.31, 0.31), target, 1e-3)
    }
  })
})
