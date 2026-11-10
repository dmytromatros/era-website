/**
 * Maps scroll to the camera's journey. Pure functions — unit-tested.
 *
 * Scroll distance is measured in "units" of one viewport height:
 *   [0, ENTRANCE)                  entrance: through the membrane, hero elements fly to their spots
 *   then one segment per rail point stops (key ones longer, camera lingers) and corner / stair
 *                                  waypoints (see route.ts)
 *
 * The camera rail has control points: [start, entered, point 0, point 1, …].
 * `railIndex` is a float position on that list: 0 = start, 1 = entered, 2 = point 0, …
 */
/** Scroll units the entrance would take without the hold. */
export const ENTRANCE_RUN = 1.6
/**
 * The hold (D1, Dima 2026-11-10: "give it a bit more scroll"): right after the crack the
 * entrance progress barely moves for `units` of scroll — the visitor stumbles and looks at their
 * hands while scrolling a couple of wheel clicks, instead of skipping it. Before `from` the
 * progress is exactly as before (the seam and the crack are untouched), after `to` it runs at the
 * usual rate.
 */
export const HOLD = { from: 0.16, to: 0.16, units: 0 } as const
// Off since 2026-11-10 (units 0, to = from): the entrance is now a cutscene that holds the page
// itself (world/cutscene). The mechanism stays; give it units again to bring the pause back.
/** Scroll units of the whole entrance. */
export const ENTRANCE = HOLD.from * ENTRANCE_RUN + HOLD.units + (1 - HOLD.to) * ENTRANCE_RUN

/** Scroll units at entrance progress `e` (the inverse of entranceAt; in the hold, its start). */
export function entranceUnits(e: number): number {
  const a = HOLD.from * ENTRANCE_RUN
  if (e <= HOLD.from) return e * ENTRANCE_RUN
  if (e <= HOLD.to) return a + (HOLD.to > HOLD.from ? ((e - HOLD.from) / (HOLD.to - HOLD.from)) * HOLD.units : 0)
  return a + HOLD.units + (e - HOLD.to) * ENTRANCE_RUN
}

/** Entrance progress 0..1 at `units` of scroll (with the hold). */
export function entranceAt(units: number): number {
  const a = HOLD.from * ENTRANCE_RUN
  if (units <= a) return Math.max(units / ENTRANCE_RUN, 0)
  if (units <= a + HOLD.units) return HOLD.from + ((HOLD.to - HOLD.from) * (units - a)) / HOLD.units
  return Math.min(HOLD.to + (units - a - HOLD.units) / ENTRANCE_RUN, 1)
}
export const KEY_UNITS = 1.3
export const PASS_UNITS = 0.6

export interface Segment {
  /** Scroll units this segment takes. */
  units: number
  /** How much the camera slows at both ends (0 = constant speed, 0.85 = long pause). */
  dwell: number
}

export function totalUnits(segments: Segment[]): number {
  return ENTRANCE + segments.reduce((n, s) => n + s.units, 0)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Linger near both ends of a segment: slope `1 - dwell` at the ends, faster in the middle. */
export function dwellEase(s: number, dwell = 0.85): number {
  const x = clamp01(s)
  return x - (dwell * Math.sin(2 * Math.PI * x)) / (2 * Math.PI)
}

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

export interface TimelineState {
  /** 0..1 progress of the entrance phase. */
  entrance: number
  /** Float index into the rail control points. */
  railIndex: number
}

export function timeline(units: number, segments: Segment[]): TimelineState {
  const u = Math.min(Math.max(units, 0), totalUnits(segments))
  if (u < ENTRANCE || segments.length === 0) {
    const entrance = clamp01(entranceAt(u))
    return { entrance, railIndex: easeInOutCubic(entrance) }
  }
  let rest = u - ENTRANCE
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    if (rest <= seg.units || i === segments.length - 1) {
      return { entrance: 1, railIndex: 1 + i + dwellEase(rest / seg.units, seg.dwell) }
    }
    rest -= seg.units
  }
  return { entrance: 1, railIndex: 1 + segments.length }
}

/** Scroll position (px) → timeline units, normalised by the real scrollable distance. */
export function scrollToUnits(scrollY: number, maxScroll: number, segments: Segment[]): number {
  if (maxScroll <= 0) return 0
  return (Math.min(Math.max(scrollY, 0), maxScroll) / maxScroll) * totalUnits(segments)
}
