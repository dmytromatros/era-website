import * as THREE from 'three'
import { live, useExperience } from '@/experience/store'
import { ENTRANCE_GEOMETRY } from '../layout'
import { entranceAt } from '../timeline'
import { crackOf, entranceBreak, healAt, lookWeight, sinceBreak, stepBreak } from './breakModel'
import type { Crack } from './handsModel'

/** What the crack looks like this frame, for every part of the scene that reacts to it. */
export interface CrackFrame {
  /** Entrance progress 0..1. */
  e: number
  /** Seconds since the crack: null = not yet (armed), Infinity = skipped (arrived mid-page). */
  since: number | null
  /** For the hands (null = no crack to play). */
  crack: Crack | null
  /** How much of the confused look plays (fades as the visitor scrolls on). */
  look: number
  /** 1 from BREAK.at on, fading to 0 towards the top (the whole lurch fades with it). */
  heal: number
}

/**
 * The camera on its rail BEFORE the crack's kick (CameraRig writes it every frame): the hands
 * hang on this "body", so when the head nods down or looks around they come into view instead
 * of moving with the head.
 */
export const cameraBody = new THREE.Matrix4()

/**
 * Advance the crack for this frame (breakModel.ts) and fire its one-off side effects: the screen
 * shudders from the burst point (the existing ripple — no extra pass). Called by the camera rig,
 * the film, the hands and the shards — whoever runs first in the frame does the work, the rest
 * read (same scene-clock time = same frame).
 */
export function crackFrame(now: number, aspect: number): CrackFrame {
  const e = Math.min(Math.max(entranceAt(live.progress), 0), 1)
  const broke = stepBreak(entranceBreak, e, now, live.tear, { aspect, fov: ENTRANCE_GEOMETRY.fov }, Math.random)
  if (broke) useExperience.getState().ripple(entranceBreak.uv)
  return {
    e,
    since: sinceBreak(entranceBreak, now),
    crack: crackOf(entranceBreak, now, e),
    look: lookWeight(e, entranceBreak.e0),
    heal: healAt(e),
  }
}
