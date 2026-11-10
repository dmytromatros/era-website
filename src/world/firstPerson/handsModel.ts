/**
 * The visitor's own hands on the film (wow-plan D1). Pure functions — tested in
 * handsModel.test.ts; drawn by <Hands>.
 *
 * The story (Dima, 2026-11-10: "by accident, not on purpose"): with the first scroll the
 * visitor leans on the page like on a shop window — palms flat on the "glass", pressing harder
 * as they scroll (the film bulges, strains). Then it gives way: the film bursts under one palm,
 * the hands lose their support and plunge forward out of the frame, the camera lurches
 * (breakModel.ts). Before the crack everything follows the entrance progress `e`
 * (= entranceAt(live.progress), timeline.ts; rule 1); the crack itself plays in real time from the moment it
 * happens (`brk`), like the ripple at the handover — an accident has its own speed.
 *
 * Perspective trick: the film is ~6.3 m away, the hands ~0.9 m. They cannot reach it and do not
 * need to — the film bulges at the SCREEN point between the palms, so the eye reads a touch.
 *
 * Coordinates are the camera's (metres): x right, y up, the camera looks down −z.
 */

export type Vec3 = [number, number, number]
/** Quaternion x, y, z, w. */
export type Quat = [number, number, number, number]

export const HANDS = {
  /** The hands rise from below the frame to the film… */
  rise: [0, 0.06],
  /** …and lean on it harder and harder until it gives way (breakModel BREAK.at). */
  lean: [0.03, 0.13],
  /** How far in front of the camera the palms rest (m; a bit further on a tall screen). */
  depth: 0.85,
  /** Half the gap between the palms, as a fraction of half the view's width at their depth… */
  gap: 0.3,
  /** …within these limits (m): the palms must not overlap, nor drift apart on a wide screen. */
  minGap: 0.1,
  maxGap: 0.17,
  /**
   * The shoulders (camera space): each forearm points back towards its own shoulder, below and
   * outside the frame — so the sleeves always spread apart downwards and can never cross, on any
   * screen (they crossed on a phone when the forearm simply followed the hand's tilt).
   */
  shoulder: [0.24, -0.62, 0.12] as Vec3,
  /** After the crack: how long each hand takes to fall out of the frame (s)… */
  fall: 0.55,
  /** …and how much later the second hand goes (the first one slipped). */
  lag: 0.08,
} as const

/**
 * The confused look after the crack (s after it; breakModel KICK.look moves the head at the same
 * moments): the hands come up into view, the head looks at the left one, then the right one,
 * then they go down again. A window is [in from, in to, out from, out to].
 */
export const LOOK = {
  in: [1.15, 1.6],
  out: [3.75, 4.25],
  left: [1.6, 1.9, 2.35, 2.6],
  right: [2.4, 2.7, 3.05, 3.3],
} as const
/**
 * Where the right palm is while the visitor looks at the hands (body space: below the eyes, in
 * front; the left one mirrored) — closer together on a narrow screen, so both fit its picture.
 */
export function lookPalm(view: View): Vec3 {
  // Further away on a tall screen (same angle below the eyes), like the leaning hands.
  const k = Math.max(1, 1 / view.aspect) ** 0.75
  const z = -0.48 * k
  const halfWidth = Math.tan(((view.fov / 2) * Math.PI) / 180) * view.aspect * -z
  return [Math.min(0.15 * k, Math.max(0.65 * halfWidth, 0.075)), -0.26 * k, z]
}

/** How far the head turns to look straight at one hand (rad). */
export const glanceYaw = (view: View) => {
  const p = lookPalm(view)
  return Math.atan2(p[0], -p[2])
}

/**
 * Direction of the forearm from the wrist in the hand's own frame (fingers +y, palm −z) — the
 * hand is bent back at the wrist, as when leaning on glass. HandGeometry builds the sleeve along
 * it; `handsAt` turns the hand so that this axis points to the shoulder.
 */
export const FOREARM: Vec3 = [0, -0.62, 0.78]
/**
 * The walking hand's forearm (D2): a straight wrist, the hand just carries on from the forearm
 * (bent a touch back). A bent wrist turned palm-in looked broken sideways (Dima 2026-11-10).
 */
export const FOREARM_STRAIGHT: Vec3 = [0, -0.97, 0.24]
export type Wrist = 'bent' | 'straight'
/** Sleeve length of the walking hand: wrist to just past the elbow (out of the frame). */
export const SLEEVE_WALK = 0.62
export const sleeveOf = (w: Wrist) => (w === 'bent' ? SLEEVE : SLEEVE_WALK)
export const forearmOf = (w: Wrist): Vec3 => (w === 'bent' ? FOREARM : FOREARM_STRAIGHT)
/** Sleeve length from the wrist (m) — long enough to always leave the frame. */
export const SLEEVE = 1.45

/** The film: how far it stretches under the leaning palms (world units, Membrane's vertex shader). */
export const FILM = { push: 2.4 } as const

export const smoothstep = (x: number, a: number, b: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}
const range = (e: number, r: readonly [number, number]) => smoothstep(e, r[0], r[1])
const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

/** How hard the palms lean on the film, 0..1 (before the crack). */
export const leanAt = (e: number) => range(e, HANDS.lean)

export interface Uv {
  /** 0..1 across the screen, left → right. */
  x: number
  /** 0..1, bottom → top. */
  y: number
}

/**
 * Where the visitor leans: under the pointer (clamped so both hands fit in the frame), on a
 * touch screen the centre (the finger that scrolled is not a place the visitor chose).
 */
export function tearPoint(pointer: Uv, coarse: boolean): Uv {
  if (coarse) return { x: 0.5, y: 0.5 }
  return { x: Math.min(Math.max(pointer.x, 0.3), 0.7), y: Math.min(Math.max(pointer.y, 0.35), 0.68) }
}

export interface HandPose {
  /** Wrist position (camera space). */
  position: Vec3
  /** Orientation (camera space): at identity the palm faces −z, fingers +y. */
  quaternion: Quat
}

export interface HandsPose {
  visible: boolean
  left: HandPose
  right: HandPose
  /** 0..1 — how hard the palms press (the film bulges, waves under them). */
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

/**
 * The crack, as the hands see it: seconds since it, which hand slipped first, and how much of
 * the confused look plays (breakModel lookWeight: fades as the visitor scrolls on).
 */
export interface Crack {
  t: number
  side: -1 | 1
  look: number
}

const window4 = (t: number, a: number, b: number, c: number, d: number) => smoothstep(t, a, b) * (1 - smoothstep(t, c, d))

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

// ---- tiny quaternion helpers (no three.js here: pure and fast) ----
const qMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
/** Euler XYZ (three.js order) → quaternion. */
export function qEuler(x: number, y: number, z: number): Quat {
  const [c1, c2, c3] = [Math.cos(x / 2), Math.cos(y / 2), Math.cos(z / 2)]
  const [s1, s2, s3] = [Math.sin(x / 2), Math.sin(y / 2), Math.sin(z / 2)]
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]
}
export function qRotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q
  const ix = w * v[0] + y * v[2] - z * v[1]
  const iy = w * v[1] + z * v[0] - x * v[2]
  const iz = w * v[2] + x * v[1] - y * v[0]
  const iw = -x * v[0] - y * v[1] - z * v[2]
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]
}
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
/** Shortest rotation taking unit vector a onto unit vector b. */
function qBetween(a: Vec3, b: Vec3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const q: Quat = [c[0], c[1], c[2], 1 + d]
  const l = Math.hypot(...q) || 1
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

/** The palm centre (same space as the pose). */
export const palmPoint = (h: HandPose): Vec3 => {
  const up = qRotate(h.quaternion, [0, PALM_CENTER, 0])
  return [h.position[0] + up[0], h.position[1] + up[1], h.position[2] + up[2]]
}

/** Where the elbow end of the sleeve is (camera space) — tests check the sleeves never cross. */
export const sleeveEnd = (h: HandPose, wrist: Wrist = 'bent'): Vec3 => {
  const a = qRotate(h.quaternion, norm(forearmOf(wrist)))
  const l = sleeveOf(wrist)
  return [h.position[0] + a[0] * l, h.position[1] + a[1] * l, h.position[2] + a[2] * l]
}

const shoulderOf = (side: -1 | 1): Vec3 => [side * HANDS.shoulder[0], HANDS.shoulder[1], HANDS.shoulder[2]]

/**
 * Put a hand with its palm centre at `palm`: turn it so the forearm points back to the shoulder,
 * the wrist goes where that leaves the palm on its spot (two passes: the aim depends on the wrist).
 */
function place(palm: Vec3, pose: Quat, shoulder: Vec3, wrist: Wrist = 'bent'): HandPose {
  const forearm = norm(forearmOf(wrist))
  let position: Vec3 = [palm[0], palm[1] - PALM_CENTER, palm[2]]
  let quaternion = pose
  for (let i = 0; i < 2; i++) {
    const want = norm([shoulder[0] - position[0], shoulder[1] - position[1], shoulder[2] - position[2]])
    quaternion = qMul(qBetween(qRotate(pose, forearm), want), pose)
    const up = qRotate(quaternion, [0, PALM_CENTER, 0])
    position = [palm[0] - up[0], palm[1] - up[1], palm[2] - up[2]]
  }
  return { position, quaternion }
}

/**
 * Turn a placed hand about its own forearm (which keeps pointing at the shoulder) until the palm
 * faces `toward` as closely as it can — then put the palm back on its spot.
 */
function turnPalm(h: HandPose, palm: Vec3, toward: Vec3, wrist: Wrist): HandPose {
  const a = qRotate(h.quaternion, norm(forearmOf(wrist)))
  const flat = (v: Vec3): Vec3 => {
    const d = v[0] * a[0] + v[1] * a[1] + v[2] * a[2]
    return norm([v[0] - a[0] * d, v[1] - a[1] * d, v[2] - a[2] * d])
  }
  const n = flat(qRotate(h.quaternion, [0, 0, -1]))
  const t = flat(toward)
  const cross: Vec3 = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]]
  const angle = Math.atan2(cross[0] * a[0] + cross[1] * a[1] + cross[2] * a[2], n[0] * t[0] + n[1] * t[1] + n[2] * t[2])
  const s = Math.sin(angle / 2)
  const quaternion = qMul([a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)], h.quaternion)
  const up = qRotate(quaternion, [0, PALM_CENTER, 0])
  return { position: [palm[0] - up[0], palm[1] - up[1], palm[2] - up[2]], quaternion }
}

/** Which way a hand's palm faces (same space as the pose). */
export const palmNormal = (h: HandPose): Vec3 => qRotate(h.quaternion, [0, 0, -1])

/** What the walking hands need from the gait (walkModel Walk). */
export interface Gait {
  phase: number
  moving: number
  run: number
}

/**
 * The hands while walking (D2, body space): they swing in turn with the steps — each one peeks
 * into the bottom of the frame as it swings forward — higher and harder at a run, down out of
 * the frame at a standstill, palms facing in. They never reach up to where the cards are.
 */
export function walkHandsAt(g: Gait, view: View): HandsPose {
  const k = Math.max(1, 1 / view.aspect) ** 0.75
  const z0 = -0.45 * k
  const halfWidth = Math.tan(((view.fov / 2) * Math.PI) / 180) * view.aspect * -z0
  const amp = g.moving * (1 + 1.2 * g.run)
  const pose = (side: -1 | 1): HandPose => {
    // Left arm forward with the right foot: opposite swings, one cycle per two footfalls.
    const swing = side * -Math.sin(g.phase)
    const fwd = Math.max(swing, 0)
    const x = Math.min(0.22 * k, Math.max(0.75 * halfWidth, 0.09))
    const palm: Vec3 = [
      // Swinging forward, the hand comes in towards the middle (arms bent, as when jogging).
      side * x * (1 - 0.35 * fwd * Math.min(amp, 1)),
      (-0.27 + 0.065 * fwd * amp - 0.02 * g.run - 0.4 * (1 - g.moving)) * k,
      z0 - 0.12 * swing * amp,
    ]
    // Bent at the elbow (Dima 2026-11-10: "not straight like sticks"): the forearm runs from the
    // hand down, out and back to the elbow — below and outside the frame, swinging with the arm —
    // instead of all the way to the shoulder. Straight wrist, fingers forward and a little in,
    // palms facing in, towards each other; the edge of the hand leads.
    const elbow: Vec3 = [side * (x + 0.2 * k), palm[1] - 0.26 * k, palm[2] + 0.36 * k + 0.05 * swing * amp]
    const placed = place(palm, qEuler(-1.05 - 0.3 * swing * amp, 0, 0), elbow, 'straight')
    return turnPalm(placed, palm, [-side, 0, 0], 'straight')
  }
  const left = pose(-1)
  const right = pose(1)
  return { visible: g.moving > 0.02, left, right, press: 0, palms: [project(palmPoint(left), view), project(palmPoint(right), view)] }
}

export function handsAt(e: number, tear: Uv, view: View, crack: Crack | null = null): HandsPose {
  const t = Math.tan(((view.fov / 2) * Math.PI) / 180)
  const rise = range(e, HANDS.rise)
  const lean = leanAt(e)

  // Leaning harder pushes the palms a little further — along the ray, so they stay put on screen.
  const d = HANDS.depth * Math.max(1, 1 / view.aspect) ** 0.75 + 0.05 * lean
  const [cx, cy] = unproject(tear, d, view)
  // Below the bottom edge of the frame at this depth, with the fingers out of view too.
  const below = -t * d - 0.22 - cy
  const halfWidth = t * view.aspect * d
  const gap = Math.min(Math.max(HANDS.gap * halfWidth, HANDS.minGap), HANDS.maxGap)



  // The confused look: the hands come up in front, below the eyes; each is lifted and turned
  // over while the head looks at it.
  const looking = crack ? window4(crack.t, LOOK.in[0], LOOK.in[1], LOOK.out[0], LOOK.out[1]) * crack.look : 0
  const lookPose = (side: -1 | 1, c: Crack): HandPose => {
    const w = side === -1 ? LOOK.left : LOOK.right
    const mine = window4(c.t, w[0], w[1], w[2], w[3]) * c.look
    const turn = mine * 0.9 * Math.sin((c.t - w[0]) * 5.5)
    const at = lookPalm(view)
    const palm: Vec3 = [side * at[0] * (1 - 0.3 * mine), at[1] - 0.6 * (1 - looking) + 0.07 * mine, at[2] + 0.07 * mine]
    return place(palm, qEuler(0.45 + 0.25 * mine, -side * 0.15 + side * turn, side * (0.15 - 0.2 * mine)), shoulderOf(side))
  }

  const pose = (side: -1 | 1): HandPose => {
    if (crack && looking > 0 && crack.t >= LOOK.in[0]) return lookPose(side, crack)
    // After the crack: the support is gone — forward through the hole and down out of frame,
    // the second hand a moment later, flailing up first (it tries to catch itself).
    const k = crack ? clamp01((crack.t - (side === crack.side ? 0 : HANDS.lag)) / HANDS.fall) : 0
    const fall = k * k
    const slipped = crack !== null && side === crack.side
    const flail = crack && !slipped ? Math.sin(Math.PI * Math.min(k * 1.8, 1)) : 0
    const palm: Vec3 = [
      cx + side * gap * (1 + 0.5 * k),
      cy + below * (1 - rise) + below * 2.6 * fall + 0.07 * flail,
      -d - 0.65 * fall,
    ]
    // Palms flat on the glass, wrists bent back as they lean; after the crack the fingers tip
    // forward and the hands twist (one slips, the other flails).
    return place(palm, qEuler(0.12 * lean - 1.3 * k, -side * 0.1, side * (0.1 + (slipped ? 0.5 : -0.9) * k)), shoulderOf(side))
  }

  const left = pose(-1)
  const right = pose(1)
  const palmOf = (h: HandPose): Uv => {
    const up = qRotate(h.quaternion, [0, PALM_CENTER, 0])
    return project([h.position[0] + up[0], h.position[1] + up[1], h.position[2] + up[2]], view)
  }
  // Out of the frame between the fall and the look (and after it): not drawn.
  const gone = crack !== null && crack.t >= HANDS.lag + HANDS.fall && !(crack.t >= LOOK.in[0] && looking > 1e-3)
  return {
    visible: e > 1e-4 && !gone,
    left,
    right,
    press: crack ? 0 : lean,
    palms: [palmOf(left), palmOf(right)],
  }
}
