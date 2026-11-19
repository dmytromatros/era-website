/**
 * The photo mode's state (E7), shared by the header button, the hand with the phone in the canvas
 * (Photo.tsx), the overlay (countdown, flash, the polaroid card), the frame pacer (it reads the
 * frame back) and the camera (no glance at a gag meanwhile). A store, like the arcade (rule 44).
 *
 * idle → loading (the hand's chunk is on its way; the scroll is already held) → shooting (on the
 * scene clock — the one the poses run on, so a stalled frame cannot leave the shutter ahead of
 * them; photoModel.photoAt) → idle. The picture outlives it: the card stays until
 * the visitor closes it (or takes the next one).
 */
import { create } from 'zustand'
import { lockScroll, unlockScroll } from '@/experience/scrollLock'
import { useExperience } from '@/experience/store'
import { cutsceneNow } from '../cutscene/cutsceneModel'
import { useArcade } from '../arcade/arcadeState'
import { useMonitor } from '../monitor/monitorState'
import { letterBusy } from '@/experience/letter/letterState'

export type PhotoPhase = 'idle' | 'loading' | 'shooting'

export interface Picture {
  /** Object URL of the PNG (revoked when the card closes). */
  url: string
  blob: Blob
  name: string
  width: number
  height: number
}

interface PhotoState {
  phase: PhotoPhase
  /** performance.now() when shooting started. */
  since: number
  /** The countdown number now (3, 2, 1; 0 = none) — written by Photo.tsx from the scene clock. */
  count: number
  /** Bumped at every shutter: the overlay plays its flash. */
  flash: number
  /** The last picture (the polaroid card), until closed. */
  picture: Picture | null
}

export const usePhoto = create<PhotoState>(() => ({ phase: 'idle', since: 0, count: 0, flash: 0, picture: null }))

/** The moment is on (the scroll is held, the camera keeps still). */
export const photoBusy = () => usePhoto.getState().phase !== 'idle'

/**
 * Why a photo cannot be taken now ('' = it can): only in 3D, on the rail, not in a cutscene, a
 * portal, the arcade or the monitor's flight, nor while one is being taken.
 */
export function photoBlocked(): string {
  const x = useExperience.getState()
  if (x.mode !== '3d' || !x.handedOver) return '2d'
  if (x.portal.phase !== 'idle' || x.arrival) return 'portal'
  if (cutsceneNow.phase !== 'idle' && cutsceneNow.phase !== 'done') return 'cutscene'
  if (useArcade.getState().phase !== 'idle' || useMonitor.getState().phase !== 'idle') return 'screen'
  if (photoBusy()) return 'busy'
  if (letterBusy()) return 'letter'
  return ''
}

const mark = (on: boolean) => document.documentElement.toggleAttribute('data-photo', on)

/** Fetch the hand-and-phone chunk ahead (on hover / focus of the button). */
export const preloadPhoto = () => void import('./Photo')

/** The header button: start the moment (the hand comes up once its chunk is there). */
export function startPhoto(): boolean {
  if (photoBlocked()) return false
  // The last polaroid makes room: it would cover the phone (lower right).
  closePicture()
  usePhoto.setState({ phase: 'loading', since: performance.now() })
  lockScroll('photo')
  mark(true)
  return true
}

/** The hand is there: the moment starts now. */
export function photoReady() {
  if (usePhoto.getState().phase === 'loading') usePhoto.setState({ phase: 'shooting', since: performance.now() })
}

/** The shutter clicked: the scroll is the visitor's again (the phone goes down meanwhile). */
export function photoShot() {
  usePhoto.setState((s) => ({ flash: s.flash + 1 }))
  unlockScroll('photo')
}

/** The phone is gone. */
export function photoDone() {
  if (usePhoto.getState().phase === 'idle') return
  usePhoto.setState({ phase: 'idle', count: 0 })
  unlockScroll('photo')
  mark(false)
}

/** Esc, a portal, leaving 3D or the page: whatever the moment was doing, it is over (no picture). */
export const cancelPhoto = photoDone

/** The finished picture: shown as the card (the previous one is let go). */
export function setPicture(p: Picture) {
  const old = usePhoto.getState().picture
  if (old) URL.revokeObjectURL(old.url)
  usePhoto.setState({ picture: p })
}

export function closePicture() {
  const old = usePhoto.getState().picture
  if (!old) return
  URL.revokeObjectURL(old.url)
  usePhoto.setState({ picture: null })
}

/**
 * Reading the frame back: Photo.tsx raises `want` on the shutter frame (the phone already hidden);
 * <FramePacer>, right after it drew that frame (same task, so the drawing buffer is still there —
 * no `preserveDrawingBuffer`, which would cost every frame), hands the canvas to `take`.
 */
export const photoCapture: { want: boolean; take: ((source: HTMLCanvasElement) => void) | null } = { want: false, take: null }
