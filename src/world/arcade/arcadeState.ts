/**
 * The arcade's state (E3), shared by the screen (Arcade.tsx), the camera (CameraRig), the magnet,
 * the frame pacer and the "back" button outside the canvas. A store, like the portal (rule 20):
 * the camera reads it every frame, React only where something is shown.
 *
 * - Entering: the visitor's scroll is locked (they are in the machine, not on the page), and an
 *   entry is pushed on the browser history, so the phone's Back gesture flies them out again
 *   instead of leaving the page. Leaving by the button or Esc takes that entry back off.
 * - The flight is in real time from the click (like the portal and the crack: a stated exception
 *   to rule 1); the scroll stays where it was, so the camera flies back to the same spot.
 */
import { create } from 'zustand'
import { lockScroll, unlockScroll } from '@/experience/scrollLock'
import type { Vec3 } from '../layout'
import { flightWeight, type ArcadePhase } from './arcadeModel'

interface ArcadeState {
  phase: ArcadePhase
  /** performance.now() when the phase started. */
  since: number
  /** Where the camera flies to and looks at. */
  eye: Vec3 | null
  look: Vec3 | null
  /** Leaving: how far in the camera was when it turned round (1 = at the screen). */
  from: number
}

export const useArcade = create<ArcadeState>(() => ({ phase: 'idle', since: 0, eye: null, look: null, from: 1 }))

/** How far the camera is into the screen right now (0 = on the rail). */
export function arcadeWeight(now = performance.now()): number {
  const { phase, since, from } = useArcade.getState()
  return flightWeight(phase, (now - since) / 1000, from)
}

/** The history entry the arcade pushes (so Back flies out instead of leaving the page). */
const MARK = 'eraArcade'
const ours = () => typeof history !== 'undefined' && !!(history.state as Record<string, unknown> | null)?.[MARK]

const set = (phase: ArcadePhase, extra: Partial<ArcadeState> = {}) => {
  useArcade.setState({ phase, since: performance.now(), ...extra })
  document.documentElement.toggleAttribute('data-arcade', phase !== 'idle')
}

/** Fly into the screen. */
export function enterArcade(eye: Vec3, look: Vec3) {
  if (useArcade.getState().phase !== 'idle') return
  set('entering', { eye, look })
  lockScroll('arcade')
  history.pushState({ ...(history.state as object | null), [MARK]: true }, '')
}

/** The camera is at the screen. */
export function arcadeArrived() {
  if (useArcade.getState().phase === 'entering') set('inside')
}

/**
 * Fly back out (the button, Esc, or the browser's Back — `fromHistory`, the entry is gone then).
 * Mid-flight in, it turns round from where it is.
 */
export function leaveArcade(fromHistory = false) {
  const { phase } = useArcade.getState()
  if (phase !== 'entering' && phase !== 'inside') return
  // Turning round mid-flight: the way out starts from where the camera is.
  set('leaving', { from: arcadeWeight() })
  if (!fromHistory && ours()) history.back()
}

/** Back on the rail: the scroll is the visitor's again. */
export function arcadeLeft() {
  if (useArcade.getState().phase !== 'leaving') return
  set('idle', { eye: null, look: null, from: 1 })
  unlockScroll('arcade')
}

/** Leaving the page (or a portal): whatever the arcade was doing, it is over. */
export function resetArcade() {
  if (useArcade.getState().phase === 'idle') return
  set('idle', { eye: null, look: null, from: 1 })
  unlockScroll('arcade')
}

/**
 * The office's player at the machine (crowd) and the screen share this: someone is playing (the
 * screen shows their game), and when they last lost (scene time; "game over" on the screen).
 */
export const arcadeLink = { playing: false, lostAt: -Infinity }
