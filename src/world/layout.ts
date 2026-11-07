/**
 * Automatic world layout: turns the ordered list of exhibits into positions along a winding
 * path, and a camera viewpoint in front of each that fits it on screen. Pure — unit-tested.
 */
export type Vec3 = [number, number, number]

export interface StationInput {
  /** Footprint of the exhibit in world units (including any helper standing next to it). */
  width: number
  /** Height of its top above the floor. */
  height: number
  /** `side` = beside the path (exhibits); `center` = on the path (doors). */
  align: 'side' | 'center'
}

export interface StationLayout {
  /** Floor point under the exhibit's centre — the exhibit's local origin. */
  anchor: Vec3
  /** Y rotation so the exhibit faces its viewpoint. */
  yaw: number
  /** Where the camera stops to look at it. */
  viewpoint: Vec3
  /** What the camera looks at from the viewpoint. */
  focus: Vec3
}

export interface WorldLayout {
  stations: StationLayout[]
  /** Camera rail control points: [start, entered, ...viewpoints]. */
  rail: Vec3[]
  /** Look-at targets, one per rail point. */
  look: Vec3[]
}

/** Entrance geometry (camera starts looking at the hero "page"). */
export const ENTRANCE_GEOMETRY = {
  cameraStart: [0, 2.6, 10] as Vec3,
  /** Distance from the start camera to the plane where the hero twins sit. */
  heroDistance: 6,
  /** The membrane sits just behind the twins. */
  membraneDistance: 6.3,
  cameraEntered: [0, 1.9, 0.5] as Vec3,
  fov: 42,
}

export const PATH = {
  /** How much the path snakes left and right. */
  meander: 1.6,
  /** Gap between the path centre and the inner edge of a side exhibit. */
  clearance: 0.6,
  /** Extra room around an exhibit when fitting it on screen (vertical needs more: feet, bubbles). */
  marginX: 1.15,
  marginY: 1.45,
  minDistance: 3.2,
}

export function pathCenterX(i: number): number {
  return Math.sin(i * 0.8) * PATH.meander
}

/** Camera distance at which a box of `w × h` fits the screen. */
export function fitDistance(w: number, h: number, aspect: number): number {
  const t = Math.tan(((ENTRANCE_GEOMETRY.fov / 2) * Math.PI) / 180)
  return Math.max((h * PATH.marginY) / (2 * t), (w * PATH.marginX) / (2 * t * aspect), PATH.minDistance)
}

export function layoutWorld(inputs: StationInput[], aspect = 16 / 9): WorldLayout {
  const { cameraStart, cameraEntered } = ENTRANCE_GEOMETRY
  let cursorZ = cameraEntered[2]
  let sideCount = 0

  const stations = inputs.map((input, i): StationLayout => {
    const cx = pathCenterX(i)
    const d = fitDistance(input.width, input.height, aspect)
    const focusY = input.height / 2
    const eyeY = Math.max(focusY, 1.2)
    // Next viewpoint sits just past the previous exhibit, so the camera passes beside it.
    const viewZ = cursorZ - 2

    if (input.align === 'center') {
      const anchor: Vec3 = [cx, 0, viewZ - d]
      cursorZ = anchor[2] - 2.5
      return { anchor, yaw: 0, viewpoint: [cx, eyeY, viewZ], focus: [cx, focusY, anchor[2]] }
    }

    const s = sideCount++ % 2 === 0 ? -1 : 1
    const ax = cx + s * (input.width / 2 + PATH.clearance)
    const vx = cx + s * 0.2
    const dx = ax - vx
    const dz = Math.sqrt(Math.max(d * d - dx * dx, 1))
    const anchor: Vec3 = [ax, 0, viewZ - dz]
    cursorZ = anchor[2] - 1
    return {
      anchor,
      yaw: Math.atan2(vx - ax, viewZ - anchor[2]),
      viewpoint: [vx, eyeY, viewZ],
      focus: [ax, focusY, anchor[2]],
    }
  })

  return {
    stations,
    rail: [cameraStart, cameraEntered, ...stations.map((s) => s.viewpoint)],
    look: [
      [cameraStart[0], cameraStart[1], cameraStart[2] - 20],
      [cameraEntered[0], cameraEntered[1] - 0.2, cameraEntered[2] - 20],
      ...stations.map((s) => s.focus),
    ],
  }
}
