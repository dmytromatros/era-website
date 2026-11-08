/**
 * The world seen through a portal door (docs/wow-plan.md, task B2) — pure; tested in
 * portalPreviewModel.test.ts.
 *
 * Behind each door of the portal hall the visitor sees the page that door leads to: its office
 * (same seed and accent as when they arrive, so the same furniture) and its hero heading,
 * from the spot where they will step out (its first viewpoint, see ArrivalDoor). That world is
 * placed in the DOOR's local space (+z towards the visitor, the door surface in the z = 0
 * plane): the arrival viewpoint just behind the door, looking straight in (−z), floors level.
 *
 * Instead of clipping at the door plane (a clipping plane makes every material compile a
 * second shader variant — a hitch), everything of that office that would stand in FRONT of
 * the door is left out here. The floor and the ceiling may cross the plane: seen from the
 * visitor's eye they project below / above the door opening, so they never show in it.
 */
import { DOOR_SPACING } from '@/blocks/door/doors'
import type { Page } from '@/content/schema'
import { layoutRoute, type Box, type Vec3 } from './layout'
import { buildOffice, type Office } from './officeModel'
import { officeStyle } from './officeStyle'
import { routePlan } from './route'

/**
 * The arrival viewpoint sits this far behind the door plane. Seen from the hall (≈ 7 m in front
 * of the door) the 1.76 m opening is a narrow window; set back like this, the other page's hero
 * heading fits in it.
 */
export const PREVIEW_BACK = 2.5
/** Keep things at least this far behind the door plane (metres). */
const MARGIN = 0.15
/** Measured sizes are unknown for another page (no DOM): plausible exhibit sizes, as in the tests. */
const EXHIBIT_SIZE = { width: 4, height: 2.6 }
/** Every page's hall has the other pages' doors — with three pages, two doors. */
const HALL_SIZE = { width: DOOR_SPACING + 2.4, height: 3.6 }

/** Inner world → door space: a turn about y, then a shift (x, z). */
export interface PreviewTransform {
  yaw: number
  position: Vec3
}

export interface PreviewModel {
  office: Office
  accent?: string
  transform: PreviewTransform
  /** The page's hero heading (lines) and eyebrow, where its first exhibit stands. */
  hero: { lines: string[]; eyebrow?: string; anchor: Vec3; yaw: number; up: number } | null
}

/** Door-space z of an inner point (x, z) — negative = behind the door, visible through it. */
export function doorZ(t: PreviewTransform, x: number, z: number): number {
  return -x * Math.sin(t.yaw) + z * Math.cos(t.yaw) + t.position[2]
}

/** Door-space (x, z) of an inner point. */
export function toDoor(t: PreviewTransform, x: number, z: number): [number, number] {
  return [x * Math.cos(t.yaw) + z * Math.sin(t.yaw) + t.position[0], doorZ(t, x, z)]
}

/**
 * The transform that puts `viewpoint` PREVIEW_BACK behind the door centre along `look` (a unit
 * door-space direction (x, z) into the door, from where the visitor looks at it — default
 * straight in, (0, −1)), and turns the other world so that looking from `viewpoint` to `focus`
 * runs along `look`. So the other page's hero sits in the middle of the opening as seen from
 * the hall, even for a door beside the camera. Heights stay (floor on floor).
 */
export function previewTransform(viewpoint: Vec3, focus: Vec3, look: [number, number] = [0, -1]): PreviewTransform {
  // A turn by `yaw` adds `yaw` to a direction's heading atan2(x, z).
  const yaw = Math.atan2(look[0], look[1]) - Math.atan2(focus[0] - viewpoint[0], focus[2] - viewpoint[2])
  const vx = viewpoint[0] * Math.cos(yaw) + viewpoint[2] * Math.sin(yaw)
  const vz = -viewpoint[0] * Math.sin(yaw) + viewpoint[2] * Math.cos(yaw)
  return { yaw, position: [look[0] * PREVIEW_BACK - vx, 0, look[1] * PREVIEW_BACK - vz] }
}

/** Largest door-space z of a footprint (centre ± half size, turned by its own yaw). */
function frontMost(t: PreviewTransform, center: Vec3, size: Vec3, yaw: number): number {
  const hx = size[0] / 2
  const hz = size[2] / 2
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  let z = -Infinity
  for (const [ax, az] of [
    [hx, hz],
    [hx, -hz],
    [-hx, hz],
    [-hx, -hz],
  ] as const) {
    // Architecture boxes are drawn with rotation.y = −yaw (CLAUDE.md rule 13), furniture with +yaw;
    // both signs are tried, so the test holds either way.
    for (const sign of [1, -1]) {
      const x = center[0] + ax * c + az * s * sign
      const zz = center[2] - ax * s * sign + az * c
      z = Math.max(z, doorZ(t, x, zz))
    }
  }
  return z
}

/** The office without anything that would stand in front of the door plane. */
export function cullInFront(office: Office, t: PreviewTransform): Office {
  const behind = (b: { center: Vec3; size: Vec3; yaw: number }) => frontMost(t, b.center, b.size, b.yaw) < -MARGIN
  const boxes = (list: Box[]) => list.filter(behind)
  return {
    ...office,
    solid: office.solid.filter(behind),
    glass: boxes(office.glass),
    frosted: boxes(office.frosted),
    lights: boxes(office.lights),
    windows: boxes(office.windows),
    footprints: office.footprints.filter((f) => doorZ(t, f.x, f.z) + f.r < -MARGIN),
  }
}

/** Everything a portal door needs to show `page` (null if it has no first stop). */
export function buildPreview(
  page: Page,
  sceneKey: string,
  aspect: number,
  look: [number, number] = [0, -1],
): PreviewModel | null {
  const plan = routePlan(page)
  const sizes = plan.stops.map((s) => (s.exhibit ? EXHIBIT_SIZE : HALL_SIZE))
  const layout = layoutRoute(plan, sizes, aspect)
  const first = layout.stations[0]
  if (!first) return null
  const style = officeStyle(sceneKey, page)
  const transform = previewTransform(first.viewpoint, first.focus, look)
  const office = cullInFront(buildOffice(layout, style.seed), transform)
  const block = page.blocks[plan.stops[0]!.blockIndex]
  const hero =
    block && block.type === 'hero'
      ? {
          lines: block.heading,
          eyebrow: block.eyebrow,
          anchor: first.anchor,
          yaw: first.yaw,
          up: first.focus[1] - first.anchor[1],
        }
      : null
  return { office, accent: style.accent, transform, hero }
}
