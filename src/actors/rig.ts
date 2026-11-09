import type { RefObject } from 'react'
import type * as THREE from 'three'

/**
 * Joints of a blocky character. Every activity animates these each frame, starting from the
 * rest pose (all rotations zero: standing, arms down, facing +z).
 *
 * Sign conventions (useful when writing a new move):
 *   arm.rotation.x < 0  → arm swings forward
 *   armL.rotation.z < 0 / armR.rotation.z > 0 → arm lifts out to the side (≈ ±2.6 = overhead)
 *   head.rotation.y > 0 → looks to its left (+x)
 *   fore*.rotation.x < 0 / shin*.rotation.x > 0 → elbow / knee bends the natural way
 *
 * Arms and legs have two bones each (C1) so hands and feet can be placed by IK (ik.ts). At rest
 * the lower bone continues the upper one exactly, so a standing character looks as before.
 */
export interface Rig {
  root: RefObject<THREE.Group | null>
  torso: RefObject<THREE.Group | null>
  head: RefObject<THREE.Group | null>
  armL: RefObject<THREE.Group | null>
  armR: RefObject<THREE.Group | null>
  foreL: RefObject<THREE.Group | null>
  foreR: RefObject<THREE.Group | null>
  legL: RefObject<THREE.Group | null>
  legR: RefObject<THREE.Group | null>
  shinL: RefObject<THREE.Group | null>
  shinR: RefObject<THREE.Group | null>
  /** Ankles: keep the shoes flat on the floor when the knees bend. */
  footL: RefObject<THREE.Group | null>
  footR: RefObject<THREE.Group | null>
  eyes: RefObject<THREE.Group | null>
  mouth: RefObject<THREE.Mesh | null>
}

/** Non-null joints, handed to animation functions once the rig is mounted. */
export type Joints = { [K in keyof Rig]: NonNullable<Rig[K]['current']> }

export function resolveJoints(rig: Rig): Joints | null {
  const out: Partial<Joints> = {}
  for (const key of Object.keys(rig) as (keyof Rig)[]) {
    const value = rig[key].current
    if (!value) return null
    ;(out as Record<string, unknown>)[key] = value
  }
  return out as Joints
}

export function resetPose(j: Joints) {
  for (const g of [j.root, j.torso, j.head, j.armL, j.armR, j.foreL, j.foreR, j.legL, j.legR, j.shinL, j.shinR, j.footL, j.footR]) {
    g.rotation.set(0, 0, 0)
  }
  for (const g of [j.armL, j.armR, j.legL, j.legR]) g.scale.set(1, 1, 1)
  j.root.position.set(0, 0, 0)
  j.armL.position.y = BODY.shoulderY
  j.armR.position.y = BODY.shoulderY
  j.eyes.position.set(0, EYES.y, EYES.z)
  j.eyes.scale.set(1, 1, 1)
}

/** Proportions shared by the body, props and labels (in actor units, feet at y = 0). */
export const BODY = {
  hipY: 0.62,
  shoulderY: 0.56, // relative to the torso pivot
  shoulderX: 0.39,
  neckY: 0.66, // relative to the torso pivot
  armLength: 0.58,
  /** Two-bone limbs: upper arm + forearm (to the end of the hand), thigh + shin (to the sole). */
  upperArm: 0.29,
  foreArm: 0.29,
  thigh: 0.31,
  shin: 0.31,
  headSize: 0.5,
  /** Top of the head in actor units. */
  height: 1.78,
}

/** Rest position of the eyes on the face (head space). */
export const EYES = { y: 0.27, z: 0.234 }
