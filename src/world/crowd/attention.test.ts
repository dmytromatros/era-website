import { describe, expect, it } from 'vitest'
import { ATTENTION, attentionWeight } from './attention'

describe("the camera's attention", () => {
  const call = { at: [0, 0, 0] as [number, number, number], start: 10, dur: 2 }
  it('eases in, holds, eases out — and is zero outside', () => {
    expect(attentionWeight(9.99, call)).toBe(0)
    expect(attentionWeight(10, call)).toBe(0)
    expect(attentionWeight(10 + ATTENTION.in / 2, call)).toBeGreaterThan(0.3)
    expect(attentionWeight(11, call)).toBe(1)
    expect(attentionWeight(12 + ATTENTION.out / 2, call)).toBeLessThan(0.7)
    expect(attentionWeight(12 + ATTENTION.out + 0.01, call)).toBe(0)
    expect(attentionWeight(50, { ...call, start: -Infinity })).toBe(0)
  })
  it('no jumps: small steps in time give small steps in weight', () => {
    let prev = 0
    for (let t = 9; t < 14; t += 0.01) {
      const w = attentionWeight(t, call)
      expect(Math.abs(w - prev)).toBeLessThan(0.05)
      prev = w
    }
  })
})
