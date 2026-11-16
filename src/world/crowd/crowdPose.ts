/**
 * How the office's people move (E2a): one pose per person per frame from their task and the
 * scene time — typing, banging the head on the keyboard, chatting, jumping back from the coffee
 * machine, walking, getting up and sitting down. Pure, tested in crowdPose.test.ts. Angles use
 * the characters' rig conventions (src/actors/rig.ts): arm / leg x < 0 swings forward, fore x < 0
 * and shin x > 0 bend the elbow / knee the natural way, torso / head x > 0 lean / look down,
 * armL z < 0 / armR z > 0 lift out to the side.
 */
import type { Vec3 } from '../layout'
import { alongPath } from './navGrid'
import { burstTime, CROWD, type Crowd, type Person } from './crowdModel'

export interface Pose {
  /** Floor point under the hips, facing, and how far the body is raised / lowered (m). */
  at: Vec3
  yaw: number
  lift: number
  torsoX: number
  torsoZ: number
  headX: number
  headY: number
  armLX: number
  armLZ: number
  armRX: number
  /** Right upper arm's twist (the phone to the ear needs it). */
  armRY: number
  armRZ: number
  foreL: number
  foreR: number
  legL: number
  legR: number
  shinL: number
  shinR: number
}

type Joints = Omit<Pose, 'at' | 'yaw'>

const ZERO: Joints = { lift: 0, torsoX: 0, torsoZ: 0, headX: 0, headY: 0, armLX: 0, armLZ: 0, armRX: 0, armRY: 0, armRZ: 0, foreL: 0, foreR: 0, legL: 0, legR: 0, shinL: 0, shinR: 0 }

const smooth = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1)
  return t * t * (3 - 2 * t)
}
const mix = (a: Joints, b: Joints, t: number): Joints => {
  const out = { ...a }
  for (const k of Object.keys(a) as (keyof Joints)[]) out[k] = a[k] + (b[k] - a[k]) * t
  return out
}
/** Shortest turn from a to b (rad), scaled by t. */
const turn = (a: number, b: number, t: number) => {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/** Chatting: the speaker swaps every `turn` seconds, blending over `blend` of a turn. */
const CHAT = { turn: 3, blend: 0.25 } as const

/** Pacing on the phone: speed (m/s) and the pause to turn at each end (s). */
const PACE = { speed: 0.9, turn: 0.9 } as const

/** Hips sit this much lower than standing (seat top ≈ 0.5 m, hips 0.62 m up when standing). */
export const SIT_LIFT = -0.1

/** Sitting at a desk, typing (time `t`, the person's phase `ph`). */
function typing(t: number, ph: number): Joints {
  const tap = (k: number) => Math.sin(t * 21 + ph + k) * 0.06
  return {
    ...ZERO,
    lift: SIT_LIFT,
    torsoX: 0.1 + Math.sin(t * 0.7 + ph) * 0.02,
    headX: 0.18 + Math.sin(t * 0.5 + ph) * 0.04,
    headY: Math.sin(t * 0.31 + ph) * 0.12,
    armLX: -0.78,
    armRX: -0.78,
    armLZ: 0.08,
    armRZ: -0.08,
    foreL: -0.72 + tap(0),
    foreR: -0.72 + tap(1.7),
    legL: -1.45,
    legR: -1.45,
    shinL: 1.4,
    shinR: 1.4,
  }
}

/** The head-bang (u = seconds into it): a stare, two bangs on the keyboard, slowly back up. */
function bonk(base: Joints, u: number): Joints {
  const T = CROWD.bonkTime
  if (u < 0 || u > T) return base
  const stare = smooth(u / 0.25) * (1 - smooth((u - T + 0.3) / 0.3))
  // Two bangs between 0.3 s and 1.3 s: down fast, up a little, down again.
  const b = u > 0.3 && u < 1.3 ? Math.abs(Math.sin(((u - 0.3) / 1.0) * Math.PI * 2)) : 0
  const out = { ...base }
  out.headY = base.headY * (1 - stare)
  out.headX = base.headX + (0.55 * b - 0.18) * stare
  out.torsoX = base.torsoX + 0.42 * b * stare
  out.foreL = base.foreL + 0.35 * stare
  out.foreR = base.foreR + 0.35 * stare
  out.armLX = base.armLX + 0.25 * stare
  out.armRX = base.armRX + 0.25 * stare
  return out
}

/** Standing and chatting: the one who speaks gestures, the other nods (they swap every 3 s). */
function chatting(t: number, ph: number, speaks: boolean): Joints {
  const sway = Math.sin(t * 0.9 + ph)
  if (speaks) {
    const g = Math.sin(t * 3.1 + ph)
    return {
      ...ZERO,
      torsoZ: sway * 0.03,
      headX: Math.sin(t * 2.3) * 0.05,
      headY: Math.sin(t * 1.1 + ph) * 0.12,
      armRX: -0.65 + g * 0.3,
      armRZ: 0.2 + Math.max(g, 0) * 0.2,
      foreR: -0.9 + g * 0.25,
      armLX: -0.25 + Math.sin(t * 2.2 + 1) * 0.15,
      foreL: -0.5,
    }
  }
  return {
    ...ZERO,
    torsoZ: sway * 0.03,
    // Nods, and now and then laughs (a few quick bobs).
    headX: Math.max(0, Math.sin(t * 2.4 + ph)) * 0.12,
    lift: Math.max(0, Math.sin(t * 9)) * 0.02 * (Math.sin(t * 0.4 + ph) > 0.85 ? 1 : 0),
    // Hands on the hips.
    armLZ: -0.42,
    armRZ: 0.42,
    foreL: -1.5,
    foreR: -1.5,
  }
}

/** The machine shakes (they turn to it), bursts: they jump, arms up, step back, wipe their faces. */
function startled(base: Joints, u: number, side: number): { j: Joints; back: number } {
  const out = { ...base }
  const S = CROWD.shakeTime
  if (u < S) {
    out.headY = side * 0.7 * smooth(u / 0.3)
    out.torsoZ = Math.sin(u * 40) * 0.02
    return { j: out, back: 0 }
  }
  const v = u - S
  const jump = v < 0.45 ? Math.sin((v / 0.45) * Math.PI) : 0
  const up = smooth(v / 0.15) * (1 - smooth((v - 1.3) / 0.4))
  const wipe = smooth((v - 1.5) / 0.3) * (1 - smooth((v - CROWD.burstTime + 0.3) / 0.3))
  out.lift = jump * 0.28
  out.headY = side * 0.7 * (1 - smooth(v / 0.6))
  out.headX = -0.25 * up
  out.armLZ = -2.5 * up
  out.armRZ = 2.5 * up
  out.armLX = 0
  out.foreL = -0.2 * up
  out.foreR = -0.2 * up + -2.2 * wipe
  out.armRX = -1.1 * wipe
  out.legL = -0.4 * jump
  out.shinL = 0.8 * jump
  return { j: out, back: smooth(v / 0.5) * 0.35 * (1 - smooth((v - CROWD.burstTime + 0.6) / 0.6)) }
}

/** Walking `d` metres into a walk. */
function walking(d: number): Joints {
  const s = Math.sin((d / 1.3) * Math.PI * 2)
  return {
    ...ZERO,
    lift: Math.abs(s) * 0.035,
    torsoX: 0.05,
    headX: 0.05,
    armLX: -0.45 * s,
    armRX: 0.45 * s,
    foreL: -0.35,
    foreR: -0.35,
    legL: 0.5 * s,
    legR: -0.5 * s,
    shinL: Math.max(0, -s) * 0.7,
    shinR: Math.max(0, s) * 0.7,
  }
}

/**
 * On a spinning swivel chair: the whole sitter turns with the seat around its stem, and the
 * faster it goes the more they throw their arms out and lean back ("wheee").
 */
export function onSpinningChair(pose: Pose, pivot: Vec3, angle: number, speed: number): Pose {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const dx = pose.at[0] - pivot[0]
  const dz = pose.at[2] - pivot[2]
  const k = smooth(Math.abs(speed) / 7)
  const wheee: Joints = {
    ...pose,
    torsoX: -0.15,
    headX: -0.3,
    armLX: -0.3,
    armRX: -0.3,
    armRY: 0,
    armLZ: -1.7,
    armRZ: 1.7,
    foreL: -0.2,
    foreR: -0.2,
    legL: -1.75,
    legR: -1.75,
    shinL: 0.9,
    shinR: 0.9,
  }
  return {
    ...mix(pose, wheee, k),
    at: [pivot[0] + dx * c + dz * s, pose.at[1], pivot[2] - dx * s + dz * c],
    yaw: pose.yaw + angle,
  }
}

/** The pose of person `i` at scene time `now`. */
export function poseOf(c: Crowd, i: number, now: number): Pose {
  const p: Person = c.people[i]!
  const spot = c.spots[p.spot]!
  const t = now + p.phase * 3
  const ph = p.phase
  const seatAt = (s = spot): Vec3 => [s.at[0] - Math.sin(s.yaw) * 0.05, s.at[1], s.at[2] - Math.cos(s.yaw) * 0.05]

  switch (p.task) {
    case 'type': {
      const j = bonk(typing(t, ph), now - p.bonkAt)
      return { at: seatAt(), yaw: spot.yaw, ...j }
    }
    case 'chat': {
      // Speaker and listener swap every 3 s (the two in opposite turns, by index parity),
      // blending over 0.75 s — a hard switch made the pair jump between poses (Dima 2026-11-16).
      const cyc = ((now / CHAT.turn + i) % 2 + 2) % 2
      const w = cyc < 1 ? smooth(cyc / CHAT.blend) : 1 - smooth((cyc - 1) / CHAT.blend)
      const base = mix(chatting(t, ph, false), chatting(t, ph, true), w)
      const u = spot.corner >= 0 ? burstTime(c, spot.corner, now) : null
      if (u === null) return { at: spot.at, yaw: spot.yaw, ...base }
      // Which way the machine is: the corner's first spot stands on its left.
      const side = c.spots.findIndex((s) => s.corner === spot.corner) === p.spot ? -1 : 1
      const { j, back } = startled(base, u, side)
      return { at: [spot.at[0] - Math.sin(spot.yaw) * back, spot.at[1], spot.at[2] - Math.cos(spot.yaw) * back], yaw: spot.yaw, ...j }
    }
    case 'standUp':
    case 'sitDown': {
      // Between the seat and the chair's exit; getting up = sit → stand, sitting down the reverse.
      // `spot` is the desk either way: the one being left, or (on arrival) the one being taken.
      const desk = spot
      const k = smooth((now - p.since) / CROWD.sitTime)
      const w = p.task === 'standUp' ? k : 1 - k // 0 = seated, 1 = standing at the exit
      const seat = seatAt(desk)
      const exit = desk.exit ?? desk.at
      const away = Math.atan2(exit[0] - seat[0], exit[2] - seat[2])
      // Standing at the exit they face the way they set off / came in.
      const n = p.path.length
      const heading = (a: Vec3, b: Vec3) => Math.atan2(b[0] - a[0], b[2] - a[2])
      const standYaw =
        n < 2 ? away : p.task === 'standUp' ? heading(p.path[0]!, p.path[1]!) : heading(p.path[n - 2]!, p.path[n - 1]!)
      const j = mix(typing(t, ph), ZERO, w)
      return {
        at: [seat[0] + (exit[0] - seat[0]) * w, seat[1], seat[2] + (exit[2] - seat[2]) * w],
        yaw: turn(desk.yaw, standYaw, smooth(w * 1.4)),
        ...j,
      }
    }
    case 'pace': {
      // Up and down on the phone: walk to the far end, a pause to turn, walk back.
      const a = spot.at
      const b = spot.end ?? spot.at
      const len = Math.hypot(b[0] - a[0], b[2] - a[2])
      const leg = len / PACE.speed
      const cycle = 2 * (leg + PACE.turn)
      const u = ((now - p.since + ph) % cycle + cycle) % cycle
      const out = u < leg + PACE.turn
      const v = out ? u : u - leg - PACE.turn
      const walkingNow = v < leg
      const k = walkingNow ? v / leg : 1
      const [from, to] = out ? [a, b] : [b, a]
      const heading = Math.atan2(to[0] - from[0], to[2] - from[2])
      // Turning at the end: from this heading to the way back, over the pause.
      const yaw = walkingNow ? heading : turn(heading, heading + Math.PI, smooth((v - leg) / PACE.turn))
      const d = (walkingNow ? v : leg) * PACE.speed
      const j = mix(ZERO, walking(d), walkingNow ? Math.min(smooth(d / 0.4), smooth((len - d) / 0.4)) : 0)
      // The phone at the right ear (angles solved for the hand to reach the ear: upper arm up,
      // out and twisted, elbow folded), the head tilted to it; the free hand gestures.
      j.armRX = -2.2
      j.armRY = -0.6
      j.armRZ = 0.5
      j.foreR = -1.7
      j.headY = 0
      j.torsoZ += 0.04
      j.armLX += Math.sin(t * 2.6) * 0.25 - 0.2
      j.foreL = -0.6 + Math.sin(t * 2.6 + 1) * 0.3
      return { at: [from[0] + (to[0] - from[0]) * k, from[1], from[2] + (to[2] - from[2]) * k], yaw, ...j, headX: j.headX + 0.05 }
    }
    case 'walk': {
      const d = (now - p.since) * CROWD.walkSpeed
      const { at, yaw } = alongPath(p.path, d)
      // Ease into and out of the walk over the first / last half metre.
      const k = Math.min(smooth(d / 0.5), smooth((p.length - d) / 0.5))
      return { at, yaw, ...mix(ZERO, walking(d), k) }
    }
  }
}
