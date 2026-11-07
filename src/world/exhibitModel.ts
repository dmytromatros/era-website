/**
 * Builds one exhibit from measured 2D elements: where each element sits inside it and where
 * its helper characters stand. Pure. Local frame: origin on the floor under the exhibit's
 * centre, +y up, +z towards the viewer.
 */
import { BODY } from '@/actors/rig'
import type { Helper } from '@/content/schema'
import type { ElementSpec } from '@/experience/measure'

export type Vec3 = [number, number, number]

/** Lowest point of floating elements above the floor. */
const BASE_ELEVATION = 0.75
/** Bottom of an element held overhead by a `holding` helper. */
const HOLD_HEIGHT = BODY.height + 0.12
/** Room a side helper takes next to the elements. */
const SIDE_ROOM = 1.6

export interface PlacedElement {
  spec: ElementSpec
  /** Centre of the element in exhibit space. */
  local: Vec3
}

export interface PlacedHelper {
  helper: Helper
  local: Vec3
  /** Where the speech bubble opens: beside the character or above its head. */
  bubble: 'right' | 'above'
  /** Height of the bubble's anchor point above the floor. */
  bubbleY: number
}

export interface ExhibitModel {
  elements: PlacedElement[]
  helpers: PlacedHelper[]
  /** Footprint and height, for the world layout. */
  width: number
  height: number
  /** Bottom of the elements above the floor (for the floor shadow). */
  elevation: number
}

/**
 * @param specs all measured elements of the module
 * @param ids   the elements of this exhibit
 * @param k     world units per CSS pixel
 */
export function buildExhibit(specs: ElementSpec[], ids: string[], helpers: Helper[], k: number): ExhibitModel {
  const members = ids.map((id) => specs.find((s) => s.id === id)).filter((s): s is ElementSpec => !!s)
  if (!members.length) return { elements: [], helpers: [], width: 1, height: 1, elevation: 0 }

  const minX = Math.min(...members.map((s) => s.x))
  const maxX = Math.max(...members.map((s) => s.x + s.width))
  const minY = Math.min(...members.map((s) => s.y))
  const maxY = Math.max(...members.map((s) => s.y + s.height))
  const width = (maxX - minX) * k
  const height = (maxY - minY) * k
  const midX = (minX + maxX) / 2

  const mine = helpers.filter((h) => ids.includes(h.target))

  // Lift the group so anything held overhead clears the character's head.
  let elevation = BASE_ELEVATION
  for (const h of mine.filter((h) => h.pose === 'holding')) {
    const t = members.find((s) => s.id === h.target)!
    elevation = Math.max(elevation, HOLD_HEIGHT - (maxY - (t.y + t.height)) * k)
  }

  const elements = members.map(
    (spec): PlacedElement => ({
      spec,
      local: [(spec.x + spec.width / 2 - midX) * k, elevation + (maxY - (spec.y + spec.height / 2)) * k, 0],
    }),
  )

  let sideIndex = 0
  const placed = mine.map((helper): PlacedHelper => {
    const t = members.find((s) => s.id === helper.target)!
    if (helper.pose === 'holding') {
      return { helper, local: [(t.x + t.width / 2 - midX) * k, 0, 0.3], bubble: 'right', bubbleY: 1.35 }
    }
    // Others stand beside the group: first on the left, then on the right.
    const left = sideIndex++ % 2 === 0
    return {
      helper,
      // Far enough out that raised arms and props do not cover the element.
      local: [(left ? -1 : 1) * (width / 2 + SIDE_ROOM * 0.55), 0, 0.35],
      bubble: 'above',
      bubbleY: BODY.height + 0.3,
    }
  })

  // Centre everything (elements + characters) on the origin, so the camera frames the whole group.
  const HELPER_HALF_WIDTH = 0.6
  const left = Math.min(-width / 2, ...placed.map((p) => p.local[0] - HELPER_HALF_WIDTH))
  const right = Math.max(width / 2, ...placed.map((p) => p.local[0] + HELPER_HALF_WIDTH))
  const shift = -(left + right) / 2
  for (const e of elements) e.local[0] += shift
  for (const p of placed) p.local[0] += shift

  const sideHelpers = placed.filter((p) => p.helper.pose !== 'holding').length
  return {
    elements,
    helpers: placed,
    width: right - left,
    // Leave room above side helpers for their speech bubble.
    height: Math.max(elevation + height, sideHelpers ? BODY.height + 1.5 : placed.length ? BODY.height + 0.6 : 0),
    elevation,
  }
}

/** World position of a point given in an exhibit's local frame. */
export function toWorld(local: Vec3, anchor: Vec3, yaw: number): Vec3 {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [anchor[0] + local[0] * c + local[2] * s, anchor[1] + local[1], anchor[2] - local[0] * s + local[2] * c]
}
