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
 */
export interface Rig {
  root: RefObject<THREE.Group | null>
  torso: RefObject<THREE.Group | null>
  head: RefObject<THREE.Group | null>
  armL: RefObject<THREE.Group | null>
  armR: RefObject<THREE.Group | null>
  legL: RefObject<THREE.Group | null>
  legR: RefObject<THREE.Group | null>
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
  for (const g of [j.torso, j.head, j.armL, j.armR, j.legL, j.legR]) g.rotation.set(0, 0, 0)
  j.root.position.y = 0
}

/** Proportions shared by the body, props and labels (in actor units, feet at y = 0). */
export const BODY = {
  hipY: 0.62,
  shoulderY: 0.56, // relative to the torso pivot
  shoulderX: 0.39,
  neckY: 0.66, // relative to the torso pivot
  armLength: 0.58,
  headSize: 0.5,
  /** Top of the head in actor units. */
  height: 1.78,
}
