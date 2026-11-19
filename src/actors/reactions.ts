/**
 * Click / tap reactions of the characters (docs/wow-plan.md, task C1): a short move layered on
 * top of whatever the character is busy with. Each move blends in and out (`envelope`), so it
 * never snaps; the emoji is drawn by the actor (EmojiPop).
 *
 * Add a move: write a `Reaction` here, add its name to `REACTIONS` in catalog.ts and register it.
 * Content picks moves per character (`reactions:` in content/actors/*.yaml).
 */
import type { ReactionName } from './catalog'
import { PHOTO } from '@/world/photo/photoModel'
import { envelope } from './lifeModel'
import type { Joints } from './rig'

export interface ReactionContext {
  /** The hands are busy (holding the heading up): the move leaves the arms alone. */
  handsBusy: boolean
}

export interface Reaction {
  /** Seconds. */
  duration: number
  /**
   * @param k progress 0 → 1
   * @param w blend weight (0 at both ends)
   */
  animate: (j: Joints, k: number, w: number, ctx: ReactionContext) => void
}

const lerp = (a: number, b: number, w: number) => a + (b - a) * w

/** Crouch → jump → land: height of the body over the reaction (negative = knees bent). */
function hop(k: number, height: number): number {
  if (k < 0.2) return -Math.sin((k / 0.2) * Math.PI * 0.5) * 0.08 // crouch
  if (k < 0.65) {
    const a = (k - 0.2) / 0.45
    return -0.08 * (1 - a) + Math.sin(a * Math.PI) * height // up and back down
  }
  const a = (k - 0.65) / 0.35
  return -Math.sin(a * Math.PI) * 0.06 // soft landing
}

/**
 * The photo poses (E7): struck in the first 18 % of `PHOTO.pose`, held facing the camera through
 * the countdown and the shutter, then let go. A wide grin and a lean into the picture; with the
 * hands busy (holding the headline up) the grin and a tilt of the head are the whole pose.
 */
function photoFace(j: Joints, w: number, tilt: number) {
  j.mouth.scale.x = lerp(1, 1.7, w)
  j.head.rotation.z = lerp(j.head.rotation.z, tilt, w)
  j.eyes.scale.y = lerp(1, 0.75, w) // a happy squint
}

export const photoReactions = {
  /** Thumb up at the camera, the other hand on the hip. */
  thumbs: {
    duration: PHOTO.pose,
    animate: (j, _k, w, { handsBusy }) => {
      photoFace(j, w, -0.14)
      j.root.rotation.z += w * 0.05
      if (handsBusy) return
      j.armR.rotation.set(lerp(j.armR.rotation.x, -1.15, w), 0, lerp(j.armR.rotation.z, 0.35, w))
      j.foreR.rotation.x = lerp(j.foreR.rotation.x, -1.25, w)
      j.armL.rotation.set(lerp(j.armL.rotation.x, 0.15, w), 0, lerp(j.armL.rotation.z, -0.75, w))
      j.foreL.rotation.set(lerp(j.foreL.rotation.x, -1.5, w), 0, lerp(j.foreL.rotation.z, 0.9, w))
    },
  },
  /** "V" up by the head, head tilted towards it. */
  peace: {
    duration: PHOTO.pose,
    animate: (j, _k, w, { handsBusy }) => {
      photoFace(j, w, 0.2)
      j.torso.rotation.z = lerp(j.torso.rotation.z, 0.06, w)
      if (handsBusy) return
      j.armR.rotation.set(lerp(j.armR.rotation.x, -0.35, w), 0, lerp(j.armR.rotation.z, 2.55, w))
      j.foreR.rotation.x = lerp(j.foreR.rotation.x, -0.9, w)
      j.armL.rotation.z = lerp(j.armL.rotation.z, -0.2, w)
    },
  },
  /** Both arms up, biceps flexed, knees a little bent. */
  flex: {
    duration: PHOTO.pose,
    animate: (j, _k, w, { handsBusy }) => {
      photoFace(j, w, -0.08)
      j.root.position.y -= w * 0.04
      if (handsBusy) return
      j.armL.rotation.set(0, 0, lerp(j.armL.rotation.z, -1.5, w))
      j.armR.rotation.set(0, 0, lerp(j.armR.rotation.z, 1.5, w))
      j.foreL.rotation.z = lerp(j.foreL.rotation.z, -1.75, w)
      j.foreR.rotation.z = lerp(j.foreR.rotation.z, 1.75, w)
    },
  },
} satisfies Record<'thumbs' | 'peace' | 'flex', Reaction>

export const reactions: Record<ReactionName, Reaction> = {
  /** Crouch, jump with the arms up, land softly. */
  jump: {
    duration: 1,
    animate: (j, k, w, { handsBusy }) => {
      j.root.position.y += hop(k, 0.32)
      // Knees tuck a little in the air (the feet are planted by IK only on the floor).
      const air = Math.max(0, Math.sin(((k - 0.2) / 0.45) * Math.PI)) * (k > 0.2 && k < 0.65 ? 1 : 0)
      j.shinL.rotation.x += air * 0.5
      j.shinR.rotation.x += air * 0.5
      j.legL.rotation.x -= air * 0.25
      j.legR.rotation.x -= air * 0.25
      if (!handsBusy) {
        j.armL.rotation.z = lerp(j.armL.rotation.z, -2.4, w)
        j.armR.rotation.z = lerp(j.armR.rotation.z, 2.4, w)
        j.armL.rotation.x = lerp(j.armL.rotation.x, 0, w)
        j.armR.rotation.x = lerp(j.armR.rotation.x, 0, w)
      }
      j.head.rotation.x = lerp(j.head.rotation.x, -0.2, w)
    },
  },

  /** A full turn on the spot with a little hop. */
  spin: {
    duration: 1.1,
    animate: (j, k, w, { handsBusy }) => {
      const turn = k * k * (3 - 2 * k) // ease in-out
      j.root.position.y += Math.sin(k * Math.PI) * 0.12
      // Hands on the heading: the body cannot turn round — the head looks round instead.
      if (handsBusy) j.head.rotation.y += Math.sin(turn * Math.PI * 2) * 0.6 * w
      else j.root.rotation.y += turn * Math.PI * 2
      if (!handsBusy) {
        j.armL.rotation.z = lerp(j.armL.rotation.z, -1.2, w)
        j.armR.rotation.z = lerp(j.armR.rotation.z, 1.2, w)
      }
    },
  },

  /** Jumps back a little: eyes wide, hands up. */
  surprised: {
    duration: 1.1,
    animate: (j, k, w, { handsBusy }) => {
      const jolt = k < 0.25 ? Math.sin((k / 0.25) * Math.PI) : 0
      j.root.position.y += jolt * 0.1
      j.root.position.z -= w * 0.08
      j.torso.rotation.x = lerp(j.torso.rotation.x, -0.15, w)
      j.head.rotation.x = lerp(j.head.rotation.x, -0.12, w)
      j.eyes.scale.set(1 + w * 0.35, 1 + w * 0.6, 1)
      if (!handsBusy) {
        j.armL.rotation.set(lerp(j.armL.rotation.x, -0.9, w), 0, lerp(j.armL.rotation.z, -0.5, w))
        j.armR.rotation.set(lerp(j.armR.rotation.x, -0.9, w), 0, lerp(j.armR.rotation.z, 0.5, w))
        j.foreL.rotation.x = lerp(j.foreL.rotation.x, -1.4, w)
        j.foreR.rotation.x = lerp(j.foreR.rotation.x, -1.4, w)
      }
    },
  },

  /** A little dance: sways from side to side, arms pumping in turn. */
  dance: {
    duration: 1.7,
    animate: (j, k, w, { handsBusy }) => {
      const beat = k * Math.PI * 6
      j.root.position.y += Math.abs(Math.sin(beat)) * 0.06 * w
      j.root.rotation.z += Math.sin(beat) * 0.08 * w
      j.torso.rotation.y += Math.sin(beat * 0.5) * 0.3 * w
      j.head.rotation.z = lerp(j.head.rotation.z, -Math.sin(beat) * 0.15, w)
      if (!handsBusy) {
        const up = Math.sin(beat)
        j.armL.rotation.set(0, 0, lerp(j.armL.rotation.z, -1.6 - Math.max(0, up) * 0.9, w))
        j.armR.rotation.set(0, 0, lerp(j.armR.rotation.z, 1.6 + Math.max(0, -up) * 0.9, w))
        j.foreL.rotation.z = lerp(j.foreL.rotation.z, -0.8, w)
        j.foreR.rotation.z = lerp(j.foreR.rotation.z, 0.8, w)
      }
    },
  },

  /** Shoulders up, palms out, head tilted: "really?" */
  shrug: {
    duration: 1.2,
    animate: (j, k, w, { handsBusy }) => {
      const up = Math.sin(Math.min(1, k / 0.5) * Math.PI * 0.5) * w
      j.head.rotation.z = lerp(j.head.rotation.z, 0.22, w)
      j.head.rotation.x = lerp(j.head.rotation.x, 0.08, w)
      if (!handsBusy) {
        j.armL.position.y += up * 0.06
        j.armR.position.y += up * 0.06
        j.armL.rotation.set(lerp(j.armL.rotation.x, -0.25, w), 0, lerp(j.armL.rotation.z, -0.35, w))
        j.armR.rotation.set(lerp(j.armR.rotation.x, -0.25, w), 0, lerp(j.armR.rotation.z, 0.35, w))
        j.foreL.rotation.set(lerp(j.foreL.rotation.x, -1.3, w), 0, lerp(j.foreL.rotation.z, -0.5, w))
        j.foreR.rotation.set(lerp(j.foreR.rotation.x, -1.3, w), 0, lerp(j.foreR.rotation.z, 0.5, w))
      }
    },
  },
  ...photoReactions,
}

/** Weight of a reaction `age` seconds after it started (0 when over). */
export function reactionWeight(name: ReactionName, age: number): { k: number; w: number } {
  const k = age / reactions[name].duration
  return { k, w: envelope(k) }
}
