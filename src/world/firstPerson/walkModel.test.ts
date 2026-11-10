import { describe, expect, it } from 'vitest'
import { ARCH, type StairFlight, type Vec3 } from '../layout'
import { WALK, newWalk, stairsClimbed, stepWalk, type Walk } from './walkModel'

const DT = 1 / 60

/** Walk straight towards −z at `speed` m/s for `seconds`; returns every frame's output. */
function walk(speed: number, seconds: number, opts: { weight?: number; flights?: StairFlight[]; y?: (z: number) => number; start?: number } = {}) {
  const s = newWalk()
  const out: Walk[] = []
  let z = opts.start ?? 0
  for (let t = 0; t < seconds; t += DT) {
    const y = opts.y ? opts.y(z) : ARCH.eye
    const position: Vec3 = [0, y, z]
    out.push(stepWalk(s, { position, look: [0, y, z - 5], dt: DT, flights: opts.flights ?? [], weight: opts.weight ?? 1 }))
    z -= speed * DT
  }
  return { out, s }
}
const peak = (xs: number[]) => Math.max(...xs.map(Math.abs))

describe('walking (D2)', () => {
  it('standing still: no steps, no bob', () => {
    const { out, s } = walk(0, 2)
    expect(s.phase).toBe(0)
    for (const w of out) for (const v of [w.up, w.side, w.pitch, w.roll]) expect(Math.abs(v)).toBeLessThan(1e-9)
  })

  it('a step every WALK.step metres when walking, a small bob, no run', () => {
    const { out, s } = walk(1.5, 4)
    expect(s.phase / Math.PI).toBeCloseTo((1.5 * 4) / WALK.step, 0)
    const late = out.slice(120)
    expect(peak(late.map((w) => w.up))).toBeGreaterThan(WALK.bob * 0.25)
    expect(peak(late.map((w) => w.up))).toBeLessThan(WALK.bob)
    expect(late.at(-1)!.run).toBe(0)
  })

  it('runs when fast: quicker steps but capped, bigger bob, leans forward', () => {
    const { out, s } = walk(12, 4)
    const late = out.slice(180)
    expect(late.at(-1)!.run).toBeGreaterThan(0.99)
    expect(s.phase / Math.PI / 4).toBeLessThanOrEqual(WALK.maxCadence + 1e-6) // footfalls a second
    expect(peak(late.map((w) => w.up))).toBeGreaterThan(peak(walk(1.5, 4).out.slice(120).map((w) => w.up)) * 1.5)
    for (const w of late) expect(w.pitch).toBeLessThan(-WALK.lean * 0.5)
  })

  it('comes to rest when the camera stops (a stop): back to exactly still', () => {
    const s = newWalk()
    let z = 0
    let last: Walk | null = null
    for (let t = 0; t < 6; t += DT) {
      const speed = t < 2 ? 2 : 0
      last = stepWalk(s, { position: [0, ARCH.eye, z], look: [0, ARCH.eye, z - 5], dt: DT, flights: [], weight: 1 })
      z -= speed * DT
    }
    for (const v of [last!.up, last!.side, last!.pitch, last!.roll]) expect(Math.abs(v)).toBeLessThan(1e-3)
  })

  it('does nothing while not allowed (entrance, portal)', () => {
    for (const w of walk(3, 3, { weight: 0 }).out) for (const v of [w.up, w.side, w.pitch, w.roll]) expect(v).toBe(0)
  })

  it('does not walk a teleport (portal arrival, Back)', () => {
    const s = newWalk()
    stepWalk(s, { position: [0, ARCH.eye, 0], look: [0, ARCH.eye, -5], dt: DT, flights: [], weight: 1 })
    stepWalk(s, { position: [0, ARCH.eye, -40], look: [0, ARCH.eye, -45], dt: DT, flights: [], weight: 1 })
    expect(s.phase).toBe(0)
    expect(s.speed).toBe(0)
  })

  it('has no jumps between frames', () => {
    for (const speed of [1.5, 5, 12]) {
      const { out } = walk(speed, 3)
      for (let k = 1; k < out.length; k++) {
        expect(Math.abs(out[k]!.up - out[k - 1]!.up)).toBeLessThan(0.02)
        // (≤ 0.9° a frame even when starting a sprint from a standstill in one frame)
        expect(Math.abs(out[k]!.pitch - out[k - 1]!.pitch)).toBeLessThan(0.015)
        expect(Math.abs(out[k]!.roll - out[k - 1]!.roll)).toBeLessThan(0.015)
      }
    }
  })

  it('leans into a turn', () => {
    const s = newWalk()
    let w: Walk | null = null
    // Walk a quarter circle to the right (heading grows).
    for (let k = 0; k <= 90; k++) {
      const a = (k / 90) * (Math.PI / 2)
      const position: Vec3 = [5 - 5 * Math.cos(a), ARCH.eye, -5 * Math.sin(a)]
      const dir: Vec3 = [Math.sin(a), 0, -Math.cos(a)]
      w = stepWalk(s, { position, look: [position[0] + dir[0] * 5, ARCH.eye, position[2] + dir[2] * 5], dt: DT, flights: [], weight: 1 })
    }
    expect(w!.roll).toBeLessThan(0) // rolls right
  })
})

describe('walking up stairs (D2)', () => {
  const flight: StairFlight = { from: [0, 0, -2], heading: 0, run: 6, rise: 2.4, steps: 12 }
  /** The rail climbs the flight on a straight slope, like the layout's rail. */
  const railY = (z: number) => ARCH.eye + Math.min(Math.max((-2 - z) / 6, 0), 1) * 2.4

  it('the head rises onto each stair instead of sliding up the slope', () => {
    const { out } = walk(1, 10, { flights: [flight], y: railY, start: 0 })
    const heads = out.map((w, k) => railY(-k * DT) + w.up)
    // On the middle of the flight the head sits at the height of a stair (+ eye) most of the time.
    for (let k = 0; k < out.length; k++) {
      const z = -k * DT
      const along = -2 - z
      if (along < 1 || along > 5) continue
      const x = (along / 6) * 12
      const frac = x - Math.floor(x)
      if (frac > 0.1 && frac < 0.4) expect(heads[k]!).toBeCloseTo(ARCH.eye + (Math.floor(x) * 2.4) / 12, 2)
    }
    expect(stairsClimbed(12)).toBe(12)
  })

  it('is level again past the flight', () => {
    const { out } = walk(1, 12, { flights: [flight], y: railY, start: 0 })
    const after = out.at(-1)!
    expect(Math.abs(after.up)).toBeLessThan(WALK.bob)
  })
})
