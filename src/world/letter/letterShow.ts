/**
 * What the letter's 3D show (E9) shares with the rest of the scene, without its own chunk: the
 * helper who throws the plane (registered by <Helper> when it stands at the `letter` card), what
 * it says on the way, where the letter card is on the screen, and the camera the show borrows.
 */
import { create } from 'zustand'
import type { Object3D } from 'three'
import type { ActorDrive } from '@/actors/Actor'
import type { ReactionName } from '@/actors/catalog'

/** `name`: how its speech bubble is signed ("Leo · Client partner"). */
export const thrower: { anchor: Object3D | null; drive: ActorDrive | null; scale: number; name: string } = { anchor: null, drive: null, scale: 1, name: '' }

/**
 * The camera, borrowed from the rail (E9): `weight` 0 = on the rail, 1 = at `eye` looking at
 * `look` — up to the letter card to write on it, then (staying put) its head turned after the
 * paper plane. Written by
 * <LetterFlight>, read by <CameraRig> (as the arcade's flight: rule 44; the field of view stays).
 */
export const letterCam = { weight: 0, eye: [0, 0, 0] as [number, number, number], look: [0, 0, 0] as [number, number, number] }

interface ShowState {
  /** The helper's line now (its bubble), or none. */
  line: string | null
  /** Where the letter card is on the screen once the camera is at it (px): the fields go there. */
  cardRect: { x: number; y: number; width: number; height: number } | null
  /** The camera is still on its way back to the rail (keeps the show mounted). */
  returning: boolean
}

export const useLetterShow = create<ShowState>(() => ({ line: null, cardRect: null, returning: false }))

/** Cue a move (and an emoji, '' for none) on the helper. */
export function cueThrower(move: ReactionName, emoji = '') {
  if (thrower.drive) thrower.drive.cue = { move, emoji }
}
