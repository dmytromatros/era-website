/**
 * The coffee welcome (wow-plan D3): right after the visitor falls into the 3D world from the
 * 2D landing — at the end of the entrance cutscene, before the first stop — a character walks up
 * from the right and offers a coffee.
 * "Take it" → she holds it out, the visitor's right hand comes up and takes it, she smiles and
 * walks off to the left; "No, thanks" — or simply scrolling on — she shrugs and walks off. The
 * scroll is never held up. Pure parts, tested in coffeeModel.test.ts; drawn by <CoffeeScene>.
 *
 * Shown only on an entrance from the 2D landing (there was a crack — not through a portal, not
 * after Back), once per page view: a flag in the page's memory, not in storage, so a reload shows
 * it again (Dima, 2026-11-09).
 */
import type { Vec3 } from '../layout'

export const COFFEE = {
  /** The visitor scrolled on this far past where she stands (rail points): a no, or she just goes. */
  scrolledOn: 0.35,
  /** Walking speed (m/s). */
  speed: 1.2,
  /** Where she stands: this far in front of the camera, this far to its right (m; capped by the view). */
  distance: 3.6,
  right: 1.3,
  /** The handover: she holds the cup out, the hand takes it at `pass`, then she smiles. */
  take: 1.9,
  pass: 0.75,
  /** The shrug after a no. */
  shrug: 1.3,
  /** How long she turns between walking and facing the visitor (s). */
  turn: 0.45,
} as const

/**
 * The visitor's hand during the handover (CoffeeScene writes, Hands reads): how far it reaches
 * (0..1) and towards where (camera space, unit vector at the cup she holds out).
 */
export const coffeeHand = { take: 0, toward: [0.2, -0.1, -1] as [number, number, number] }

/** Once per page view (until a reload): shown, and whether the visitor now has a coffee. */
export const coffeeMemory = { shown: false, has: false }

/** She is talking (CoffeeScene writes): the other characters' bubbles wait, so they do not overlap. */
export const coffeeTalk = { on: false }

export type CoffeePhase = 'waiting' | 'approaching' | 'offering' | 'taking' | 'declining' | 'leaving' | 'done'

export interface CoffeePath {
  start: Vec3
  spot: Vec3
  exit: Vec3
  /** The camera at the first stop (she faces it while offering). */
  viewer: Vec3
}

/**
 * Her way: in from beyond the right edge of the frame to a spot in front of the camera, to its
 * right (clear of the hero heading and its holder, which are further away, in the middle), then
 * off past the left edge. All on the floor of the first zone.
 */
export function coffeePath(viewpoint: Vec3, focus: Vec3, floorY: number, aspect: number, fov: number): CoffeePath {
  const fx = focus[0] - viewpoint[0]
  const fz = focus[2] - viewpoint[2]
  const l = Math.hypot(fx, fz) || 1
  const f: [number, number] = [fx / l, fz / l]
  const r: [number, number] = [-f[1], f[0]]
  const at = (along: number, across: number): Vec3 => [
    viewpoint[0] + f[0] * along + r[0] * across,
    floorY,
    viewpoint[2] + f[1] * along + r[1] * across,
  ]
  const halfWidth = (d: number) => Math.tan(((fov / 2) * Math.PI) / 180) * aspect * d
  // A bit further on a tall screen, so she does not fill it.
  const d = COFFEE.distance * Math.max(1, 1 / aspect) ** 0.35
  const right = Math.min(COFFEE.right, halfWidth(d) * 0.55)
  return {
    start: at(d + 0.5, halfWidth(d + 0.5) + 1.1),
    spot: at(d, right),
    exit: at(d - 0.3, -(halfWidth(d - 0.3) + 1.4)),
    viewer: [viewpoint[0], floorY, viewpoint[2]],
  }
}

export interface CoffeeState {
  phase: CoffeePhase
  /** Scene-clock time the phase began. */
  since: number
  /** Where she is, which way she faces (exhibit-yaw convention: +z of the actor towards it). */
  position: Vec3
  yaw: number
  /** Metres walked (drives her steps) and how much she is walking (0..1). */
  walked: number
  moving: number
  /** The visitor's answer, set by the buttons. */
  answer: 'take' | 'decline' | null
}

export const newCoffee = (path: CoffeePath): CoffeeState => ({
  phase: 'waiting',
  since: 0,
  position: [...path.start],
  yaw: yawTo(path.start, path.spot),
  walked: 0,
  moving: 0,
  answer: null,
})

export const yawTo = (from: Vec3, to: Vec3) => Math.atan2(to[0] - from[0], to[2] - from[2])
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export interface CoffeeInput {
  now: number
  dt: number
  /** The entrance cutscene says: now (cutscene/cutsceneModel.ts — only after a fall in from the landing). */
  start: boolean
  /** The visitor has scrolled on past where she stands (only possible without the cutscene's lock). */
  away: boolean
}

/** Where the scene is (CoffeeScene writes, the cutscene reads). */
export const coffeeStatus: { phase: CoffePhaseOut; since: number } = { phase: 'waiting', since: 0 }
type CoffePhaseOut = 'waiting' | 'approaching' | 'offering' | 'taking' | 'declining' | 'leaving' | 'done'

/** Walk towards `to`; returns true on arrival. */
function walkTo(s: CoffeeState, to: Vec3, dt: number): boolean {
  const dx = to[0] - s.position[0]
  const dz = to[2] - s.position[2]
  const d = Math.hypot(dx, dz)
  const step = Math.min(COFFEE.speed * dt, d)
  if (d > 1e-6) {
    s.position[0] += (dx / d) * step
    s.position[2] += (dz / d) * step
    s.walked += step
    turnTowards(s, Math.atan2(dx, dz), dt)
  }
  s.moving += ((d > 0.05 ? 1 : 0) - s.moving) * (1 - Math.exp(-dt * 8))
  return d <= 0.02
}

function turnTowards(s: CoffeeState, yaw: number, dt: number) {
  s.yaw += wrap(yaw - s.yaw) * (1 - Math.exp(-dt * (3 / COFFEE.turn)))
}

const go = (s: CoffeeState, phase: CoffeePhase, now: number) => {
  s.phase = phase
  s.since = now
}

/** Advance the scene by one frame. Mutates `s` and `memory`. */
export function stepCoffee(s: CoffeeState, path: CoffeePath, i: CoffeeInput, memory = coffeeMemory): CoffeeState {
  const dt = Math.min(Math.max(i.dt, 0), 0.1)
  const t = i.now - s.since
  const away = i.away
  switch (s.phase) {
    case 'waiting':
      if (!memory.shown && i.start) {
        memory.shown = true
        go(s, 'approaching', i.now)
      }
      break
    case 'approaching':
      if (away) go(s, 'leaving', i.now)
      else if (walkTo(s, path.spot, dt)) go(s, 'offering', i.now)
      break
    case 'offering':
      s.moving += (0 - s.moving) * (1 - Math.exp(-dt * 8))
      turnTowards(s, yawTo(s.position, path.viewer), dt)
      if (s.answer === 'take') go(s, 'taking', i.now)
      else if (s.answer === 'decline' || away) go(s, 'declining', i.now)
      break
    case 'taking':
      s.moving += (0 - s.moving) * (1 - Math.exp(-dt * 8))
      if (t >= COFFEE.pass) memory.has = true
      if (t >= COFFEE.take) go(s, 'leaving', i.now)
      break
    case 'declining':
      if (t >= COFFEE.shrug) go(s, 'leaving', i.now)
      break
    case 'leaving':
      if (walkTo(s, path.exit, dt)) go(s, 'done', i.now)
      break
    case 'done':
      break
  }
  return s
}

/** Is she in the scene at all (otherwise nothing of her is mounted: 0 draw calls)? */
export const present = (p: CoffeePhase) => p !== 'waiting' && p !== 'done'

/** How far she holds the cup out to the visitor, 0..1 (taking: out, then back as she lets go). */
export function offerReach(s: CoffeeState, now: number): number {
  const t = now - s.since
  if (s.phase === 'offering') return Math.min(t / 0.6, 1) * 0.35
  if (s.phase !== 'taking') return 0
  const out = Math.min(t / 0.45, 1)
  const back = Math.max(Math.min((t - COFFEE.pass - 0.2) / 0.5, 1), 0)
  return 0.35 + 0.65 * out * (1 - back) - 0.35 * back
}

/** Does she still hold the cup? */
export const herCup = (s: CoffeeState, now: number) =>
  s.phase !== 'done' && !(s.phase === 'taking' && now - s.since >= COFFEE.pass) && !(s.phase === 'leaving' && coffeeMemory.has)

/** The visitor's right hand reaching for the cup during the handover, 0..1 (0 = out of view). */
export function takeHand(s: CoffeeState, now: number): number {
  if (s.phase !== 'taking') return 0
  const t = now - s.since
  const up = Math.min(Math.max((t - 0.15) / (COFFEE.pass - 0.15), 0), 1)
  const down = Math.max(Math.min((t - COFFEE.pass - 0.35) / 0.6, 1), 0)
  return up * (1 - down)
}
