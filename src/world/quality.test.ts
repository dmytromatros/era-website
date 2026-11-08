import { beforeEach, describe, expect, it } from 'vitest'
import { LEVELS, QUALITY, useQuality } from './quality'

describe('quality levels', () => {
  beforeEach(() => useQuality.setState({ level: 'high', forced: false }))

  it('starts at high (what the site always rendered)', () => {
    expect(useQuality.getState().level).toBe('high')
  })

  it('steps down and up one level at a time, and stops at the ends', () => {
    const { step } = useQuality.getState()
    step(-1)
    expect(useQuality.getState().level).toBe('medium')
    step(-1)
    step(-1)
    expect(useQuality.getState().level).toBe('low')
    step(1)
    expect(useQuality.getState().level).toBe('medium')
    step(1)
    step(1)
    expect(useQuality.getState().level).toBe('high')
  })

  it('does not move a level forced by the URL', () => {
    useQuality.setState({ level: 'low', forced: true })
    useQuality.getState().step(1)
    expect(useQuality.getState().level).toBe('low')
  })

  it('gets cheaper with every step down', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const lower = QUALITY[LEVELS[i - 1]!]
      const higher = QUALITY[LEVELS[i]!]
      expect(lower.dpr).toBeLessThanOrEqual(higher.dpr)
      expect(lower.multisampling).toBeLessThanOrEqual(higher.multisampling)
      expect(Number(lower.outlines)).toBeLessThanOrEqual(Number(higher.outlines))
      expect(Number(lower.liveDetails)).toBeLessThanOrEqual(Number(higher.liveDetails))
    }
  })
})
