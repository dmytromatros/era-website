/**
 * Where on the rail a module's live widgets animate: while the camera is inside the module —
 * from a little before its first stop to a little after its last. Outside, a widget's 3D
 * texture keeps its last frame (no redraw, no texture upload). Pure; tested in route.test.ts.
 *
 * (Earlier the widgets were HTML laid over the 3D picture and this zone also hid them,
 * because nothing in the world could cover HTML. They are canvas textures in the world now.)
 */
import { createContext } from 'react'
import type { RoutePlan, Timing } from './route'

export interface RailRange {
  from: number
  to: number
}

/** How far (in rail points) before the first / after the last stop a widget still animates. */
export const ZONE_MARGIN = 0.6
/** Length (in rail points) of the fade in / out at the zone's ends. */
export const ZONE_FADE = 0.3

/** Rail range of all stops of one module. */
export function moduleRailRange(plan: RoutePlan, timing: Timing, blockIndex: number): RailRange | null {
  const rails = plan.stops.flatMap((stop, i) => (stop.blockIndex === blockIndex ? [timing.stopRail[i]!] : []))
  if (!rails.length) return null
  return { from: Math.min(...rails), to: Math.max(...rails) }
}

/** 1 inside the zone, 0 outside, a linear fade of ZONE_FADE at both ends. */
export function zoneOpacity(railIndex: number, zone: RailRange): number {
  const start = zone.from - ZONE_MARGIN
  const end = zone.to + ZONE_MARGIN
  const fadeIn = (railIndex - start) / ZONE_FADE
  const fadeOut = (end - railIndex) / ZONE_FADE
  return Math.min(1, Math.max(0, Math.min(fadeIn, fadeOut)))
}

/** The zone of the exhibit being rendered (set by <Exhibit>), plus the page timing. */
export const WidgetZoneContext = createContext<{ zone: RailRange; timing: Timing } | null>(null)
