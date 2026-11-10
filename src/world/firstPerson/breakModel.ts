/**
 * The crack: the moment the film gives way under the leaning palms and the visitor falls
 * through into the 3D world (wow-plan D1, Dima 2026-11-10: "by accident — fall from 2D into
 * 3D, the camera shaken, cinematic, like in a game"). Pure parts, tested in breakModel.test.ts.
 *
 * WHEN it happens is decided by the entrance progress (e crosses BREAK.at going in); HOW it
 * plays is real time from that moment (scene clock): the burst, the hands losing their support,
 * the stumble, the shards — so a slow scroll still gets a sudden crack. Like the ripple at the
 * handover, it is not scrubbed by the scroll. Scrolling back to the very top (e < rearm) heals
 * the film and arms the crack again; arriving mid-page (portal, Back: e jumps) skips it.
 *
 * Then the visitor is confused (Dima, 2026-11-10): looks down at one hand, at the other, "what
 * was that?" — but never at the cost of the scroll: scrolling on fades that away
 * (`lookWeight`), so nobody misses the hero elements flying to their places.
 *
 * The seam is untouched: the crack is long after the handover frame (e = 0.13), and everything
 * here is exactly zero again `BREAK.settle` seconds later — the camera is back on its rail.
 */
import { HOLD } from '../timeline'
import { LOOK, handsAt, type Crack, type Uv, type View } from './handsModel'

export const BREAK = {
  /** The film gives way at this entrance progress (the palms lean on it from e 0.03)… */
  at: 0.13,
  /** …and is armed again only back at the very top (the hands are below the frame there). */
  rearm: 0.01,
  /** Progress jumps further than this in one frame = arrived mid-page: no crack. */
  jump: 0.25,
  /** The film is fully open this long after the crack (s). */
  burst: 0.42,
  /** Everything is back to rest this long after the crack (s). */
  settle: 4.4,
} as const

export interface BreakState {
  /** Scene-clock time of the crack, -Infinity = skipped (arrived mid-page), null = armed. */
  at: number | null
  /** The hand that slipped first. */
  side: -1 | 1
  /** Where the film burst (screen uv at the start view: the slipping palm). */
  uv: Uv
  /** Entrance progress at the crack (scrolling on from there fades the confused look). */
  e0: number
  /** Progress last frame and the frame time it was seen at (updates are once per frame). */
  prevE: number | null
  now: number
}

export const newBreak = (): BreakState => ({ at: null, side: 1, uv: { x: 0.5, y: 0.5 }, e0: BREAK.at, prevE: null, now: NaN })

/** The one crack of the current entrance, shared by the film, hands, camera and shards. */
export const entranceBreak = newBreak()

/**
 * Advance the crack for this frame. Idempotent within a frame (same `now`), so every part of
 * the scene may call it first. @returns true on the frame the film gives way.
 */
export function stepBreak(s: BreakState, e: number, now: number, tear: Uv, view: View, random: () => number): boolean {
  if (s.now === now) return false
  s.now = now
  const prev = s.prevE
  s.prevE = e
  if (e < BREAK.rearm) {
    s.at = null
    return false
  }
  if (s.at !== null || e < BREAK.at) return false
  if (prev === null || e - prev > BREAK.jump || prev >= BREAK.at) {
    // Arrived mid-page (portal, Back, a remount deep inside): no crack, as if long ago.
    s.at = -Infinity
    return false
  }
  s.at = now
  s.e0 = e
  s.side = random() < 0.5 ? -1 : 1
  const palms = handsAt(e, tear, view).palms
  s.uv = { ...palms[s.side === -1 ? 0 : 1] }
  return true
}

const smooth = (x: number, a: number, b: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * How much of the confused look plays: 1 while the visitor stays within the hold after the crack
 * (timeline HOLD — a couple of wheel clicks), fading to 0 as they scroll past it (or back up) —
 * the scroll is never held up.
 */
export const lookWeight = (e: number, e0: number) =>
  (1 - smooth(e, HOLD.to, HOLD.to + 0.06)) * (1 - smooth(e0 - e, 0.04, 0.1))

/**
 * A body-space point (the camera on its rail, before the kick) in the kicked camera's own space —
 * the hands live in body space, the picture is the camera's. Mirrors CameraRig: translate
 * (side, −down, −forward), then rotate yaw (y), pitch (x), roll (z), each about the new axes.
 */
export function bodyToCamera(p: [number, number, number], k: Kick): [number, number, number] {
  let x = p[0] - k.side
  let y = p[1] + k.down
  let z = p[2] + k.forward
  // Inverse rotations in reverse order: roll, pitch, yaw.
  const rz = (a: number) => {
    const c = Math.cos(-a), s = Math.sin(-a)
    ;[x, y] = [c * x - s * y, s * x + c * y]
  }
  const rx = (a: number) => {
    const c = Math.cos(-a), s = Math.sin(-a)
    ;[y, z] = [c * y - s * z, s * y + c * z]
  }
  const ry = (a: number) => {
    const c = Math.cos(-a), s = Math.sin(-a)
    ;[x, z] = [c * x + s * z, -s * x + c * z]
  }
  ry(k.yaw)
  rx(k.pitch)
  rz(k.roll)
  return [x, y, z]
}

/** The crack as the hands see it (null = not yet / skipped). */
export function crackOf(s: BreakState, now: number, e: number): Crack | null {
  if (s.at === null || s.at === -Infinity) return null
  return { t: Math.max(now - s.at, 0), side: s.side, look: lookWeight(e, s.e0) }
}

/** Seconds since the crack: null = armed, Infinity = skipped. */
export const sinceBreak = (s: BreakState, now: number) =>
  s.at === null ? null : s.at === -Infinity ? Infinity : Math.max(now - s.at, 0)

/** 0 → 1: how open the film is from the burst (fast start, like glass giving way). */
export function burstAt(t: number | null): number {
  if (t === null) return 0
  const x = Math.min(t / BREAK.burst, 1)
  return 1 - (1 - x) ** 2
}

/**
 * Film opening while scrolling back up after a crack: the hole closes with the progress
 * (smoothly healed at the top), and opens fully again by BREAK.at. The camera's stumble fades
 * the same way, so it is gone before the crack is armed again.
 */
export const healAt = (e: number) => smooth(e, BREAK.rearm, BREAK.at)

/** An impact: rises fast, decays, optionally rings. 0 at t = 0. */
const hit = (t: number, rise: number, decay: number, freq = 0) =>
  (1 - Math.exp(-rise * t)) * Math.exp(-decay * t) * Math.cos(freq * t)
/** A bell around `c` of half-width ~`w`. */
const bell = (t: number, c: number, w: number) => Math.exp(-(((t - c) / w) ** 2))
/** 0 → 1 → 0: in over [a, b], out over [c, d]. */
const window4 = (t: number, a: number, b: number, c: number, d: number) => smooth(t, a, b) * (1 - smooth(t, c, d))

/**
 * The camera after the crack (added on top of the rail by CameraRig), in the camera's own frame:
 * metres forward / down / sideways, radians of yaw (positive = looks left), pitch (negative =
 * looks down) and roll, degrees of extra field of view. All exactly 0 before the crack and from
 * BREAK.settle on.
 */
export interface Kick {
  forward: number
  down: number
  side: number
  yaw: number
  pitch: number
  roll: number
  fov: number
}

export const ZERO_KICK: Kick = { forward: 0, down: 0, side: 0, yaw: 0, pitch: 0, roll: 0, fov: 0 }

/** Tuning — one place to make it wilder or calmer. Times in seconds after the crack. */
export const KICK = {
  /** The fall through: lurch forward (m), drop (m), fov punch (°), fine shake (m). */
  forward: 0.7,
  down: 0.32,
  fov: 10,
  shake: 0.018,
  /** The stumble: nod down (rad ≈ 21°) — tips over by `tip`, catches itself by `recover`. */
  stumble: 0.37,
  tip: [0, 0.3],
  recover: [0.6, 1.15],
  /** Two staggering steps: when, how deep (m), and the sway (roll, rad) while staggering. */
  steps: [0.36, 0.72],
  dip: 0.13,
  sway: 0.11,
  /** "Phew, still standing": the head comes up a little past level, then settles. */
  overshoot: 0.07,
  /** The confused look: head down at the hands (rad ≈ 17°), a glance at each (yaw), head shake. */
  look: {
    // When: handsModel LOOK (the hands come up at the same moments).
    ...LOOK,
    down: 0.3,
    glance: 0.24,
    tilt: 0.07,
    shakeAt: [3.2, 3.7],
    shake: 0.05,
  },
} as const

/**
 * `look` = lookWeight (the confused part fades with the scroll), `heal` = healAt(e) (everything
 * fades while scrolling back up to the top), `glance` = how far the head turns to each hand
 * (handsModel glanceYaw: less on a narrow screen, where the hands are closer together).
 */
export function kickAt(t: number | null, side: -1 | 1, look = 1, heal = 1, glance: number = KICK.look.glance): Kick {
  if (t === null || !Number.isFinite(t) || t <= 0 || t >= BREAK.settle) return ZERO_KICK
  // Fade to exactly zero towards the end, so the camera is back on its rail.
  const env = (1 - smooth(t, BREAK.settle - 0.3, BREAK.settle)) * heal
  const shake = KICK.shake * Math.exp(-t * 4.5) * (1 - Math.exp(-t * 40))

  // The stumble: tips forward, staggers two steps (dips + sway), catches itself.
  const tipped = smooth(t, KICK.tip[0], KICK.tip[1]) * (1 - smooth(t, KICK.recover[0], KICK.recover[1]))
  const steps = bell(t, KICK.steps[0], 0.09) + 0.8 * bell(t, KICK.steps[1], 0.09)
  const overshoot = KICK.overshoot * bell(t, KICK.recover[1] + 0.05, 0.16)
  // Starts towards the slipping hand, then the other way with each staggering step.
  const sway = Math.sin(t * Math.PI * 2.8) * tipped

  // The confused look at the hands.
  const L = KICK.look
  const looking = window4(t, L.in[0], L.in[1], L.out[0], L.out[1]) * look
  const left = window4(t, ...L.left) * look
  const right = window4(t, ...L.right) * look
  const shaking = window4(t, L.shakeAt[0], L.shakeAt[0] + 0.12, L.shakeAt[1] - 0.15, L.shakeAt[1]) * look

  return {
    forward: KICK.forward * hit(t, 9, 2.4) * env,
    down: (KICK.down * hit(t, 11, 2.8, 4.2) + KICK.dip * steps + shake * Math.sin(t * 47)) * env,
    side: (side * 0.08 * hit(t, 8, 3, 6) + side * 0.05 * sway + shake * Math.sin(t * 39 + 1.3)) * env,
    yaw: (glance * (left - right) + L.shake * Math.sin((t - L.shakeAt[0]) * Math.PI * 4.4) * shaking) * env,
    pitch: (-KICK.stumble * tipped - 0.06 * steps + overshoot - L.down * looking) * env,
    roll: (side * 0.12 * hit(t, 24, 2.5, 7.4) + side * KICK.sway * sway + L.tilt * (left - right)) * env,
    fov: KICK.fov * hit(t, 18, 4.2) * env,
  }
}
