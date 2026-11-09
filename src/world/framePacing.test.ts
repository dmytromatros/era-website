import { describe, expect, it } from 'vitest'
import { FRAME_MS, landingIsStill, notePark, pace, pacer, PARK_AFTER_MS, wake, wakeByPointer } from './framePacing'

/** Drawn frames per second when vsync comes at `hz` (with a little timestamp jitter). */
function fpsAt(hz: number, seconds = 5): number {
  let next = 0
  let drawn = 0
  for (let i = 0; i < hz * seconds; i++) {
    const now = (i * 1000) / hz + (i % 3 === 0 ? 0.3 : -0.2)
    const r = pace(now, next)
    next = r.next
    if (r.draw) drawn++
  }
  return drawn / seconds
}

describe('frame pacer', () => {
  it('draws at most 60 frames a second on any screen', () => {
    expect(fpsAt(60)).toBeCloseTo(60, -0.5)
    expect(fpsAt(120)).toBeCloseTo(60, -0.5)
    expect(fpsAt(144)).toBeGreaterThan(55)
    expect(fpsAt(144)).toBeLessThanOrEqual(60.5)
    expect(fpsAt(240)).toBeLessThanOrEqual(60.5)
  })

  it('never skips a 60 Hz vsync and draws every other one at 120 Hz', () => {
    let next = 0
    const at60 = Array.from({ length: 10 }, (_, i) => {
      const r = pace(i * FRAME_MS, next)
      next = r.next
      return r.draw
    })
    expect(at60.every(Boolean)).toBe(true)
    next = 0
    const at120 = Array.from({ length: 10 }, (_, i) => {
      const r = pace((i * FRAME_MS) / 2, next)
      next = r.next
      return r.draw
    })
    expect(at120).toEqual([true, false, true, false, true, false, true, false, true, false])
  })

  it('a slow device keeps drawing as fast as it can, without catching up in a burst', () => {
    let next = 0
    let drawn = 0
    for (let now = 0; now < 1000; now += 40) {
      const r = pace(now, next)
      next = r.next
      if (r.draw) drawn++
    }
    expect(drawn).toBe(25) // every 40 ms frame
  })

  it('parks only on a ready, untouched landing', () => {
    const still = { handedOver: false, scrollPx: 0, progress: 0, ready: true, portalBusy: false }
    expect(landingIsStill(still)).toBe(true)
    expect(landingIsStill({ ...still, ready: false })).toBe(false) // texts still building
    expect(landingIsStill({ ...still, scrollPx: 10 })).toBe(false)
    expect(landingIsStill({ ...still, progress: 0.001 })).toBe(false) // gliding back to the top
    expect(landingIsStill({ ...still, handedOver: true })).toBe(false)
    expect(landingIsStill({ ...still, portalBusy: true })).toBe(false)
  })

  it('parks after the same real time on a fast and a slow device, and wakes at once', () => {
    for (const fps of [60, 7]) {
      wake()
      let t = 0
      while (!pacer.parked && t < 5000) {
        notePark(true, t)
        t += 1000 / fps
      }
      expect(t).toBeGreaterThanOrEqual(PARK_AFTER_MS)
      expect(t).toBeLessThan(fps === 7 ? 1800 : 1000) // ≈ 0.8 s (10 frames minimum at 7 fps)
    }
    wake()
    expect(pacer.parked).toBe(false)
    notePark(true, 0)
    notePark(false, 10_000) // anything moving resets the wait
    notePark(true, 10_100)
    expect(pacer.parked).toBe(false)
  })

  it('the pointer wakes a parked landing to draw the film only; anything else, the whole world', () => {
    const park = () => {
      wake()
      for (let t = 0; !pacer.parked; t += 100) notePark(true, t)
    }
    park()
    wakeByPointer()
    expect(pacer.parked).toBe(false)
    expect(pacer.membraneOnly).toBe(true)
    wake() // scroll, resize, theme…
    expect(pacer.membraneOnly).toBe(false)
    // Not parked (still warming up the GPU): the pointer changes nothing.
    wakeByPointer()
    expect(pacer.membraneOnly).toBe(false)
  })

  it('with waves still moving, a warmed-up landing draws the film only, then parks', () => {
    wake()
    let t = 0
    for (; t < PARK_AFTER_MS + 200; t += 16) notePark(true, t, true)
    expect(pacer.parked).toBe(false)
    expect(pacer.membraneOnly).toBe(true)
    notePark(true, t, false) // the waves died out
    expect(pacer.parked).toBe(true)
    wake()
  })
})
