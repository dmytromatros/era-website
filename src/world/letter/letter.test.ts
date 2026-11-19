import { describe, expect, it } from 'vitest'
import { reactions } from '@/actors/reactions'
import { readPage } from '@/content/read'
import { elementIds } from '@/blocks/elements'
import { letterErrors, sheetLines } from '@/experience/letter/letterModel'
import { sendIsStub, sendMessage } from '@/experience/letter/sendMessage'
import { creasesOf, FOLDED, foldAt, foldPoint, SHOW } from './planeModel'

describe('the letter (E9)', () => {
  it('needs a name, an e-mail that looks like one, and a few words', () => {
    expect(letterErrors({ name: 'Jane', email: 'jane@company.com', message: 'Hello there' })).toEqual([])
    expect(letterErrors({ name: ' ', email: 'jane@', message: 'x' })).toEqual(['name', 'email', 'message'])
    expect(letterErrors({ name: 'J', email: 'jane@company', message: 'Hi' })).toEqual(['email'])
  })

  it('wraps the message for the sheet by words, cuts the overflow with an ellipsis', () => {
    expect(sheetLines('one two three four', 9, 5)).toEqual(['one two', 'three', 'four'])
    expect(sheetLines('a\n\nb', 10, 5)).toEqual(['a', '', 'b'])
    expect(sheetLines('abcdefghijkl', 5, 5)).toEqual(['abcde', 'fghij', 'kl'])
    const cut = sheetLines('w '.repeat(40), 5, 2)
    expect(cut).toHaveLength(2)
    expect(cut[1]!.endsWith('…')).toBe(true)
  })

  it('is a stub for now: nothing is sent, the visitor still sees it go', async () => {
    expect(sendIsStub).toBe(true)
    const info = console.info
    console.info = () => {}
    await expect(sendMessage({ name: 'J', email: 'j@x.io', message: 'hi' })).resolves.toEqual({ ok: true })
    console.info = info
  })

  it('the Contacts CTA has the form; Leo stands at its card', () => {
    const page = readPage('en', ['contacts'])!
    const cta = page.blocks.find((b) => b.type === 'cta')!
    expect(cta.type === 'cta' && cta.form).toBeTruthy()
    expect(elementIds(cta)).toContain('letter')
    expect(cta.helpers.some((h) => h.target === 'letter' && h.actor === 'leo')).toBe(true)
    // Its texts go onto a 3D card: Latin only (the 3D font has no other glyphs, CLAUDE.md rule 5).
    if (cta.type === 'cta' && cta.form) {
      for (const s of [cta.form.title, cta.form.name, cta.form.email, cta.form.message, cta.form.send]) expect(s).toMatch(/^[\x20-\x7e’—…]+$/)
    }
  })
})

describe('the paper plane (E9)', () => {
  const r = 1.3
  const c = creasesOf(r)
  const grid: [number, number][] = []
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 28; j++) grid.push([-0.5 + i / 20, -r / 2 + (j * r) / 28])
  const flat = { corners: 0, sides: 0, keel: 0, wings: 0 }

  it('unfolded, the sheet is flat and where it was', () => {
    for (const [x, y] of grid) expect(foldPoint(x, y, c, flat)).toEqual([x, y, 0])
  })

  it('folded, it is a plane: symmetric, a keel under the nose line, wings out to the sides', () => {
    const tip = foldPoint(-0.5, -r / 2, c, FOLDED)
    const mirror = foldPoint(0.5, -r / 2, c, FOLDED)
    expect(mirror[0]).toBeCloseTo(-tip[0])
    expect(mirror[1]).toBeCloseTo(tip[1])
    expect(mirror[2]).toBeCloseTo(tip[2])
    // The keel: just off the middle line at the tail, standing up (+z).
    const keel = foldPoint(-0.02, -r / 2, c, FOLDED)
    expect(Math.abs(keel[0])).toBeLessThan(0.01)
    expect(keel[2]).toBeGreaterThan(0.01)
    // The wings reach out sideways, well past the keel, and lie high (at the keel's top).
    const wing = foldPoint(-0.3, -r / 2, c, FOLDED)
    expect(wing[0]).toBeLessThan(-0.08)
    expect(wing[2]).toBeGreaterThan(keel[2])
    // The nose stays where it was.
    const nose = foldPoint(0, r / 2 - 1e-6, c, FOLDED)
    expect(nose[1]).toBeCloseTo(r / 2, 3)
    // Folding moves no paper by more than the sheet's size (no point flies off).
    for (const [x, y] of grid) {
      const p = foldPoint(x, y, c, FOLDED)
      expect(Math.hypot(p[0], p[1] - r / 2, p[2])).toBeLessThan(Math.hypot(0.5, r) + 1e-6)
    }
  })

  it('folds smoothly over its window: no point jumps between frames (60 fps)', () => {
    const sample = grid.filter((_, i) => i % 7 === 0)
    let prev = sample.map(([x, y]) => foldPoint(x, y, c, foldAt(SHOW.fold[0])))
    for (let t = SHOW.fold[0]; t <= SHOW.fold[1] + 0.1; t += 1 / 60) {
      const next = sample.map(([x, y]) => foldPoint(x, y, c, foldAt(t)))
      next.forEach((p, i) => expect(Math.hypot(p[0] - prev[i]![0], p[1] - prev[i]![1], p[2] - prev[i]![2])).toBeLessThan(0.15))
      prev = next
    }
    expect(foldAt(SHOW.fold[1])).toEqual(FOLDED)
    // On `low` it is folded in one beat.
    expect(foldAt(SHOW.fold[0] + 0.01, false)).toEqual(FOLDED)
    expect(foldAt(SHOW.fold[0] - 0.01, false)).toEqual(flat)
  })

  it('the show runs in order; the throw lets go when the wind-up ends', () => {
    const order = [SHOW.toHands[1], SHOW.fold[0], SHOW.fold[1], SHOW.windup[0], SHOW.windup[1], SHOW.away[0], SHOW.away[1], SHOW.lookBack[1], SHOW.end]
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThanOrEqual(order[i - 1]!)
    expect(SHOW.away[0]).toBe(SHOW.windup[1])
    // The head turns after the plane as it is thrown, and back before the cheer is over.
    expect(SHOW.look[0]).toBeLessThanOrEqual(SHOW.away[0])
    expect(SHOW.lookBack[0]).toBeLessThan(SHOW.away[1])
    expect(SHOW.delivered).toBeGreaterThan(SHOW.away[1])
    // The helper's moves fit their windows: the fold within the folding, the arm forward at the release.
    expect(reactions.fold.duration).toBeLessThanOrEqual(SHOW.fold[1] - SHOW.fold[0] + 0.1)
    expect(reactions.throw.duration * 0.45).toBeCloseTo(SHOW.windup[1] - SHOW.windup[0], 1)
  })
})

describe('the letter card stands on its own legs (E9)', () => {
  const spec = (id: string, kind: 'text' | 'card', x: number, y: number, width: number, height: number) =>
    ({ id, kind, text: id, x, y, width, height, style: { fontSize: 16, fontWeight: 400, letterSpacing: 0, lineHeight: 1.2, color: '#000', align: 'left' }, parts: [] }) as const
  it('both legs under the card, not under the wider heading above it', async () => {
    const { buildExhibit } = await import('../exhibitModel')
    const k = 0.01
    const specs = [spec('heading', 'text', 0, 0, 900, 80), spec('letter', 'card', 0, 120, 460, 480)]
    const m = buildExhibit(specs as never, ['heading', 'letter'], [], k)
    const card = m.elements.find((e) => e.spec.id === 'letter')!
    const left = card.local[0] - (460 * k) / 2
    const right = card.local[0] + (460 * k) / 2
    expect(m.stand).not.toBeNull()
    for (const x of m.stand!) {
      expect(x).toBeGreaterThan(left)
      expect(x).toBeLessThan(right)
    }
    // A plain group (no card at the bottom) keeps its legs under the whole width.
    const plain = buildExhibit([spec('heading', 'text', 0, 0, 900, 80), spec('text', 'text', 0, 100, 300, 30)] as never, ['heading', 'text'], [], k)
    expect(plain.stand![1] - plain.stand![0]).toBeGreaterThan(8)
  })
})
