/**
 * The route plan: which module becomes which kind of space (zone), what happens between them
 * (turn, stairs), and the order of everything the camera passes. Pure — derived from page data
 * only, so the 2D side (scroll track height) and the 3D side always agree.
 */
import type { Block, Page } from '@/content/schema'
import { pageStops, type Stop } from './stops'
import { KEY_UNITS, PASS_UNITS, type Segment } from './timeline'

export type ZoneShape = 'open' | 'corridor'
export type Transition = 'straight' | 'left' | 'right' | 'stairs-up' | 'stairs-down'

export interface Zone {
  blockIndex: number
  shape: ZoneShape
  /** What happens on the way into this zone. */
  before: Transition
}

/** One point on the camera rail after the entrance: a stop, or a corner / stair waypoint. */
export type PlanItem = { kind: 'stop'; stopIndex: number; key: boolean } | { kind: 'waypoint' }

export interface RoutePlan {
  zones: Zone[]
  stops: Stop[]
  items: PlanItem[]
}

/** Camera rail points a transition adds (enter + leave the corner / bottom + top of stairs). */
export const TRANSITION_WAYPOINTS = 2
/** Scroll units spent on each corner / stair waypoint. */
export const WAYPOINT_UNITS = 0.6

function defaultShape(block: Block): ZoneShape {
  return block.type === 'cards' || block.type === 'steps' ? 'corridor' : 'open'
}

/**
 * Defaults: the hero is an open hall; cards and steps are corridors, each entered by a turn
 * (right, then left, alternating); a CTA sits up a flight of stairs; doors continue straight.
 * A module's `route` in content overrides any of this.
 */
export function pageZones(page: Page): Zone[] {
  let turns = 0
  return page.blocks.map((block, blockIndex): Zone => {
    const hint = 'route' in block ? block.route : undefined
    const shape = hint?.shape ?? defaultShape(block)
    let before: Transition
    if (blockIndex === 0) before = 'straight'
    else if (hint?.before) before = hint.before
    else if (block.type === 'door') before = 'straight'
    else if (block.type === 'cta') before = 'stairs-up'
    else if (shape === 'corridor') before = turns % 2 === 0 ? 'right' : 'left'
    else before = 'straight'
    if (before === 'left' || before === 'right') turns++
    return { blockIndex, shape, before }
  })
}

export function isTurn(t: Transition): t is 'left' | 'right' {
  return t === 'left' || t === 'right'
}

export function routePlan(page: Page): RoutePlan {
  const zones = pageZones(page)
  const stops = pageStops(page)
  const items: PlanItem[] = []
  for (const zone of zones) {
    if (zone.before !== 'straight') {
      for (let k = 0; k < TRANSITION_WAYPOINTS; k++) items.push({ kind: 'waypoint' })
    }
    stops.forEach((stop, stopIndex) => {
      if (stop.blockIndex === zone.blockIndex) items.push({ kind: 'stop', stopIndex, key: stop.key })
    })
  }
  return { zones, stops, items }
}

export interface Timing {
  /** One segment per rail point after "entered" (see timeline.ts). */
  segments: Segment[]
  /** Rail index at which the camera stands at each stop. */
  stopRail: number[]
  /** Rail indices of the key stops — where the camera really stops (the accents). */
  keyRail: number[]
}

export function planTiming(plan: RoutePlan): Timing {
  const stopRail: number[] = []
  const keyRail: number[] = []
  const segments = plan.items.map((item, i): Segment => {
    if (item.kind === 'waypoint') return { units: WAYPOINT_UNITS, dwell: 0.5 }
    stopRail[item.stopIndex] = 2 + i // rail: [start, entered, ...items]
    if (item.key) keyRail.push(2 + i)
    // Arriving at a key stop: slow down a lot. Passing a minor one: barely.
    return item.key ? { units: KEY_UNITS, dwell: 0.85 } : { units: PASS_UNITS, dwell: 0.35 }
  })
  return { segments, stopRail, keyRail }
}
