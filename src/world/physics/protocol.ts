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

/**
 * The office's people (E2a crowd) as solids for the props, written by <Crowd> every frame and
 * sent with each step: standing / walking people as capsules (feet x, y, z each), and still
 * things the crowd draws (the corridor sofa) as boxes. Dima 2026-11-16: balls flew through them.
 */
export const crowdColliders: { people: number[]; boxes: StaticShape[]; version: number } = { people: [], boxes: [], version: 0 }
/** At most this many crowd capsules (more are left out). */
export const MAX_CROWD_COLLIDERS = 24
/** A crowd person's capsule. */
export const CROWD_CAPSULE = { radius: 0.3, height: 1.78 } as const

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
      /** The crowd's standing / walking people: feet x, y, z each (see `crowdColliders`). */
      crowd: number[]
      /** The crowd's still things, when they changed since the last step. */
      crowdBoxes?: StaticShape[]
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
