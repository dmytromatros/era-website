/**
 * Walking instead of flying (wow-plan D2): the camera takes steps along the rail. Pure, tested in
 * walkModel.test.ts; CameraRig feeds it the camera's rail position every frame and adds the
 * result on top (before the crack's kick).
 *
 * - The gait is driven by DISTANCE walked, not by a clock: standing still, no steps; scrolling
 *   slowly, slow steps; faster, quicker ones — the feet never slide nor tread on the spot.
 * - Walk ↔ run from the speed (smoothed, so it does not flicker): a run has quicker, bigger steps
 *   and leans forward. The field of view never changes (rule 27).
 * - On stairs every step goes up (or down) one stair: the head rises in steps, not on a slope,
 *   and looks a little down at the feet.
 * - Turning a corner, the body leans into the turn.
 * - Everything fades to exactly 0 when the camera stands (stops), during the entrance and through
 *   a portal (`weight`), so framing, the handover and fitDistance are untouched.
 *
 * Speed comes from the camera's motion, which comes from the smoothed `live.progress` (rule 1).
 */
import { ARCH, type StairFlight, type Vec3 } from '../layout'

/** Tuning — one place to make it calmer or wilder. Metres, seconds, radians. */
export const WALK = {
  /** Distance per footfall walking / running (m)… */
  step: 0.75,
  runStep: 1.3,
  /** …but never more footfalls a second than this (beyond it the steps get longer). */
  maxCadence: 3.4,
  /** Speeds (m/s): below `still` the body comes to rest; walk → run between `walk` and `run`. */
  still: [0.15, 0.9],
  walk: 3.5,
  run: 7,
  /** How quickly the smoothed speed follows the real one (1/s). */
  follow: 3,
  /** Head bob up/down, sway sideways (m), roll and nod (rad) — walking; running multiplies. */
  bob: 0.028,
  sway: 0.018,
  roll: 0.012,
  nod: 0.008,
  runBoost: 1.9,
  /** Leaning forward at a full run (rad ≈ 3°), down at the stairs (rad ≈ 4°). */
  lean: 0.055,
  stairLook: 0.07,
  /** Leaning into a turn: roll per rad/s of turning, at most `maxTurnLean`. */
  turnLean: 0.045,
  maxTurnLean: 0.07,
  /** A jump longer than this in one frame (portal, Back, a resize) is not walked. */
  jump: 2,
} as const

export interface WalkState {
  /** Footfall phase: +π per footfall. */
  phase: number
  /** Smoothed speed (m/s), heading (rad) and turning rate (rad/s). */
  speed: number
  heading: number | null
  turn: number
  /** Last position (null = first frame / after a jump). */
  last: Vec3 | null
}

export const newWalk = (): WalkState => ({ phase: 0, speed: 0, heading: null, turn: 0, last: null })

export interface WalkInput {
  /** Camera position on the rail and where it looks (world). */
  position: Vec3
  look: Vec3
  dt: number
  flights: StairFlight[]
  /** 0..1: walking allowed (0 during the entrance, a portal; fades in after the entrance). */
  weight: number
}

/** What CameraRig adds, in the camera's own frame (m, rad) + what the hands need. */
export interface Walk {
  up: number
  side: number
  pitch: number
  roll: number
  /** Footfall phase and how much of a walk / run there is (0..1) — for the swinging hands. */
  phase: number
  moving: number
  run: number
}

export const STILL: Walk = { up: 0, side: 0, pitch: 0, roll: 0, phase: 0, moving: 0, run: 0 }

const smooth = (x: number, a: number, b: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Where on a flight of stairs a point is: 0..steps along it (null = not on it). Plus how far into
 * it (0..1 with soft ends) the stair walk takes over from the level gait.
 */
export function onFlight(p: Vec3, f: StairFlight): { x: number; inside: number } | null {
  const dir: Vec3 = [Math.sin(f.heading), 0, -Math.cos(f.heading)]
  const along = (p[0] - f.from[0]) * dir[0] + (p[2] - f.from[2]) * dir[2]
  const across = Math.abs((p[0] - f.from[0]) * dir[2] - (p[2] - f.from[2]) * dir[0])
  if (along < -1 || along > f.run + 1 || across > 2) return null
  const x = (Math.min(Math.max(along, 0), f.run) / f.run) * f.steps
  const inside = smooth(along, -0.6, 0.2) * (1 - smooth(along, f.run - 0.2, f.run + 0.6))
  return { x, inside }
}

/**
 * How many stairs up the feet are at `x` (0..steps along the flight): the body rises onto each
 * stair late in the step, as the foot lands on it, then holds. Stair units.
 */
export const stairsClimbed = (x: number) => Math.floor(x) + smooth(x - Math.floor(x), 0.45, 0.9)

/** Advance the walk by one frame. Mutates `s`. */
export function stepWalk(s: WalkState, i: WalkInput): Walk {
  const dt = Math.min(Math.max(i.dt, 0), 0.1)
  let dist = 0
  if (s.last) {
    dist = Math.hypot(i.position[0] - s.last[0], i.position[2] - s.last[2])
    if (dist > WALK.jump) dist = 0 // teleported: do not walk it
  }
  s.last = [...i.position]
  const speed = dt > 0 ? dist / dt : 0
  s.speed += (speed - s.speed) * (1 - Math.exp(-dt * WALK.follow))

  // Turning: how fast the view's heading changes (smoothed).
  const heading = Math.atan2(i.look[0] - i.position[0], -(i.look[2] - i.position[2]))
  if (s.heading !== null && dt > 0) {
    const rate = wrap(heading - s.heading) / dt
    s.turn += (Math.max(Math.min(rate, 3), -3) - s.turn) * (1 - Math.exp(-dt * 5))
  }
  s.heading = heading

  const run = smooth(s.speed, WALK.walk, WALK.run)
  const step = WALK.step + (WALK.runStep - WALK.step) * run
  // Footfalls: one per `step` metres, capped in cadence.
  s.phase += Math.min(dist / step, WALK.maxCadence * dt) * Math.PI

  const moving = smooth(s.speed, WALK.still[0], WALK.still[1]) * i.weight
  if (moving <= 1e-4 && i.weight <= 1e-4) return { ...STILL, phase: s.phase }

  // Stairs: a lift onto each stair instead of the level bob.
  let stairs = 0
  let lift = 0
  for (const f of i.flights) {
    const on = onFlight(i.position, f)
    if (!on || on.inside <= 0) continue
    stairs = on.inside
    // The eye over the stair the feet are on, against where the rail has the camera.
    lift = f.from[1] + ARCH.eye + (stairsClimbed(on.x) * f.rise) / f.steps - i.position[1]
    break
  }

  const boost = 1 + (WALK.runBoost - 1) * run
  const a = moving * boost
  const sinP = Math.sin(s.phase)
  const bob = (Math.abs(sinP) - 0.64) * WALK.bob * a * (1 - stairs)
  const turnLean = Math.max(Math.min(-s.turn * WALK.turnLean, WALK.maxTurnLean), -WALK.maxTurnLean) * moving
  return {
    up: bob + lift * stairs * i.weight,
    side: sinP * WALK.sway * a,
    pitch: (-WALK.nod * Math.cos(2 * s.phase) * a - WALK.lean * run * moving - WALK.stairLook * stairs * moving),
    roll: sinP * WALK.roll * a + turnLean,
    phase: s.phase,
    moving,
    run,
  }
}

/** The walk this frame (CameraRig writes it; the hands read it). */
export const walkNow: { walk: Walk } = { walk: STILL }
