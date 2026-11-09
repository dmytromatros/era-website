/**
 * Messages between the page and the physics worker (C2). Plain data only; the pose buffer is
 * transferred back and forth (no copy, no garbage per frame).
 */
import type { Vec3 } from '../layout'
import type { PropBody, StaticShape } from './propsModel'

/** A character as a solid capsule (props bounce off it; a hard hit makes it react). */
export interface ActorCollider {
  /** Feet. */
  at: Vec3
  radius: number
  height: number
}

/** Floats per body in the pose buffer: previous pose, then current (each: x y z, qx qy qz qw). */
export const POSE_FLOATS = 14

export type ToWorker =
  | {
      type: 'init'
      statics: StaticShape[]
      bodies: PropBody[]
      actors: ActorCollider[]
      ceilingY: number
      hz: number
    }
  | {
      type: 'step'
      /** Real seconds since the last step message. */
      dt: number
      camera: Vec3
      /** Clicks since the last step: velocity change for a body, at a point of it. */
      pushes: { body: number; dv: Vec3; point: Vec3 }[]
      buffer: Float32Array
    }
  | { type: 'hz'; hz: number }

export type FromWorker =
  | { type: 'ready'; buffer: Float32Array }
  | {
      type: 'state'
      buffer: Float32Array
      /** 0…1 between the previous and the current pose (fixed steps vs. real time). */
      alpha: number
      awake: number
      /** Milliseconds the step took in the worker. */
      ms: number
      /** Hard impacts: x, y, z, strength (0…1) — for dust puffs and squash. */
      impacts: number[]
      /** Characters hit hard (indices into `actors`). */
      hits: number[]
    }
