import { describe, expect, it } from 'vitest'
import { FILM, HANDS, filmAt, handsAt, pressAt, project, slitAxes, tearPoint, unproject } from './handsModel'

const WIDE = { aspect: 1280 / 800, fov: 42 }
const TALL = { aspect: 517 / 709, fov: 42 }
const CENTRE = { x: 0.5, y: 0.5 }

describe('hands (D1)', () => {
  it('are not there at the top, nor once the film is torn', () => {
    expect(handsAt(0, CENTRE, WIDE).visible).toBe(false)
    expect(handsAt(HANDS.end, CENTRE, WIDE).visible).toBe(false)
    expect(handsAt(1, CENTRE, WIDE).visible).toBe(false)
    expect(handsAt(0.1, CENTRE, WIDE).visible).toBe(true)
  })

  it('rise from below the frame and leave below it', () => {
    for (const view of [WIDE, TALL]) {
      for (const e of [0.001, HANDS.end - 0.001]) {
        const { palms } = handsAt(e, { x: 0.7, y: 0.68 }, view)
        for (const p of palms) expect(p.y).toBeLessThan(-0.1)
      }
    }
  })

  it('press on the tear point: it lies between the palms', () => {
    for (const view of [WIDE, TALL]) {
      for (const tear of [CENTRE, { x: 0.3, y: 0.35 }, { x: 0.7, y: 0.68 }]) {
        const { palms, press } = handsAt(0.11, tear, view)
        expect(press).toBeGreaterThan(0.9)
        expect((palms[0].x + palms[1].x) / 2).toBeCloseTo(tear.x, 3)
        for (const p of palms) expect(p.y).toBeCloseTo(tear.y, 3)
        expect(palms[0].x).toBeLessThan(tear.x)
        expect(palms[1].x).toBeGreaterThan(tear.x)
        // Both palms inside the frame.
        for (const p of palms) {
          expect(p.x).toBeGreaterThan(0)
          expect(p.x).toBeLessThan(1)
        }
      }
    }
  })

  it('stay in the frame while spread, also on a tall screen', () => {
    for (const view of [WIDE, TALL]) {
      for (const e of [0.2, 0.26]) {
        const { palms } = handsAt(e, CENTRE, view)
        expect(palms[0].x).toBeGreaterThan(0.08)
        expect(palms[1].x).toBeLessThan(0.92)
      }
    }
  })

  it('pull apart while the slit opens', () => {
    const gap = (e: number) => {
      const { palms } = handsAt(e, CENTRE, WIDE)
      return palms[1].x - palms[0].x
    }
    expect(gap(0.3)).toBeGreaterThan(gap(0.1) * 2)
  })

  it('move smoothly (no jumps between nearby scroll positions)', () => {
    let prev = handsAt(0, CENTRE, WIDE)
    for (let e = 0.001; e <= 0.5; e += 0.001) {
      const next = handsAt(e, CENTRE, WIDE)
      for (const side of ['left', 'right'] as const) {
        for (let i = 0; i < 3; i++) {
          expect(Math.abs(next[side].position[i]! - prev[side].position[i]!)).toBeLessThan(0.02)
          expect(Math.abs(next[side].rotation[i]! - prev[side].rotation[i]!)).toBeLessThan(0.05)
        }
      }
      prev = next
    }
  })

  it('project / unproject are inverse', () => {
    const uv = { x: 0.31, y: 0.77 }
    const p = project(unproject(uv, 0.7, TALL), TALL)
    expect(p.x).toBeCloseTo(uv.x, 6)
    expect(p.y).toBeCloseTo(uv.y, 6)
  })
})

describe('film under the hands (D1)', () => {
  it('keeps the entrance order: intact at the top, fully torn by e = 0.42', () => {
    expect(filmAt(0)).toEqual({ open: 0, push: 0 })
    expect(filmAt(FILM.open[1]).open).toBe(1)
    expect(filmAt(0.42).push).toBe(0)
  })

  it('stretches while the palms press, before it tears', () => {
    expect(filmAt(0.11).push).toBeGreaterThan(FILM.push * 0.9)
    expect(pressAt(0)).toBe(0)
    expect(pressAt(0.3)).toBe(0)
  })

  it('opens as an upright slit just inside the palms', () => {
    const at = (e: number) => slitAxes(filmAt(e).open, handsAt(e, CENTRE, WIDE).palms, 10)
    expect(at(0.05)).toEqual([0, 0]) // pressing, not torn yet
    for (const e of [0.2, 0.26]) {
      const { palms } = handsAt(e, CENTRE, WIDE)
      const [w, h] = at(e)
      expect(h).toBeGreaterThan(w)
      expect(w).toBeLessThan(((palms[1].x - palms[0].x) / 2) * 10) // the palms stay outside it
      expect(w).toBeGreaterThan(((palms[1].x - palms[0].x) / 2) * 10 * 0.6)
    }
    expect(at(0.3)[0]).toBeGreaterThan(at(0.14)[0] * 2) // widens as they pull apart
  })
})

describe('tear point', () => {
  it('is the centre on a touch screen, the pointer (clamped) otherwise', () => {
    expect(tearPoint({ x: 0.9, y: 0.1 }, true)).toEqual(CENTRE)
    expect(tearPoint({ x: 0.55, y: 0.5 }, false)).toEqual({ x: 0.55, y: 0.5 })
    expect(tearPoint({ x: 0.95, y: 0.02 }, false)).toEqual({ x: 0.7, y: 0.35 })
  })
})
