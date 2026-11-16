/**
 * The magnet (Dima, 2026-11-16, after a 3D developer's advice and one round of trying): the
 * visitor scrolls freely and stops wherever they like — but letting go ALMOST on a point of
 * interest (a stop: the headline, the tags, a section heading, a card, a step, the CTA, the door;
 * the characters stand by their elements), the page glides the last bit so the shot sits exactly
 * as framed. Anywhere else the camera stays right where they let go. Scrolling again takes over
 * at once: nothing is locked. Pure parts here (settleModel.test.ts); <Settle> moves the page.
 *
 * Rejected on the way (Dima: "I can't stop where I want, the page makes me stop only at some
 * points"): gliding on to the next KEY stop in the direction of travel — a light scroll off a
 * stop ran all the way to the next one. Corners and stairs are not magnets.
 */
import type { Timing } from './route'
import { ENTRANCE } from './timeline'

export const SETTLE = {
  /** No scroll from the visitor this long (ms) = they let go. */
  idleMs: 180,
  /** A scroll this soon (ms) after the visitor's input (or their last scroll) is theirs too (inertia). */
  inputMs: 1000,
  /**
   * The magnet's reach (scroll units = viewport heights): about half a mouse-wheel click. One
   * click off a stop already leaves it — nothing pulls the visitor back.
   */
  reach: 0.07,
  /** Closer than this to a stop (units): already there. */
  eps: 0.003,
  /** Glide time (s): `base + units / speed`, within [min, max]. */
  base: 0.3,
  speed: 1.6,
  min: 0.35,
  max: 0.6,
} as const

/** Scroll units of every stop (where the camera stands at it), ascending. */
export function settleAnchors(timing: Timing): number[] {
  const ends: number[] = []
  let u = ENTRANCE
  for (const seg of timing.segments) ends.push((u += seg.units))
  // Segment i ends on rail point 2 + i (route.ts: rail = [start, entered, ...items]).
  return timing.stopRail.map((rail) => ends[rail - 2]!).sort((a, b) => a - b)
}

/** Where the magnet pulls the page from `units` (scroll units); `null` = stay right there. */
export function settleTarget(units: number, anchors: number[]): number | null {
  let near: number | null = null
  for (const a of anchors) if (near === null || Math.abs(a - units) < Math.abs(near - units)) near = a
  if (near === null) return null
  const d = Math.abs(near - units)
  return d > SETTLE.eps && d <= SETTLE.reach ? near : null
}

/** How long the glide over `units` takes (s). */
export const settleDuration = (units: number) =>
  Math.min(Math.max(SETTLE.base + Math.abs(units) / SETTLE.speed, SETTLE.min), SETTLE.max)

/** Glide shape: smooth start and a soft landing. */
export function settleEase(t: number): number {
  const x = Math.min(Math.max(t, 0), 1)
  return x * x * (3 - 2 * x)
}
