import { describe, expect, it } from 'vitest'
import { BODY } from '@/actors/rig'
import type { ElementSpec } from '@/experience/measure'
import { buildExhibit } from './exhibitModel'
import { pageStops } from './stops'
import { fitDistance, layoutWorld } from './layout'
import { dwellEase, ENTRANCE, KEY_UNITS, PASS_UNITS, scrollToUnits, timeline, totalUnits } from './timeline'

const stops = [{ key: true }, { key: false }, { key: true }]

describe('timeline', () => {
  it('starts at the beginning of the rail', () => {
    expect(timeline(0, stops)).toEqual({ entrance: 0, railIndex: 0, stop: -1 })
  })

  it('gives key stops more scroll than minor ones', () => {
    expect(totalUnits(stops)).toBeCloseTo(ENTRANCE + 2 * KEY_UNITS + PASS_UNITS)
  })

  it('reaches the entered point exactly when the entrance ends', () => {
    const t = timeline(ENTRANCE, stops)
    expect(t.entrance).toBe(1)
    expect(t.railIndex).toBeCloseTo(1)
  })

  it('stands exactly on each stop at the end of its segment', () => {
    expect(timeline(ENTRANCE + KEY_UNITS, stops).railIndex).toBeCloseTo(2)
    expect(timeline(ENTRANCE + KEY_UNITS + PASS_UNITS, stops).railIndex).toBeCloseTo(3)
    expect(timeline(totalUnits(stops), stops).railIndex).toBeCloseTo(4)
  })

  it('clamps out-of-range scroll', () => {
    expect(timeline(-5, stops).railIndex).toBe(0)
    expect(timeline(999, stops).railIndex).toBeCloseTo(4)
  })

  it('is monotonic', () => {
    let prev = -1
    for (let u = 0; u <= totalUnits(stops); u += 0.01) {
      const { railIndex } = timeline(u, stops)
      expect(railIndex).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = railIndex
    }
  })

  it('lingers at stops (slow ends, fast middle)', () => {
    const d = 0.02
    const nearEnd = dwellEase(d) - dwellEase(0)
    const middle = dwellEase(0.5 + d / 2) - dwellEase(0.5 - d / 2)
    expect(middle).toBeGreaterThan(nearEnd * 5)
  })

  it('maps the full scroll distance onto the full timeline', () => {
    expect(scrollToUnits(0, 1000, stops)).toBe(0)
    expect(scrollToUnits(1000, 1000, stops)).toBeCloseTo(totalUnits(stops))
    expect(scrollToUnits(5000, 1000, stops)).toBeCloseTo(totalUnits(stops))
    expect(scrollToUnits(10, 0, stops)).toBe(0)
  })
})

describe('layoutWorld', () => {
  const inputs = [
    { width: 3, height: 2, align: 'side' as const },
    { width: 1.5, height: 1.2, align: 'side' as const },
    { width: 2.2, height: 3.3, align: 'center' as const },
  ]
  const layout = layoutWorld(inputs, 16 / 9)

  it('has one rail point per stop plus start and entered', () => {
    expect(layout.rail).toHaveLength(5)
    expect(layout.look).toHaveLength(5)
  })

  it('moves forward (-z) stop after stop, viewpoints and exhibits alike', () => {
    const zs = layout.rail.map((p) => p[2])
    expect(zs).toEqual([...zs].sort((a, b) => b - a))
    const az = layout.stations.map((s) => s.anchor[2])
    expect(az).toEqual([...az].sort((a, b) => b - a))
  })

  it('keeps side exhibits clear of the camera path', () => {
    layout.stations.slice(0, 2).forEach((s, i) => {
      const halfWidth = inputs[i]!.width / 2
      const pathX = layout.rail[2 + i]![0] - (i % 2 === 0 ? -0.2 : 0.2)
      expect(Math.abs(s.anchor[0] - pathX) - halfWidth).toBeGreaterThan(0.5)
    })
  })

  it('places the camera far enough to fit each exhibit', () => {
    layout.stations.forEach((s, i) => {
      const dist = Math.hypot(s.viewpoint[0] - s.anchor[0], s.viewpoint[2] - s.anchor[2])
      expect(dist).toBeGreaterThanOrEqual(fitDistance(inputs[i]!.width, inputs[i]!.height, 16 / 9) - 1e-6)
    })
  })

  it('steps back further on portrait screens', () => {
    expect(fitDistance(3, 1, 9 / 16)).toBeGreaterThan(fitDistance(3, 1, 16 / 9))
  })

  it('turns side exhibits to face their viewpoint', () => {
    for (const s of layout.stations.slice(0, 2)) {
      const dx = s.viewpoint[0] - s.anchor[0]
      const dz = s.viewpoint[2] - s.anchor[2]
      expect(Math.sin(s.yaw) * dz - Math.cos(s.yaw) * dx).toBeCloseTo(0)
    }
  })
})

describe('pageStops', () => {
  it('lists every exhibit in page order, doors included', () => {
    const result = pageStops({
      title: 'x',
      blocks: [
        { type: 'hero', heading: ['Hi'], actions: [], tags: ['a'], helpers: [] },
        { type: 'door', label: 'Next', href: '/' },
      ],
    })
    expect(result.map((s) => [s.blockIndex, s.key, s.exhibit?.elements ?? null])).toEqual([
      [0, true, ['heading']],
      [0, false, ['tag-0']],
      [1, true, null],
    ])
  })
})

describe('buildExhibit', () => {
  const spec = (id: string, x: number, y: number, w: number, h: number): ElementSpec => ({
    id,
    kind: 'text',
    text: id,
    x,
    y,
    width: w,
    height: h,
    style: { fontSize: 16, fontWeight: 400, letterSpacing: 0, lineHeight: 1.2, color: '#000', align: 'left' },
    parts: [],
  })
  const specs = [spec('heading', 0, 0, 400, 100), spec('lead', 0, 120, 300, 20)]
  const k = 0.01

  it('lifts a held element above the character', () => {
    const m = buildExhibit(specs, ['heading'], [{ target: 'heading', actor: 'a', pose: 'holding', lines: ['x'] }], k)
    const heading = m.elements[0]!
    expect(heading.local[1] - (100 * k) / 2).toBeGreaterThan(BODY.height)
    expect(m.helpers[0]!.local[0]).toBeCloseTo(heading.local[0])
  })

  it('keeps a side helper clear of the elements and centres the whole group', () => {
    const m = buildExhibit(specs, ['heading', 'lead'], [{ target: 'lead', actor: 'a', pose: 'typing', lines: ['x'] }], k)
    const helperX = m.helpers[0]!.local[0]
    const leftEdge = Math.min(...m.elements.map((e) => e.local[0] - (e.spec.width * k) / 2))
    expect(leftEdge - helperX).toBeGreaterThan(0.6)
    expect(helperX - 0.6 + m.width / 2).toBeCloseTo(0) // left extent == -width/2
  })

  it('keeps 2D arrangement inside the group', () => {
    const m = buildExhibit(specs, ['heading', 'lead'], [], k)
    const [h, l] = m.elements
    expect(h!.local[1]).toBeGreaterThan(l!.local[1]) // heading above lead
    // centres are 50px and 130px from the top in 2D → 80px apart
    expect(h!.local[1] - l!.local[1]).toBeCloseTo(80 * k)
  })
})
