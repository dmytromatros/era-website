/**
 * Living characters (docs/wow-plan.md, task C1) — the pure part: springs for secondary motion
 * (accessories that lag behind the head and swing on), the springy look-at, and which reaction
 * a click plays. No React, no three.js objects; tested in lifeModel.test.ts.
 */

/** Physics step (s): small and fixed, so springs behave the same at 30 and 120 fps. */
export const LIFE_STEP = 1 / 120
/** A frame longer than this (tab in the background, hidden pane) is not simulated in full. */
const MAX_FRAME = 0.1

/* ------------------------------------------------------------------ springs */

export interface Spring {
  x: number
  v: number
}

export const spring = (x = 0): Spring => ({ x, v: 0 })

/** Advance a damped spring towards `target` by `dt` seconds (fixed substeps). */
export function stepSpring(s: Spring, target: number, stiffness: number, damping: number, dt: number) {
  let left = Math.min(dt, MAX_FRAME)
  while (left > 1e-9) {
    const h = Math.min(LIFE_STEP, left)
    s.v += (-stiffness * (s.x - target) - damping * s.v) * h
    s.x += s.v * h
    left -= h
  }
}

/* --------------------------------------------------------- secondary motion */

/**
 * How an accessory reacts to the movement of what it is attached to. Angles are rotations of
 * the accessory around its pivot (radians); inputs are the mount's angular velocity (rad/s,
 * per Euler axis) and the body's vertical velocity (m/s).
 */
export interface WobbleTuning {
  /** Lag per axis: rotation = −gain × angular velocity of the mount around that axis. */
  gain: [number, number, number]
  /** Sideways swing (z) from turning (y): rods and badges swing out when the body turns. */
  turnSwing: number
  /** Nod (x) from going up or down: a hop makes an antenna bob. */
  bounce: number
  stiffness: number
  damping: number
  /** Max |angle| per axis. */
  limit: [number, number, number]
  /** Range of x, when one side is blocked (a badge cannot swing into the chest). */
  xRange?: [number, number]
}

export interface Wobble {
  axes: [Spring, Spring, Spring]
}

export const wobble = (): Wobble => ({ axes: [spring(), spring(), spring()] })

/**
 * @param angularVelocity mount rotation speed per Euler axis (x, y, z)
 * @param verticalVelocity body speed up (+) / down (−)
 * @returns the accessory rotation (x, y, z) to apply this frame
 */
export function stepWobble(
  w: Wobble,
  tuning: WobbleTuning,
  angularVelocity: [number, number, number],
  verticalVelocity: number,
  dt: number,
): [number, number, number] {
  const [wx, wy, wz] = angularVelocity
  const targets: [number, number, number] = [
    -tuning.gain[0] * wx - tuning.bounce * verticalVelocity,
    -tuning.gain[1] * wy,
    -tuning.gain[2] * wz - tuning.turnSwing * wy,
  ]
  const out: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const s = w.axes[i]!
    stepSpring(s, targets[i]!, tuning.stiffness, tuning.damping, dt)
    const lim = tuning.limit[i]!
    const [lo, hi] = i === 0 && tuning.xRange ? tuning.xRange : [-lim, lim]
    // A hard stop: the spring sits at the limit instead of pushing through it.
    if (s.x < lo || s.x > hi) {
      s.x = Math.min(hi, Math.max(lo, s.x))
      s.v *= -0.3
    }
    out[i] = s.x
  }
  return out
}

/** At rest (settled): nothing to draw differently, the simulation may pause. */
export const wobbleAtRest = (w: Wobble) => w.axes.every((s) => Math.abs(s.x) < 1e-4 && Math.abs(s.v) < 1e-3)

/* ---------------------------------------------------------------- look-at */

/** The head follows the look target on a slightly underdamped spring; the eyes get there first. */
export const LOOK = {
  stiffness: 60,
  damping: 11, // damping ratio ≈ 0.7: a small overshoot, like a head turning for real
  /** Part of the turn done by the torso (the rest by the neck). */
  torsoShare: 0.3,
  /** Limits (radians) of the whole turn and of the neck. */
  maxYaw: 1.25,
  maxNeckYaw: 0.9,
  minPitch: -0.45,
  maxPitch: 0.35,
  /** Eye offset on the face (head units) per radian still to turn, and its limits. */
  eyeShift: 0.09,
  eyeMaxX: 0.04,
  eyeMaxY: 0.025,
  /** The cursor counts as "being looked at" this long after it last moved (s). */
  cursorMemory: 2.5,
} as const

/** Yaw (around y, +x is positive) and pitch (+ = down, as head.rotation.x) towards a point. */
export function lookAngles(x: number, y: number, z: number): { yaw: number; pitch: number } {
  const yaw = Math.max(-LOOK.maxYaw, Math.min(LOOK.maxYaw, Math.atan2(x, z)))
  const pitch = Math.max(LOOK.minPitch, Math.min(LOOK.maxPitch, -Math.atan2(y, Math.hypot(x, z))))
  return { yaw, pitch }
}

/* -------------------------------------------------------------- reactions */

/** Quick clicks in a row within this window (s) make the character annoyed. */
export const ANNOY_WINDOW = 2.5
export const ANNOY_CLICKS = 4

export interface ClickMemory {
  /** Times of recent clicks (s). */
  times: number[]
  /** Next reaction of the cycle. */
  next: number
}

export const clickMemory = (): ClickMemory => ({ times: [], next: 0 })

/**
 * Which reaction a click at `now` plays: the next one of the character's list, in turn, or
 * `'annoyed'` when the visitor keeps clicking (the cycle then starts over).
 */
export function pickReaction(m: ClickMemory, count: number, now: number): number | 'annoyed' {
  m.times = m.times.filter((t) => now - t < ANNOY_WINDOW)
  m.times.push(now)
  if (m.times.length >= ANNOY_CLICKS) {
    m.times = []
    m.next = 0
    return 'annoyed'
  }
  const i = m.next % Math.max(1, count)
  m.next = i + 1
  return i
}

/**
 * Emoji beside the head after a click: pops up, floats, shrinks away. `age` in seconds. It leaves
 * by shrinking, not fading: it is a solid object in the world (writes depth, so the background
 * blur keeps it sharp and the cartoon style outlines it), and solid things cannot fade.
 */
export const EMOJI_LIFE = 1.5

export function emojiState(age: number): { visible: boolean; rise: number; scale: number } {
  if (age < 0 || age >= EMOJI_LIFE) return { visible: false, rise: 0, scale: 0 }
  const k = age / EMOJI_LIFE
  // Overshooting pop in the first 0.25 s, a gentle float up, and a shrink in the last quarter.
  const pop = Math.min(1, age / 0.25)
  const grow = pop < 1 ? Math.sin(pop * Math.PI * 0.75) / Math.sin(Math.PI * 0.75) : 1
  const out = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25
  const shrink = out * out * (3 - 2 * out)
  return { visible: true, rise: 0.15 + k * 0.6, scale: Math.max(0, grow * shrink) }
}

/** Smooth 0 → 1 → 0 over a reaction of `k` ∈ [0, 1] (ease in over `edge`, out over `edge`). */
export function envelope(k: number, edge = 0.18): number {
  if (k <= 0 || k >= 1) return 0
  const s = (x: number) => x * x * (3 - 2 * x)
  return Math.min(s(Math.min(1, k / edge)), s(Math.min(1, (1 - k) / edge)))
}

/* --------------------------------------------------------------- standing */

/**
 * Standing still, a person shifts the weight from leg to leg now and then, and sometimes moves
 * the free foot a little (C1). All from the clock: the same `t` gives the same stance, nothing
 * to store, nothing drifts. The actor lowers its hips so the standing leg just reaches its foot
 * (Actor.tsx), the free hip drops with the tilt, and IK bends that knee — the feet never slide.
 */
export const STANCE = {
  /** Seconds on one leg before the weight moves to the other. */
  hold: 4.6,
  /** Seconds the weight takes to move over. */
  shiftTime: 1.1,
  /** Hips over the standing leg (m) and their tilt (rad; the free hip drops). */
  hipShift: 0.04,
  hipTilt: 0.05,
  /** Part of the turns in which the free foot takes a small step, its length and lift. */
  stepChance: 0.55,
  stepStart: 1.0,
  stepTime: 0.5,
  stepLift: 0.045,
  /** How far a step may put a foot from its rest spot (x sideways, z forward / back). */
  stepReachX: 0.03,
  stepReachZ: 0.06,
  /**
   * Turns looked back for the last step of a foot. Long enough that it always finds one (a foot
   * goes 32 of its turns without a step with chance 0.45³² ≈ 10⁻¹¹): giving up would snap it home.
   */
  memory: 64,
} as const

/** Pseudo-random 0…1 from an integer (stable: the same turn always does the same). */
const hash = (n: number, salt = 0) => {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Weight side in turn `n`: +1 = right leg (+x), −1 = left. */
const weightSide = (n: number): 1 | -1 => (((n % 2) + 2) % 2 === 0 ? 1 : -1)
const stepsIn = (n: number) => hash(n, 1) < STANCE.stepChance
const stepOffset = (n: number): [number, number] => [
  (hash(n, 2) * 2 - 1) * STANCE.stepReachX,
  (hash(n, 3) * 2 - 1) * STANCE.stepReachZ,
]
const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}

export interface Stance {
  /** Which leg carries the weight: +1 = right (+x), −1 = left, smooth in between. */
  weight: number
  /** Soles (x, lift, z) in actor space, left and right. */
  feet: [[number, number, number], [number, number, number]]
}

/** Where a foot stands at the start of turn `n`: after its last step (or at rest). */
function footAt(n: number, side: 1 | -1, restX: number): [number, number] {
  for (let m = n - 1; m >= n - STANCE.memory; m--) {
    if (-weightSide(m) === side && stepsIn(m)) {
      const [dx, dz] = stepOffset(m)
      return [side * restX + dx, dz]
    }
  }
  return [side * restX, 0]
}

/**
 * @param t       the character's own clock (s), phase-shifted per character
 * @param steps   may the free foot step (not while holding something overhead)
 * @param restX   half the distance between the feet at rest
 */
export function stance(t: number, steps: boolean, restX: number): Stance {
  const n = Math.floor(t / STANCE.hold)
  const u = t - n * STANCE.hold
  const from = weightSide(n - 1)
  const to = weightSide(n)
  const weight = from + (to - from) * smooth(u / STANCE.shiftTime)

  const foot = (side: 1 | -1): [number, number, number] => {
    const [x, z] = steps ? footAt(n, side, restX) : [side * restX, 0]
    // The free foot of this turn steps once the weight is off it.
    if (steps && side === -to && stepsIn(n)) {
      const k = (u - STANCE.stepStart) / STANCE.stepTime
      if (k > 0) {
        const [dx, dz] = stepOffset(n)
        const e = smooth(k)
        const lift = k < 1 ? Math.sin(Math.PI * k) * STANCE.stepLift : 0
        return [x + (side * restX + dx - x) * e, lift, z + (dz - z) * e]
      }
    }
    return [x, 0, z]
  }
  return { weight, feet: [foot(-1), foot(1)] }
}
