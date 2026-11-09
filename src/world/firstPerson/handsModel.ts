/**
 * The visitor's own hands tearing through the page (wow-plan D1). Pure functions — tested in
 * handsModel.test.ts; drawn by <Hands>, the film follows `filmAt` (Membrane.tsx).
 *
 * Everything is a function of the entrance progress `e` (= live.progress / ENTRANCE, rule 1):
 * no timers, so scrolling back plays it backwards and a portal arrival (e = 1) shows no hands.
 *
 *   e 0    → 0.07  the hands rise from below the frame to the film, under the tear point
 *   e 0.03 → 0.16  the palms press: the film stretches away where they are
 *   e 0.1  → 0.3   they pull apart — the tear opens as a slit between the palms
 *   e 0.26 → 0.46  they reach through and drop out of the frame
 *
 * The order of the entrance stays (CLAUDE.md rule 3): the film is fully torn by e = 0.42, the
 * hero elements fly from e = 0.3.
 *
 * Perspective trick: the film is ~6.3 m away, the hands ~0.5 m. They cannot reach it and do not
 * need to — the tear starts at the SCREEN point between the palms, so the eye reads a touch.
 *
 * Coordinates are the camera's (metres): x right, y up, the camera looks down −z.
 */

export type Vec3 = [number, number, number]

export const HANDS = {
  rise: [0, 0.07],
  press: [0.03, 0.09],
  release: [0.14, 0.24],
  spread: [0.1, 0.3],
  through: [0.26, 0.46],
  /** Past this the hands are out of the frame — not drawn at all. */
  end: 0.46,
  /** How far in front of the camera the palms press (m; a bit further on a tall screen). */
  depth: 0.85,
  /**
   * Half the gap between the palms when they first press / fully spread, as a fraction of half
   * the view's width at their depth (so they stay in the frame on a tall phone too)…
   */
  gap: [0.13, 0.55],
  /** …but never less than this (m): the palms must not overlap. */
  minGap: 0.06,
} as const

/** The film: open 0 → 1 (fully torn at e = 0.42), push = how far it stretches. */
export const FILM = {
  open: [0.1, 0.42],
  /** Peak stretch (world units, see Membrane's vertex shader). */
  push: 2.6,
} as const

export const smoothstep = (x: number, a: number, b: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}
const range = (e: number, r: readonly [number, number]) => smoothstep(e, r[0], r[1])

/** How hard the palms press on the film, 0..1. */
export const pressAt = (e: number) => range(e, HANDS.press) * (1 - range(e, HANDS.release))

export interface Film {
  /** 0 = intact, 1 = torn across the whole view. */
  open: number
  /** How far the film stretches away under the palms. */
  push: number
}

export function filmAt(e: number): Film {
  const open = range(e, FILM.open)
  return { open, push: pressAt(e) * FILM.push * (1 - open) }
}

/**
 * The tear between the palms: an upright ellipse whose half-width keeps just inside the palms
 * (so they read as prising it open), in the film's units. The film unites it with its round
 * hole (open² × 32), which takes over once the view is torn. [0, 0] = none yet.
 * `viewWidth` = width of the start view at the film's distance.
 */
export function slitAxes(open: number, palms: [Uv, Uv], viewWidth: number): [number, number] {
  const grow = Math.min(open * 6, 1)
  const half = ((palms[1].x - palms[0].x) / 2) * viewWidth * 0.8 * grow
  return half > 0 ? [half, half * 1.9] : [0, 0]
}

export interface Uv {
  /** 0..1 across the screen, left → right. */
  x: number
  /** 0..1, bottom → top. */
  y: number
}

/**
 * Where the visitor tears in: under the pointer (clamped so both hands fit in the frame), on a
 * touch screen the centre (the finger that scrolled is not a place the visitor chose).
 */
export function tearPoint(pointer: Uv, coarse: boolean): Uv {
  if (coarse) return { x: 0.5, y: 0.5 }
  return { x: Math.min(Math.max(pointer.x, 0.3), 0.7), y: Math.min(Math.max(pointer.y, 0.35), 0.68) }
}

export interface HandPose {
  /** Wrist position (camera space). */
  position: Vec3
  /** Euler XYZ (camera space): palm faces −z, fingers +y at zero. */
  rotation: Vec3
}

export interface HandsPose {
  visible: boolean
  left: HandPose
  right: HandPose
  /** 0..1 — how hard the palms press (drives the waves under them). */
  press: number
  /** Screen points (uv) of the palm centres. */
  palms: [Uv, Uv]
}

/** Height of the palm centre above the wrist (m) — HandGeometry builds the hand around it. */
export const PALM_CENTER = 0.06

export interface View {
  /** Width / height. */
  aspect: number
  /** Vertical field of view (degrees). */
  fov: number
}

/** Camera-space point at depth `d` in front of the camera, on the ray through screen point `uv`. */
export function unproject(uv: Uv, d: number, view: View): Vec3 {
  const t = Math.tan(((view.fov / 2) * Math.PI) / 180)
  return [(uv.x * 2 - 1) * t * view.aspect * d, (uv.y * 2 - 1) * t * d, -d]
}

/** Screen point (uv) of a camera-space point. */
export function project(p: Vec3, view: View): Uv {
  const t = Math.tan(((view.fov / 2) * Math.PI) / 180)
  const d = Math.max(-p[2], 1e-4)
  return { x: (p[0] / (d * t * view.aspect) + 1) / 2, y: (p[1] / (d * t) + 1) / 2 }
}

export function handsAt(e: number, tear: Uv, view: View): HandsPose {
  const t = Math.tan(((view.fov / 2) * Math.PI) / 180)
  const rise = range(e, HANDS.rise)
  const press = pressAt(e)
  const spread = range(e, HANDS.spread)
  const through = range(e, HANDS.through)
  const visible = e > 1e-4 && e < HANDS.end

  // A little push forward while pressing — along the ray, so the palms stay on the tear point.
  const d = HANDS.depth * Math.max(1, Math.sqrt(1 / view.aspect)) + 0.05 * press
  const [cx, cy] = unproject(tear, d, view)
  // Below the bottom edge of the frame at this depth, with the fingers out of view too.
  const below = -t * d - 0.22 - cy
  const halfWidth = t * view.aspect * d
  const gap = Math.max(HANDS.minGap, (HANDS.gap[0] + (HANDS.gap[1] - HANDS.gap[0]) * spread) * halfWidth)

  const pose = (side: -1 | 1): HandPose => {
    // Rise, press, then reach through: forward and down.
    const y = cy - PALM_CENTER + below * (1 - rise) + below * through * through * 1.25
    const z = -d - 0.3 * through
    const x = cx + side * gap * (1 + 0.6 * through)
    return {
      position: [x, y, z],
      rotation: [
        // Wrist bends back while pressing; fingers tip forward to dive through.
        0.18 * press - 1.1 * through,
        // Palms turn slightly inwards, a little more as they pull apart.
        -side * (0.12 + 0.18 * spread),
        // Fingers lean outwards, more while spreading (prising the slit open).
        -side * (0.1 + 0.25 * spread),
      ],
    }
  }
  const left = pose(-1)
  const right = pose(1)
  const palmOf = (h: HandPose): Uv => project([h.position[0], h.position[1] + PALM_CENTER, h.position[2]], view)
  return { visible, left, right, press, palms: [palmOf(left), palmOf(right)] }
}
