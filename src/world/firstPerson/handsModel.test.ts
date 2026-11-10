import { describe, expect, it } from 'vitest'
import { bodyToCamera, kickAt } from './breakModel'
import { HANDS, LOOK, glanceYaw, handsAt, palmNormal, qRotate as qRotateTest, walkHandsAt, leanAt, palmPoint, project, sleeveEnd, tearPoint, unproject, type Crack, type HandPose, type View } from './handsModel'

const WIDE: View = { aspect: 1280 / 800, fov: 42 }
const TALL: View = { aspect: 517 / 709, fov: 42 }
const PHONE: View = { aspect: 375 / 812, fov: 42 }
const VIEWS = [WIDE, TALL, PHONE]
const CENTRE = { x: 0.5, y: 0.5 }
const TEARS = [CENTRE, { x: 0.3, y: 0.35 }, { x: 0.7, y: 0.68 }]
const BEFORE = [0.001, 0.03, 0.06, 0.09, 0.12]
const crack = (t: number, side: -1 | 1 = 1, look = 1): Crack => ({ t, side, look })

describe('hands (D1): leaning on the film', () => {
  it('are not there at the top', () => {
    expect(handsAt(0, CENTRE, WIDE).visible).toBe(false)
    expect(handsAt(0.1, CENTRE, WIDE).visible).toBe(true)
  })

  it('rise from below the frame', () => {
    for (const view of VIEWS) {
      for (const p of handsAt(0.001, { x: 0.7, y: 0.68 }, view).palms) expect(p.y).toBeLessThan(-0.1)
    }
  })

  it('lean on the tear point: it lies between the palms, both in the frame', () => {
    for (const view of VIEWS) {
      for (const tear of TEARS) {
        const { palms, press } = handsAt(0.12, tear, view)
        expect(press).toBeGreaterThan(0.9)
        expect((palms[0].x + palms[1].x) / 2).toBeCloseTo(tear.x, 2)
        for (const p of palms) {
          expect(p.y).toBeCloseTo(tear.y, 2)
          expect(p.x).toBeGreaterThan(0.03)
          expect(p.x).toBeLessThan(0.97)
        }
        expect(palms[0].x).toBeLessThan(tear.x)
        expect(palms[1].x).toBeGreaterThan(tear.x)
      }
    }
  })

  it('press harder as the visitor scrolls', () => {
    expect(leanAt(0)).toBe(0)
    expect(leanAt(0.08)).toBeGreaterThan(0.3)
    expect(leanAt(0.13)).toBe(1)
  })

  it('never cross their sleeves — on a phone, a tall and a wide screen, before and after the crack', () => {
    for (const view of VIEWS) {
      for (const tear of TEARS) {
        const poses = [...BEFORE.map((e) => handsAt(e, tear, view)), ...[0, 0.1, 0.2, 0.3, 0.45, 0.55].map((t) => handsAt(0.14, tear, view, crack(t)))]
        for (const p of poses) {
          const l = sleeveEnd(p.left)
          const r = sleeveEnd(p.right)
          // The elbow ends are apart by more than two sleeves' width, each on its own side.
          expect(r[0] - l[0]).toBeGreaterThan(0.2)
          expect(l[0]).toBeLessThan(-0.1)
          expect(r[0]).toBeGreaterThan(0.1)
        }
      }
    }
  })

  it('their sleeves leave the frame (no cut-off end in view)', () => {
    for (const view of VIEWS) {
      for (const tear of TEARS) {
        for (const e of BEFORE) {
          const p = handsAt(e, tear, view)
          for (const h of [p.left, p.right]) {
            const end = sleeveEnd(h)
            // Behind the camera, or outside the picture at its depth.
            const uv = project(end, view)
            expect(end[2] > -0.1 || uv.y < 0 || uv.x < 0 || uv.x > 1).toBe(true)
          }
        }
      }
    }
  })

  it('move smoothly (no jumps between nearby scroll positions)', () => {
    let prev = handsAt(0, CENTRE, PHONE)
    for (let e = 0.001; e <= 0.13; e += 0.001) {
      const next = handsAt(e, CENTRE, PHONE)
      for (const side of ['left', 'right'] as const) {
        for (let i = 0; i < 3; i++) expect(Math.abs(next[side].position[i]! - prev[side].position[i]!)).toBeLessThan(0.03)
        for (let i = 0; i < 4; i++) expect(Math.abs(next[side].quaternion[i]! - prev[side].quaternion[i]!)).toBeLessThan(0.05)
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

describe('hands (D1): after the crack', () => {
  it('lose their support: fall out of the frame, the slipping hand first, then are not drawn', () => {
    for (const view of VIEWS) {
      const mid = handsAt(0.14, CENTRE, view, crack(0.3, -1))
      // The left one slipped: it is lower than the right one by now.
      expect(mid.palms[0].y).toBeLessThan(mid.palms[1].y)
      const late = handsAt(0.14, CENTRE, view, crack(HANDS.lag + HANDS.fall - 0.01, -1))
      for (const p of late.palms) expect(p.y).toBeLessThan(0)
      expect(handsAt(0.14, CENTRE, view, crack(HANDS.lag + HANDS.fall)).visible).toBe(false)
    }
  })

  it('stop pressing the moment the film gives way', () => {
    expect(handsAt(0.14, CENTRE, WIDE, crack(0)).press).toBe(0)
  })
})

describe('hands (D1): the confused look', () => {
  /** Where a hand's palm is in the picture of the kicked camera (hands hang on the body). */
  const seen = (h: HandPose, view: View, t: number, side: -1 | 1, look: number) => {
    const k = kickAt(t, side, look, 1, glanceYaw(view))
    const p = bodyToCamera(palmPoint(h), k)
    if (p[2] > -0.05) return { x: -1, y: -1 }
    return project(p, { aspect: view.aspect, fov: view.fov + k.fov })
  }
  const inFrame = (uv: { x: number; y: number }) => uv.x > 0 && uv.x < 1 && uv.y > 0 && uv.y < 1

  it('the hands are out of the picture when they stop being drawn and when they come back (no pop)', () => {
    for (const view of VIEWS) {
      for (const side of [-1, 1] as const) {
        for (const t of [HANDS.lag + HANDS.fall - 0.005, LOOK.in[0] + 0.005]) {
          const p = handsAt(0.14, CENTRE, view, crack(t, side))
          for (const h of [p.left, p.right]) expect(inFrame(seen(h, view, t, side, 1))).toBe(false)
        }
      }
    }
  })

  it('the head looks at the left hand, then the right one — each in the picture', () => {
    for (const view of VIEWS) {
      const atLeft = handsAt(0.14, CENTRE, view, crack(2.1))
      expect(atLeft.visible).toBe(true)
      const l = seen(atLeft.left, view, 2.1, 1, 1)
      expect(inFrame(l)).toBe(true)
      expect(Math.abs(l.x - 0.5)).toBeLessThan(0.2) // looked at: near the middle
      const atRight = handsAt(0.14, CENTRE, view, crack(2.85))
      const r = seen(atRight.right, view, 2.85, 1, 1)
      expect(inFrame(r)).toBe(true)
      expect(Math.abs(r.x - 0.5)).toBeLessThan(0.2)
      // While looking at both (before the first glance), both are in the picture.
      const both = handsAt(0.14, CENTRE, view, crack(1.62))
      for (const h of [both.left, both.right]) expect(inFrame(seen(h, view, 1.62, 1, 1))).toBe(true)
    }
  })

  it('no look (the visitor scrolled on): the hands stay out of the picture', () => {
    expect(handsAt(0.4, CENTRE, WIDE, crack(2.1, 1, 0)).visible).toBe(false)
  })

  it('the hands do not overlap while looking (also on a phone)', () => {
    for (const view of VIEWS) {
      for (const t of [1.7, 2.1, 2.5, 2.85, 3.4]) {
        const p = handsAt(0.14, CENTRE, view, crack(t))
        const l = seen(p.left, view, t, 1, 1)
        const r = seen(p.right, view, t, 1, 1)
        // Palm centres apart by more than a palm and a thumb (≈ 0.12 m) seen at their depth.
        const depth = -bodyToCamera(palmPoint(p.right), kickAt(t, 1, 1, 1, glanceYaw(view)))[2]
        const apart = ((r.x - l.x) * 2 * Math.tan((21 * Math.PI) / 180) * view.aspect * depth)
        expect(apart).toBeGreaterThan(0.12)
      }
    }
  })

  it('the sleeves do not cross while looking either', () => {
    for (const view of VIEWS) {
      for (const t of [1.7, 2.1, 2.5, 2.85, 3.4]) {
        const p = handsAt(0.14, CENTRE, view, crack(t))
        expect(sleeveEnd(p.right)[0] - sleeveEnd(p.left)[0]).toBeGreaterThan(0.2)
      }
    }
  })
})

describe('hands (D2): walking', () => {
  it('are not there standing still', () => {
    expect(walkHandsAt({ phase: 1, moving: 0, run: 0 }, WIDE).visible).toBe(false)
  })

  it('peek into the bottom of the frame as they swing forward, never up to the cards', () => {
    for (const view of VIEWS) {
      for (const run of [0, 1]) {
        let top = -Infinity
        for (let phase = 0; phase < Math.PI * 2; phase += 0.05) {
          const p = walkHandsAt({ phase, moving: 1, run }, view)
          for (const uv of p.palms) top = Math.max(top, uv.y)
          expect(sleeveEnd(p.right, 'straight')[0] - sleeveEnd(p.left, 'straight')[0]).toBeGreaterThan(0.2)
        }
        expect(top).toBeGreaterThan(-0.15) // a palm comes close enough for the fingers to show
        expect(top).toBeLessThan(0.3) // and stays in the bottom part
      }
    }
  })

  it('palms face in, towards each other, all through the swing', () => {
    for (const view of VIEWS) {
      for (let phase = 0; phase < Math.PI * 2; phase += 0.2) {
        const p = walkHandsAt({ phase, moving: 1, run: 0.5 }, view)
        expect(palmNormal(p.left)[0]).toBeGreaterThan(0.8) // left palm → right
        expect(palmNormal(p.right)[0]).toBeLessThan(-0.8)
      }
    }
  })

  it('bend at the elbow: the forearm runs out and down to an elbow outside the picture', () => {
    for (const view of VIEWS) {
      for (let phase = 0; phase < Math.PI * 2; phase += 0.3) {
        const p = walkHandsAt({ phase, moving: 1, run: 0.5 }, view)
        for (const [h, side] of [[p.left, -1], [p.right, 1]] as const) {
          const end = sleeveEnd(h, 'straight')
          expect(end[0] * side).toBeGreaterThan(h.position[0] * side) // out
          expect(end[1]).toBeLessThan(h.position[1]) // down
          const uv = project(end, view)
          expect(end[2] > -0.1 || uv.y < 0 || uv.x < 0 || uv.x > 1).toBe(true) // the elbow is off-screen
        }
      }
    }
  })

  it('have a straight wrist: the fingers carry on from the forearm (no hand bent sideways)', () => {
    for (const view of VIEWS) {
      for (let phase = 0; phase < Math.PI * 2; phase += 0.3) {
        const p = walkHandsAt({ phase, moving: 1, run: 0.5 }, view)
        for (const [h, side] of [[p.left, -1], [p.right, 1]] as const) {
          const fingers = qRotateTest(h.quaternion, [0, 1, 0])
          // Fingers point forward (−z) and a little in — never out to the side.
          expect(fingers[2]).toBeLessThan(-0.5)
          expect(fingers[0] * -side).toBeGreaterThan(-0.05)
        }
      }
    }
  })

  it('swing in turn (left forward while right back)', () => {
    const p = walkHandsAt({ phase: Math.PI / 2, moving: 1, run: 0 }, WIDE)
    expect(p.palms[0].y).toBeGreaterThan(p.palms[1].y)
    const q = walkHandsAt({ phase: -Math.PI / 2, moving: 1, run: 0 }, WIDE)
    expect(q.palms[1].y).toBeGreaterThan(q.palms[0].y)
  })
})

describe('tear point', () => {
  it('is the centre on a touch screen, the pointer (clamped) otherwise', () => {
    expect(tearPoint({ x: 0.9, y: 0.1 }, true)).toEqual(CENTRE)
    expect(tearPoint({ x: 0.55, y: 0.5 }, false)).toEqual({ x: 0.55, y: 0.5 })
    expect(tearPoint({ x: 0.95, y: 0.02 }, false)).toEqual({ x: 0.7, y: 0.35 })
  })
})
