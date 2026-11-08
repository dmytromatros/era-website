import { describe, expect, it } from 'vitest'
import { trianglesOf, useXRay, xrayHue } from './xrayState'

describe('X-ray (B4)', () => {
  it('toggles on and off', () => {
    useXRay.getState().set(false)
    useXRay.getState().toggle()
    expect(useXRay.getState().on).toBe(true)
    useXRay.getState().toggle()
    expect(useXRay.getState().on).toBe(false)
  })

  it('gives neighbouring draw calls clearly different hues', () => {
    for (let i = 0; i < 200; i++) {
      const d = Math.abs(xrayHue(i).h - xrayHue(i + 1).h)
      expect(Math.min(d, 1 - d)).toBeGreaterThan(0.2)
    }
  })

  it('counts triangles from the geometry, times instances', () => {
    expect(trianglesOf(36, 24, 1)).toBe(12) // indexed box
    expect(trianglesOf(null, 6, 1)).toBe(2) // non-indexed quad
    expect(trianglesOf(36, 24, 40)).toBe(480) // forty instanced boxes
  })
})
