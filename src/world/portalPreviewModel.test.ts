import { describe, expect, it } from 'vitest'
import { readPage } from '@/content/read'
import type { Vec3 } from './layout'
import { buildPreview, cullInFront, doorZ, PREVIEW_BACK, previewTransform, toDoor } from './portalPreviewModel'

describe('portal preview (B2)', () => {
  it('puts the arrival viewpoint just behind the door, looking straight in', () => {
    const cases: [Vec3, Vec3][] = [
      [[0, 1.7, 0], [0, 1.3, -5]],
      [[3, 1.7, -2], [8, 1.3, -2]],
      [[-4, 1.7, 6], [-4, 1.3, 11]],
      [[1, 1.7, 1], [-2, 1.3, 4]],
    ]
    for (const [viewpoint, focus] of cases) {
      const t = previewTransform(viewpoint, focus)
      const [vx, vz] = toDoor(t, viewpoint[0], viewpoint[2])
      expect(vx).toBeCloseTo(0)
      expect(vz).toBeCloseTo(-PREVIEW_BACK)
      const [fx, fz] = toDoor(t, focus[0], focus[2])
      expect(fx).toBeCloseTo(0) // straight ahead…
      expect(fz).toBeLessThan(vz) // …and further in
    }
  })

  it('turns the other world along the line the visitor looks through the door', () => {
    const look: [number, number] = [0.2, -Math.sqrt(1 - 0.04)]
    const t = previewTransform([3, 1.7, -2], [8, 1.3, -2], look)
    const [vx, vz] = toDoor(t, 3, -2)
    expect(vx).toBeCloseTo(look[0] * PREVIEW_BACK)
    expect(vz).toBeCloseTo(look[1] * PREVIEW_BACK)
    const [fx, fz] = toDoor(t, 8, -2)
    // the focus lies further along the same line
    expect((fx - vx) / Math.hypot(fx - vx, fz - vz)).toBeCloseTo(look[0])
    expect((fz - vz) / Math.hypot(fx - vx, fz - vz)).toBeCloseTo(look[1])
  })

  for (const slug of [[], ['who-we-are'], ['contacts']]) {
    const page = readPage('en', slug)!
    const key = `en/${slug.join('/')}`
    for (const aspect of [16 / 9, 9 / 16]) {
      it(`shows /${slug.join('/')} with nothing in front of the door (aspect ${aspect.toFixed(2)})`, () => {
        const model = buildPreview(page, key, aspect)!
        expect(model).not.toBeNull()
        const t = model.transform
        for (const p of model.office.solid) expect(doorZ(t, p.center[0], p.center[2])).toBeLessThan(0)
        for (const b of [...model.office.glass, ...model.office.frosted, ...model.office.windows])
          expect(doorZ(t, b.center[0], b.center[2])).toBeLessThan(0)
        expect(model.office.solid.length).toBeGreaterThan(20) // still a furnished office behind
      })
    }
  }

  it('shows the hero heading of a page that starts with a hero', () => {
    const home = buildPreview(readPage('en', [])!, 'en/', 16 / 9)!
    expect(home.hero?.lines.join(' ')).toMatch(/We make it/)
  })

  it('leaves out what stands in front and keeps what stands behind', () => {
    const t = previewTransform([0, 1.7, 0], [0, 1.3, -5]) // viewpoint at origin, looking −z
    const office = {
      solid: [
        { shape: 'box' as const, center: [0, 0.5, 3] as Vec3, size: [1, 1, 1] as Vec3, yaw: 0, mat: 'wood' as never },
        { shape: 'box' as const, center: [0, 0.5, -3] as Vec3, size: [1, 1, 1] as Vec3, yaw: 0, mat: 'wood' as never },
      ],
      glass: [],
      frosted: [],
      lights: [],
      windows: [],
      ceiling: { center: [0, 7, 0] as Vec3, size: [10, 10] as [number, number] },
      bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
      footprints: [],
      keepOff: [],
      chairs: [],
    }
    const kept = cullInFront(office, t)
    expect(kept.solid.map((p) => p.center[2])).toEqual([-3])
  })
})
