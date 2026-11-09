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
/** Palms under a held element stay this much in front of it (from the camera they touch it). */
const HOLD_HANDS_FRONT = 0.12

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
  /**
   * Its element, relative to the character's feet (C1): hands reach for it by IK — the palms of
   * a `holding` character press under `bottom`, a `pointing` one points at `centre`.
   */
  target: { centre: Vec3; bottom: Vec3 }
}

export interface ExhibitModel {
  elements: PlacedElement[]
  helpers: PlacedHelper[]
  /** Footprint and height, for the world layout. */
  width: number
  height: number
  /** Bottom of the elements above the floor (for the floor shadow). */
  elevation: number
  /**
   * Where the two legs of a display stand go (local x), so floating elements stand on something.
   * `null` when a character holds the group up instead.
   */
  stand: [number, number] | null
}

/**
 * @param specs all measured elements of the module
 * @param ids   the elements of this exhibit
 * @param k     world units per CSS pixel
 */
export function buildExhibit(specs: ElementSpec[], ids: string[], helpers: Helper[], k: number): ExhibitModel {
  const members = ids.map((id) => specs.find((s) => s.id === id)).filter((s): s is ElementSpec => !!s)
  if (!members.length) return { elements: [], helpers: [], width: 1, height: 1, elevation: 0, stand: null }

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
    const t = elements.find((e) => e.spec.id === helper.target)!
    const [cx, cy, cz] = t.local
    // Relative to the feet (both are shifted alike below, so this stays true).
    const target = (local: Vec3) => ({
      centre: [cx - local[0], cy - local[1], cz - local[2]] as Vec3,
      bottom: [cx - local[0], cy - (t.spec.height * k) / 2 - local[1], cz + HOLD_HANDS_FRONT - local[2]] as Vec3,
    })
    if (helper.pose === 'holding') {
      const local: Vec3 = [cx, 0, 0.3]
      return { helper, local, bubble: 'right', bubbleY: 1.35, target: target(local) }
    }
    // Others stand beside the group: first on the left, then on the right.
    const left = sideIndex++ % 2 === 0
    // Far enough out that raised arms and props do not cover the element.
    const local: Vec3 = [(left ? -1 : 1) * (width / 2 + SIDE_ROOM * 0.55), 0, 0.35]
    return { helper, local, bubble: 'above', bubbleY: BODY.height + 0.3, target: target(local) }
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
    stand: mine.some((h) => h.pose === 'holding')
      ? null
      : [shift - width / 2 + Math.min(0.25, width / 4), shift + width / 2 - Math.min(0.25, width / 4)],
  }
}

/** World position of a point given in an exhibit's local frame. */
export function toWorld(local: Vec3, anchor: Vec3, yaw: number): Vec3 {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [anchor[0] + local[0] * c + local[2] * s, anchor[1] + local[1], anchor[2] - local[0] * s + local[2] * c]
}
