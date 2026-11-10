/**
 * A character's walk (wow-plan D3: the first character who walks). Pure, tested in gait.test.ts;
 * Actor puts the soles on the floor by IK (plantFeet) and adds the swing of arms and hips.
 *
 * Driven by the distance walked, like the visitor's own walk (D2): a foot on the floor stays put
 * in the world while the body passes over it (it slides back under the body at exactly the
 * walking speed), the other one swings forward in an arc. Actor units: forward = +z.
 */

/** Distance per step (one foot), lift of the swinging foot. */
export const GAIT = { stride: 0.55, lift: 0.12, bob: 0.03, armSwing: 0.5, twist: 0.07 } as const

const smooth = (x: number) => x * x * (3 - 2 * x)

export interface Gait {
  /** Soles [x, lift, z] for the left and right foot. */
  feet: [[number, number, number], [number, number, number]]
  /** Up/down of the hips (add to the root), arm swing (left arm forward > 0), torso twist. */
  bob: number
  swing: number
  twist: number
}

/** The walk after `walked` units of distance; `restX` = how far either side of the middle the feet go. */
export function gaitAt(walked: number, restX: number): Gait {
  const phase = (walked / GAIT.stride) * Math.PI
  const foot = (i: 0 | 1): [number, number, number] => {
    const p = phase + i * Math.PI
    const u = ((p % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / Math.PI // 0..2
    const x = (i === 0 ? -1 : 1) * restX
    if (u < 1) return [x, 0, (GAIT.stride / 2) * (1 - 2 * u)] // on the floor, the body passes over it
    const w = u - 1
    return [x, Math.sin(Math.PI * w) * GAIT.lift, -GAIT.stride / 2 + GAIT.stride * smooth(w)]
  }
  return {
    feet: [foot(0), foot(1)],
    // Highest when a foot is under the hips, lowest with the legs apart.
    bob: GAIT.bob * (Math.abs(Math.sin(phase)) - 0.5),
    // The left arm goes forward with the right foot.
    swing: GAIT.armSwing * -Math.cos(phase),
    twist: GAIT.twist * Math.cos(phase),
  }
}
