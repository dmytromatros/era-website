/**
 * Swivel chairs (C2): a click spins the seat; it slows down on its own friction and settles back
 * facing its desk (a seat left turned round would stick through the desk). No physics engine
 * needed — one angle per chair, simulated only while it moves. Pure; tested in chairSpin.test.ts.
 */

export const SPIN = {
  /** Angular speed a click gives (rad/s), more for a click near the seat's edge. */
  kick: 9,
  maxSpeed: 22,
  /** Friction (1/s): how fast the spin dies away. */
  friction: 1.1,
  /** Below this speed the seat heads for the next "facing the desk" angle on a spring. */
  settleSpeed: 2.2,
  stiffness: 30,
  damping: 7,
  step: 1 / 120,
} as const

const TURN = Math.PI * 2

export interface Spin {
  angle: number
  speed: number
  /** Full turn it settles on, once slow (null while spinning freely). */
  target: number | null
}

export const spin = (): Spin => ({ angle: 0, speed: 0, target: null })

/** A click on a seat: `lever` −1…1 is where it was hit across the seat (sign = direction). */
export function kickSpin(s: Spin, lever: number) {
  const dir = lever === 0 ? 1 : Math.sign(lever)
  const push = SPIN.kick * (0.6 + Math.min(1, Math.abs(lever)) * 0.6)
  s.speed = Math.max(-SPIN.maxSpeed, Math.min(SPIN.maxSpeed, s.speed + dir * push))
  s.target = null
}

/** Advance by `dt`; returns false once the seat is back at rest facing the desk. */
export function stepSpin(s: Spin, dt: number): boolean {
  let left = Math.min(dt, 0.1)
  while (left > 1e-9) {
    const h = Math.min(SPIN.step, left)
    if (s.target === null && Math.abs(s.speed) < SPIN.settleSpeed) {
      // The next full turn ahead in the direction of motion: no backwards snap.
      s.target = s.speed >= 0 ? Math.ceil(s.angle / TURN - 1e-9) * TURN : Math.floor(s.angle / TURN + 1e-9) * TURN
    }
    if (s.target === null) s.speed -= s.speed * SPIN.friction * h
    else s.speed += (-SPIN.stiffness * (s.angle - s.target) - SPIN.damping * s.speed) * h
    s.angle += s.speed * h
    left -= h
  }
  if (s.target !== null && Math.abs(s.speed) < 0.02 && Math.abs(s.angle - s.target) < 0.002) {
    s.angle = 0
    s.speed = 0
    s.target = null
    return false
  }
  return true
}
