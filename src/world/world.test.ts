import { describe, expect, it } from 'vitest'
import { BODY } from '@/actors/rig'
import type { ElementSpec } from '@/experience/measure'
import { textKeys } from './ElementView'
import { buildExhibit } from './exhibitModel'
import { fitDistance } from './layout'
import { pageStops } from './stops'

describe('fitDistance', () => {
  it('steps back further on portrait screens', () => {
    expect(fitDistance(3, 1, 9 / 16)).toBeGreaterThan(fitDistance(3, 1, 16 / 9))
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

  it('tells each character where its element is, relative to its feet (C1 IK targets)', () => {
    const held = buildExhibit(specs, ['heading'], [{ target: 'heading', actor: 'a', pose: 'holding', lines: ['x'] }], k)
    const [heading] = held.elements
    const holder = held.helpers[0]!
    // Palms go right under the heading, a little in front of it.
    expect(holder.target.bottom[0]).toBeCloseTo(0)
    expect(holder.local[1] + holder.target.bottom[1]).toBeCloseTo(heading!.local[1] - (100 * k) / 2)
    expect(holder.local[2] + holder.target.bottom[2]).toBeGreaterThan(heading!.local[2])

    // Two side helpers: the left one's element is on its +x side, the right one's on its −x side.
    const two = buildExhibit(
      specs,
      ['heading', 'lead'],
      [
        { target: 'lead', actor: 'a', pose: 'pointing', lines: ['x'] },
        { target: 'heading', actor: 'b', pose: 'pointing', lines: ['x'] },
      ],
      k,
    )
    const [left, right] = two.helpers
    expect(left!.target.centre[0]).toBeGreaterThan(0)
    expect(right!.target.centre[0]).toBeLessThan(0)
    const lead = two.elements.find((e) => e.spec.id === 'lead')!
    expect(left!.local[0] + left!.target.centre[0]).toBeCloseTo(lead.local[0])
    expect(left!.local[1] + left!.target.centre[1]).toBeCloseTo(lead.local[1])
  })

  it('keeps 2D arrangement inside the group', () => {
    const m = buildExhibit(specs, ['heading', 'lead'], [], k)
    const [h, l] = m.elements
    expect(h!.local[1]).toBeGreaterThan(l!.local[1]) // heading above lead
    // centres are 50px and 130px from the top in 2D → 80px apart
    expect(h!.local[1] - l!.local[1]).toBeCloseTo(80 * k)
  })
})

describe('textKeys (readiness of 3D texts)', () => {
  const base = {
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    style: { fontSize: 16, fontWeight: 400, letterSpacing: 0, lineHeight: 1.2, color: '#000', align: 'left' as const },
  }
  it('gives one key per text, stable across re-measures, new when the text changes', () => {
    const card: ElementSpec = { ...base, id: 'card-0', kind: 'card', text: '', parts: [
      { ...base, text: 'Title' },
      { ...base, text: 'Body' },
    ] }
    expect(textKeys(card)).toEqual(['card-0#0:Title', 'card-0#1:Body'])
    expect(textKeys({ ...card })).toEqual(textKeys(card))
    const heading: ElementSpec = { ...base, id: 'heading', kind: 'text', text: 'Hi', parts: [] }
    expect(textKeys(heading)).not.toEqual(textKeys({ ...heading, text: 'Hello' }))
  })
})
