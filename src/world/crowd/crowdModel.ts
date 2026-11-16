/**
 * The office's own people (E2a, Dima 2026-11-16: "the office alive without the visitor doing
 * anything, different every time — comic, light, but done really well"). Pure, tested in
 * crowdModel.test.ts; <Crowd> draws them.
 *
 * - Spots where people do something: every desk chair (they type) and the coffee corners (two
 *   chat). Each spot has an exit — walkable floor next to it — for coming and going.
 * - On every page view the people, their looks and who is where are dealt at random (the office
 *   itself stays the same: the frames by the exhibits never change).
 * - Every 20–40 s someone stands up and walks to a free spot (A*, navGrid.ts) — never across the
 *   route's clear floor, so never into the camera's way.
 * - Gags: a typist bangs their head on the keyboard; the coffee machine shakes and bursts with
 *   steam while two are chatting next to it, and they jump back. They play where the visitor
 *   looks, when they look (Dima 2026-11-16: the machine "uses the CPU but there was no point" —
 *   it burst on a timer, unseen): one in view and near starts within half a second; nothing
 *   plays for nobody. Some of them call the camera's attention (crowd/attention.ts): it glances
 *   over, zooms in and pulls focus.
 */
import { seeded } from '@/lib/random'
import type { Vec3, WorldLayout } from '../layout'
import { seenFrom, type Office } from '../officeModel'
import type { FloorGroup } from './floorModel'
import { alongPath, areaOf, findPath, pathLength, walkable, type NavGrid } from './navGrid'

export const CROWD = {
  /** Someone sets off every this many seconds (random in the range). */
  moveEvery: [20, 40] as const,
  /** Walking speed (m/s) and the time to get up from / sit down on a chair (s). */
  walkSpeed: 1.25,
  sitTime: 0.8,
  /** A gag starts when it is in view (±35° of where the camera looks) and this near (m)… */
  gagView: { cos: Math.cos(0.6), bonk: 18, burst: 24 },
  /** …this soon after it came into view (s); never two within `gagGap` (s) of each other. */
  lead: 0.35,
  gagGap: 4,
  /** The head-bang lasts `bonkTime`; the same person again only after `bonkCooldown` (s). */
  bonkTime: 1.7,
  bonkCooldown: 12,
  /** The coffee machine: shakes, then bursts; again at a corner only after `burstCooldown`. */
  shakeTime: 1.1,
  burstTime: 2.6,
  burstCooldown: 10,
  /** The camera is called to look at most every this many seconds; a bang calls it this often. */
  attentionGap: 7,
  bonkAttention: 0.6,
  /** Someone hides a gag if within this of the line to it (m) and nearer by `hideMargin` (m). */
  hideWidth: 0.42,
  hideMargin: 0.3,
  /** Walks go to one of this many nearest free spots. */
  nearest: 4,
  /** A chair's exit: this far behind the seat (m). */
  exitBack: [1.5, 1.8, 2.1] as const,
} as const

/** Desk: typing. Coffee: chatting at a corner. Floor: chatting on the route's floor. Pace: on the phone, up and down. */
export type SpotKind = 'desk' | 'coffee' | 'floor' | 'pace'

export interface Spot {
  kind: SpotKind
  /** Where the person is while doing it (floor point) and which way they face. */
  at: Vec3
  yaw: number
  /** Walkable floor to come and go by; null = nobody walks to or from it. */
  exit: Vec3 | null
  /** Desk: the person faces the route (their face is seen over the screen). */
  facesRoute: boolean
  /** Coffee: which corner. */
  corner: number
  /** How close a stop sees it from (m; officeModel `seenFrom`); ∞ = no stop does. */
  seen: number
  /** Pace: the other end of the walk. */
  end?: Vec3
}

export interface Look {
  skin: string
  shirt: string
  pants: string
  hair: string
}

export type Task = 'type' | 'chat' | 'pace' | 'standUp' | 'walk' | 'sitDown'

export interface Person {
  look: Look
  /** Phase offset of their idle loops, so nobody moves in sync. */
  phase: number
  spot: number
  task: Task
  /** Scene time the task started. */
  since: number
  /** While going somewhere: the target spot and the path (exit → exit). */
  to: number
  path: Vec3[]
  length: number
  /** Desk: when the last / current head-bang started (scene time). */
  bonkAt: number
}

/** Where the camera is and looks (xz, normalised), for gags that play only in view. */
export interface View {
  eye: Vec3
  dir: readonly [number, number]
  /**
   * The visitor is not scrolling (the camera stands): only then may a gag call the camera
   * (Dima 2026-11-16: it should not glance away mid-scroll). Undefined = standing.
   */
  still?: boolean
}

/** A gag worth the camera's attention: where, from when, for how long (scene time). */
export interface Attention {
  at: Vec3
  start: number
  dur: number
}

export interface Crowd {
  spots: Spot[]
  people: Person[]
  nextMove: number
  /** Per coffee corner: when the machine started shaking last (scene time) and its top. */
  burstAt: number[]
  steam: Vec3[]
  /** The last gag, and the last one that called the camera (scene time). */
  lastGag: number
  lastAttention: number
  rand: () => number
}

const SKIN =['#f5d0b5', '#e0ac85', '#c68863', '#8d5a3b', '#f1c7a3', '#a8724f']
const SHIRT = ['#ff6b5b', '#3b6cf6', '#2bb673', '#ffb703', '#9b5de5', '#ef476f', '#06d6a0', '#118ab2', '#f4a261', '#e9ecef']
const PANTS = ['#26323f', '#1f2433', '#3d405b', '#023047', '#5c4033', '#2b2d42']
const HAIR = ['#141414', '#3a2618', '#8a5a2b', '#c0392b', '#d9b26b', '#5a3420']

const pick = <T>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)]!
const between = (rand: () => number, [a, b]: readonly [number, number]) => a + rand() * (b - a)

/** Every spot of an office: each desk chair, and both places at each coffee corner. */
export function crowdSpots(
  office: Pick<Office, 'chairs' | 'coffee' | 'frosted'>,
  layout: Pick<WorldLayout, 'rail' | 'stations'>,
  grid: NavGrid,
  floor: FloorGroup[] = [],
): Spot[] {
  const { rail, stations } = layout
  const spots: Spot[] = []
  for (const chair of office.chairs) {
    const seat = chair.prims.find((p) => p.size[1] < 0.2)
    const back = chair.prims.find((p) => p.size[1] >= 0.2)
    if (!seat || !back) continue
    const dx = seat.center[0] - back.center[0]
    const dz = seat.center[2] - back.center[2]
    const n = Math.hypot(dx, dz) || 1
    const dir = [dx / n, dz / n] as const // towards the desk
    const at: Vec3 = [chair.pivot[0], chair.pivot[1], chair.pivot[2]]
    let exit: Vec3 | null = null
    for (const d of CROWD.exitBack) {
      const e: Vec3 = [at[0] - dir[0] * d, at[1], at[2] - dir[1] * d]
      if (walkable(grid, e[0], e[2])) {
        exit = e
        break
      }
    }
    let near = rail[0]!
    for (const p of rail) if (Math.hypot(p[0] - at[0], p[2] - at[2]) < Math.hypot(near[0] - at[0], near[2] - at[2])) near = p
    const facesRoute = dir[0] * (near[0] - at[0]) + dir[1] * (near[2] - at[2]) > 0
    spots.push({ kind: 'desk', at, yaw: Math.atan2(dir[0], dir[1]), exit, facesRoute, corner: -1, seen: seenFrom(at, stations, office.frosted) })
  }
  office.coffee.forEach((c, corner) => {
    for (const sp of c.spots) {
      // Come and go from the spot itself, or the nearest walkable floor around it.
      let exit: Vec3 | null = null
      for (const r of [0, 0.25, 0.5]) {
        for (let k = 0; k < (r ? 8 : 1) && !exit; k++) {
          const e: Vec3 = [sp.at[0] + Math.sin((k * Math.PI) / 4) * r, sp.at[1], sp.at[2] + Math.cos((k * Math.PI) / 4) * r]
          if (walkable(grid, e[0], e[2])) exit = e
        }
      }
      spots.push({ kind: 'coffee', at: sp.at, yaw: sp.yaw, exit, facesRoute: true, corner, seen: seenFrom(sp.at, stations, office.frosted) })
    }
  })
  // On the route's floor (floorModel.ts): they stay where they are (no exit).
  for (const g of floor) {
    const [a, b] = g.points
    const ab = Math.atan2(b[0] - a[0], b[2] - a[2])
    if (g.kind === 'pair') {
      spots.push({ kind: 'floor', at: a, yaw: ab, exit: null, facesRoute: true, corner: -1, seen: 0 })
      spots.push({ kind: 'floor', at: b, yaw: ab + Math.PI, exit: null, facesRoute: true, corner: -1, seen: 0 })
    } else {
      spots.push({ kind: 'pace', at: a, yaw: ab, exit: null, facesRoute: true, corner: -1, seen: 0, end: b })
    }
  }
  return spots
}

/**
 * Deal the people for one page view: a pair at a coffee corner (if there is one), the rest at
 * desks — mostly ones that face the route, so their faces are seen.
 */
export function newCrowd(spots: Spot[], count: number, seed: number, now = 0, steam: Vec3[] = []): Crowd {
  const rand = seeded(seed)
  const people: Person[] = []
  const taken = new Set<number>()
  const seat = (spot: number) => {
    taken.add(spot)
    const kind = spots[spot]!.kind
    people.push({
      look: { skin: pick(rand, SKIN), shirt: pick(rand, SHIRT), pants: pick(rand, PANTS), hair: pick(rand, HAIR) },
      phase: rand() * Math.PI * 2,
      spot,
      task: kind === 'desk' ? 'type' : kind === 'pace' ? 'pace' : 'chat',
      since: now - rand() * 5,
      to: -1,
      path: [],
      length: 0,
      bonkAt: -Infinity,
    })
  }
  const quiet = { burstAt: steam.map(() => -Infinity), steam, lastGag: -Infinity, lastAttention: -Infinity, rand }
  if (count <= 0) return { spots, people, nextMove: Infinity, ...quiet }
  // First the ones on the route's floor (in the camera's sharp zone), then the coffee, then desks.
  spots.forEach((s, i) => {
    if ((s.kind === 'floor' || s.kind === 'pace') && people.length < count) seat(i)
  })
  const coffeeSpots = spots.map((s, i) => [s, i] as const).filter(([s]) => s.kind === 'coffee')
  if (coffeeSpots.length && count - people.length >= 2) {
    // The corner the camera sees best (the model puts the first one in view of a stop).
    const corner = [...coffeeSpots].sort((a, b) => a[0].seen - b[0].seen)[0]![0].corner
    for (const [s, i] of coffeeSpots) if (s.corner === corner) seat(i)
  }
  // Desks the camera sees from a stop, the nearer the likelier; mostly ones facing the route
  // (3 in 4), so the faces are seen over the screens. Never two at one desk cluster's same side.
  const desks = spots.map((s, i) => [s, i] as const).filter(([s]) => s.kind === 'desk' && Number.isFinite(s.seen))
  const weigh = (list: (readonly [Spot, number])[]) => {
    let total = 0
    for (const [s] of list) total += 1 / (1 + (s.seen / 6) ** 2)
    let r = rand() * total
    for (let k = 0; k < list.length; k++) {
      r -= 1 / (1 + (list[k]![0].seen / 6) ** 2)
      if (r <= 0) return k
    }
    return list.length - 1
  }
  let front = desks.filter(([s]) => s.facesRoute)
  let back = desks.filter(([s]) => !s.facesRoute)
  while (people.length < count && (front.length || back.length)) {
    const useFront = front.length && (rand() < 0.75 || !back.length)
    const pool = useFront ? front : back
    const [s, i] = pool.splice(weigh(pool), 1)[0]!
    seat(i)
    // Spread out: drop the seats right next to this one.
    const apart = ([o]: readonly [Spot, number]) => Math.hypot(o.at[0] - s.at[0], o.at[2] - s.at[2]) > 1.6
    front = front.filter(apart)
    back = back.filter(apart)
  }
  return {
    spots,
    people,
    nextMove: now + between(rand, CROWD.moveEvery) * 0.5,
    ...quiet,
  }
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2])

const occupied = (c: Crowd, spot: number) => c.people.some((p) => p.spot === spot || p.to === spot)

/** People chatting at a corner right now (not walking off). */
export const chattersAt = (c: Crowd, corner: number) =>
  c.people.filter((p) => p.task === 'chat' && c.spots[p.spot]!.corner === corner)

/** Is `p` in the camera's view and within `range` metres? (Its distance, or Infinity.) */
function inView(view: View, p: Vec3, range: number): number {
  const dx = p[0] - view.eye[0]
  const dz = p[2] - view.eye[2]
  const d = Math.hypot(dx, dz)
  return d > 0.5 && d <= range && (dx * view.dir[0] + dz * view.dir[1]) / d > CROWD.gagView.cos ? d : Infinity
}

/** Start a gag the camera sees, if one is due; returns it if it should call the camera's attention. */
function startGag(c: Crowd, now: number, view: View): Attention | null {
  if (now - c.lastGag < CROWD.gagGap) return null
  // Call the camera only while the visitor stands, and only if no one stands between the camera
  // and the gag (on a phone the coffee machine hid behind the people — Dima 2026-11-16).
  const call = (a: Attention, target?: Person) => {
    if (view.still === false || now - c.lastAttention < CROWD.attentionGap) return null
    if (hidden(c, now, view.eye, a.at, target)) return null
    c.lastAttention = now
    return a
  }
  // The coffee machine first: the bigger gag.
  let best = -1
  let bestD = Infinity
  c.steam.forEach((top, k) => {
    if (now - c.burstAt[k]! < CROWD.shakeTime + CROWD.burstTime + CROWD.burstCooldown) return
    if (chattersAt(c, k).length < 2) return
    const d = inView(view, top, CROWD.gagView.burst)
    if (d < bestD) {
      bestD = d
      best = k
    }
  })
  if (best >= 0) {
    const start = now + CROWD.lead
    c.burstAt[best] = start
    c.lastGag = now
    const top = c.steam[best]!
    return call({ at: [top[0], top[1] + 0.2, top[2]], start, dur: CROWD.shakeTime + 1.8 })
  }
  // A head-bang: the nearest typist in view who has not banged lately.
  let who: Person | null = null
  bestD = Infinity
  for (const p of c.people) {
    if (p.task !== 'type' || now - p.bonkAt < CROWD.bonkTime + CROWD.bonkCooldown) continue
    const d = inView(view, c.spots[p.spot]!.at, CROWD.gagView.bonk)
    if (d < bestD) {
      bestD = d
      who = p
    }
  }
  if (!who) return null
  const start = now + CROWD.lead
  who.bonkAt = start
  c.lastGag = now
  const at = c.spots[who.spot]!.at
  return c.rand() < CROWD.bonkAttention ? call({ at: [at[0], at[1] + 1.2, at[2]], start, dur: CROWD.bonkTime }, who) : null
}

/** Where a person is on the floor right now (their spot, or on their walk). */
function placeOf(c: Crowd, p: Person, now: number): Vec3 {
  if (p.task === 'walk') return alongPath(p.path, (now - p.since) * CROWD.walkSpeed).at
  return c.spots[p.spot]!.at
}

/**
 * Does someone (other than `target`) stand between the camera at `eye` and the point `at`, seen
 * from above: within a body's width of the line and nearer than the point?
 */
export function hidden(c: Crowd, now: number, eye: Vec3, at: Vec3, target?: Person): boolean {
  const dx = at[0] - eye[0]
  const dz = at[2] - eye[2]
  const len = Math.hypot(dx, dz)
  if (len < 0.5) return false
  const ux = dx / len
  const uz = dz / len
  return c.people.some((p) => {
    if (p === target) return false
    const q = placeOf(c, p, now)
    const along = (q[0] - eye[0]) * ux + (q[2] - eye[2]) * uz
    if (along <= 0.3 || along >= len - CROWD.hideMargin) return false
    const off = Math.abs((q[0] - eye[0]) * uz - (q[2] - eye[2]) * ux)
    return off < CROWD.hideWidth
  })
}

/**
 * Advance the crowd to scene time `now`; with the camera's `view`, start a gag it sees.
 * Returns a gag that calls for the camera's attention, if one started now.
 */
export function stepCrowd(c: Crowd, now: number, grid: NavGrid, view?: View): Attention | null {
  const { spots, rand } = c
  // ---- tasks run their course ----
  for (const p of c.people) {
    const t = now - p.since
    if (p.task === 'standUp' && t >= CROWD.sitTime) {
      p.task = 'walk'
      p.since = now
    } else if (p.task === 'walk' && t * CROWD.walkSpeed >= p.length) {
      p.spot = p.to
      p.to = -1
      p.since = now
      const kind = spots[p.spot]!.kind
      p.task = kind === 'desk' ? 'sitDown' : 'chat'
    } else if (p.task === 'sitDown' && t >= CROWD.sitTime) {
      p.task = 'type'
      p.since = now
    }
  }
  // ---- a gag where the camera looks ----
  const attention = view ? startGag(c, now, view) : null
  // ---- someone sets off ----
  if (now < c.nextMove) return attention
  c.nextMove = now + between(rand, CROWD.moveEvery)
  const idle = c.people.filter((p) => (p.task === 'type' || p.task === 'chat') && spots[p.spot]!.exit && !bursting(c, p, now))
  for (let tries = 0; tries < 6 && idle.length; tries++) {
    const p = idle[Math.floor(rand() * idle.length)]!
    const from = spots[p.spot]!
    // Free spots on the same stretch of floor (not across the corridor: no way there).
    const area = areaOf(grid, from.exit![0], from.exit![2])
    const free = spots
      .map((s, i) => [s, i] as const)
      .filter(([s, i]) => s.exit && !occupied(c, i) && areaOf(grid, s.exit[0], s.exit[2]) === area)
    if (!free.length) {
      idle.splice(idle.indexOf(p), 1)
      continue
    }
    // Mostly somewhere of the other kind: from a desk to the coffee and back. Only among the
    // nearest few, so the walk stays short (and the path search cheap).
    const other = free.filter(([s]) => s.kind !== from.kind)
    const near = (list: typeof free) =>
      [...list]
        .sort((a, b) => dist(a[0].exit!, from.exit!) - dist(b[0].exit!, from.exit!))
        .slice(0, CROWD.nearest)
    const pool = near(other.length && rand() < 0.6 ? other : free)
    const [target, ti] = pool[Math.floor(rand() * pool.length)]!
    const path = findPath(grid, from.exit!, target.exit!)
    if (!path || pathLength(path) < 1) continue
    p.to = ti
    p.path = path
    p.length = pathLength(path)
    p.since = now
    p.task = from.kind === 'desk' ? 'standUp' : 'walk'
    return attention
  }
  return attention
}

/**
 * Seconds into the coffee machine's gag at a corner (0 … shakeTime: shaking, then the burst), or
 * null — it plays only while two are chatting by it.
 */
export function burstTime(c: Crowd, corner: number, now: number): number | null {
  const at = c.burstAt[corner]
  if (at === undefined || now < at || now >= at + CROWD.shakeTime + CROWD.burstTime) return null
  return chattersAt(c, corner).length >= 2 ? now - at : null
}

/** Is this person's coffee machine shaking or bursting right now? */
export function bursting(c: Crowd, p: Person, now: number): boolean {
  const corner = c.spots[p.spot]!.corner
  return corner >= 0 && p.task === 'chat' && burstTime(c, corner, now) !== null
}
