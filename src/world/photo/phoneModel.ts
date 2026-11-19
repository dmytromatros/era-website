/**
 * The visitor's hand holding the phone up for the photo (E7): where it is in the frame. Pure —
 * tested in photo.test.ts; drawn by <Photo>.
 *
 * The phone is held in landscape by its right end, screen to the visitor, in the lower right of
 * the frame (camera-body space, like the hands of D1: x right, y up, the camera looks down −z).
 * Its screen is a real hole (a stencil mask, Photo.tsx): through it the visitor sees the office
 * itself — the viewfinder costs no second render of the scene.
 */
import type { Quat, Vec3, View } from '../firstPerson/handsModel'

/** The phone (m, landscape): body, and the screen's window in it (off-centre: a wide bezel on the right for the thumb). */
export const PHONE = {
  width: 0.15,
  height: 0.074,
  depth: 0.009,
  screen: { x0: -0.069, x1: 0.057, y0: -0.031, y1: 0.031 },
  /** Distance from the eye (m) on a wide screen; further on a tall one (it must fit). */
  distance: 0.62,
  /** Where its centre sits, as fractions of half the view at that distance (x right, y up). */
  across: 0.56,
  below: 0.3,
  /** Room kept between the phone's body and the frame's right edge (m): the thumb, the hand. */
  edge: 0.035,
  /** Where the shoulder is (camera-body space): the forearm runs to it, out of the frame. */
  shoulder: [0.26, -0.62, 0.14] as Vec3,
  /** Turned a little towards the middle of the frame, tipped back a touch. */
  yaw: -0.16,
  roll: -0.06,
  pitch: 0.08,
} as const

export interface PhonePose {
  position: Vec3
  quaternion: Quat
}

/** Further away on a tall screen (the same angle below the eye), as the hands of D1. */
const farther = (view: View) => Math.max(1, 1 / view.aspect) ** 0.75

/** Where the phone is held up (up = 1) — centre of its body, camera-body space. */
export function heldAt(view: View): Vec3 {
  const z = -PHONE.distance * farther(view)
  const half = Math.tan(((view.fov / 2) * Math.PI) / 180) * -z
  // Never past the frame's right edge (a tall screen): the thumb and the fingertips stick out a bit.
  const x = Math.min(half * view.aspect * PHONE.across, half * view.aspect - PHONE.width / 2 - PHONE.edge)
  return [x, -half * PHONE.below, z]
}

function quatFromEuler(x: number, y: number, z: number): Quat {
  // Order YXZ (turn, then tip, then roll), as three.js Euler 'YXZ'.
  const c1 = Math.cos(y / 2),
    s1 = Math.sin(y / 2)
  const c2 = Math.cos(x / 2),
    s2 = Math.sin(x / 2)
  const c3 = Math.cos(z / 2),
    s3 = Math.sin(z / 2)
  return [s2 * c1 * c3 + c2 * s1 * s3, c2 * s1 * c3 - s2 * c1 * s3, c2 * c1 * s3 - s2 * s1 * c3, c2 * c1 * c3 + s2 * s1 * s3]
}

/**
 * The phone `up` (0 = below the frame, 1 = held up; photoModel.photoAt) with the shutter's `jolt`
 * (the thumb presses: it dips and tips for a moment).
 */
export function phonePose(up: number, jolt: number, view: View): PhonePose {
  const [x, y, z] = heldAt(view)
  const half = Math.tan(((view.fov / 2) * Math.PI) / 180) * -z
  // From below the frame: the whole hand travels up from out of view (an arc, it swings in from the side a little).
  const away = 1 - Math.min(Math.max(up, 0), 1.2)
  const pos: Vec3 = [x + away * 0.05, y - away * (half + PHONE.height), z + away * 0.04 - jolt * 0.012]
  pos[1] -= jolt * 0.01
  return {
    position: pos,
    quaternion: quatFromEuler(PHONE.pitch + away * 0.5 + jolt * 0.07, PHONE.yaw, PHONE.roll - away * 0.25 + jolt * 0.03),
  }
}
