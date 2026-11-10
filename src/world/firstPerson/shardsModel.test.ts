import { describe, expect, it } from 'vitest'
import { SHARDS, shardAt } from './shardsModel'

const ORIGIN: [number, number, number] = [0, 2.6, 3.7]

describe('shards of the film (D1)', () => {
  it('exist only for SHARDS.life seconds after the crack', () => {
    expect(shardAt(0, -0.01, ORIGIN)).toBeNull()
    expect(shardAt(0, SHARDS.life, ORIGIN)).toBeNull()
    expect(shardAt(0, 0.5, ORIGIN)).not.toBeNull()
  })

  it('fly towards the camera and fall, and shrink away at the end', () => {
    for (let i = 0; i < 40; i++) {
      const a = shardAt(i, 0.2, ORIGIN)!
      const b = shardAt(i, 1, ORIGIN)!
      expect(b.position[2]).toBeGreaterThan(a.position[2] + 1)
      expect(b.position[1]).toBeLessThan(a.position[1])
      expect(shardAt(i, SHARDS.life - 0.001, ORIGIN)!.scale).toBeLessThan(0.01)
    }
  })

  it('start on the film around the burst point', () => {
    for (let i = 0; i < 40; i++) {
      const s = shardAt(i, 0, ORIGIN)!
      expect(Math.hypot(s.position[0] - ORIGIN[0], s.position[1] - ORIGIN[1])).toBeLessThanOrEqual(SHARDS.spread + 1e-9)
      expect(s.position[2]).toBeCloseTo(ORIGIN[2], 1)
    }
  })

  it('are deterministic', () => {
    expect(shardAt(7, 0.4, ORIGIN)).toEqual(shardAt(7, 0.4, ORIGIN))
  })
})
