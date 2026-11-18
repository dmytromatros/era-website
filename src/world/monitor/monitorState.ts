/**
 * The monitor's flight (E5), shared by the screen (Monitor.tsx), the camera (CameraRig) and the
 * frame pacer. A store, like the arcade's (rule 44): the camera reads it every frame.
 *
 * - Entering: the visitor's scroll is locked while the camera flies (in real time from the click,
 *   a stated exception to rule 1, like the arcade). Esc turns it round.
 * - Arrived (the screen covers the frame, showing the landing): the page jumps to its very top and
 *   the progress follows at once (`instantProgress`), so the next frame the Driver hands back to
 *   the real 2D page (rule 2) — which looks just like the picture the camera flew into. The
 *   ripple then spreads from the middle, as if the visitor came out through the screen.
 */
import { create } from 'zustand'
import { lockScroll, unlockScroll } from '@/experience/scrollLock'
import { live, useExperience } from '@/experience/store'
import { flightWeight } from '../arcade/arcadeModel'
import type { Vec3 } from '../layout'
import { MONITOR, type MonitorPhase } from './monitorModel'

interface MonitorState {
  phase: MonitorPhase
  /** performance.now() when the phase started. */
  since: number
  eye: Vec3 | null
  look: Vec3 | null
  /** Leaving: how far in the camera was when it turned round. */
  from: number
}

export const useMonitor = create<MonitorState>(() => ({ phase: 'idle', since: 0, eye: null, look: null, from: 1 }))

/** How far the camera is into the screen right now (0 = on the rail). */
export function monitorWeight(now = performance.now()): number {
  const { phase, since, from } = useMonitor.getState()
  return flightWeight(phase, (now - since) / 1000, from, MONITOR)
}

const set = (phase: MonitorPhase, extra: Partial<MonitorState> = {}) => {
  useMonitor.setState({ phase, since: performance.now(), ...extra })
  document.documentElement.toggleAttribute('data-monitor', phase !== 'idle')
}

/** Fly into the screen. */
export function enterMonitor(eye: Vec3, look: Vec3) {
  if (useMonitor.getState().phase !== 'idle') return
  set('entering', { eye, look })
  lockScroll('monitor')
}

/** Changed one's mind mid-flight (Esc, a portal): back to the rail from where the camera is. */
export function cancelMonitor() {
  if (useMonitor.getState().phase !== 'entering') return
  set('leaving', { from: monitorWeight() })
}

/** Back on the rail after a cancel: the scroll is the visitor's again. */
export function monitorLeft() {
  if (useMonitor.getState().phase !== 'leaving') return
  set('idle', { eye: null, look: null, from: 1 })
  unlockScroll('monitor')
}

/** At the screen: back at the top of the 2D page (the next frame shows the real one). */
export function monitorArrived() {
  if (useMonitor.getState().phase !== 'entering') return
  set('idle', { eye: null, look: null, from: 1 })
  unlockScroll('monitor')
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  live.scroll = 0
  live.scrollPx = 0
  const x = useExperience.getState()
  x.setInstantProgress(true)
  // The handover back to 2D fires its ripple at the pointer; this one comes out of the screen.
  const stop = useExperience.subscribe((s) => {
    if (s.handedOver) return
    stop()
    window.clearTimeout(timer)
    s.ripple({ x: 0.5, y: 0.5 })
  })
  const timer = window.setTimeout(stop, 1000)
}

/** Leaving the page (or a portal): whatever the flight was doing, it is over. */
export function resetMonitor() {
  if (useMonitor.getState().phase === 'idle') return
  set('idle', { eye: null, look: null, from: 1 })
  unlockScroll('monitor')
}
