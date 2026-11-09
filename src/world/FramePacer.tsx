'use client'

/**
 * Drives the canvas (it runs with `frameloop="never"`): one requestAnimationFrame loop that
 * draws at most 60 frames a second and parks on a still 2D landing (framePacing.ts says why).
 *
 * `advance()` renders inside this very rAF callback — no frame of latency (an `invalidate()`
 * would only schedule R3F's own rAF for the next vsync). The time it passes is the scene clock
 * (`clock.elapsedTime`), which only moves while frames are drawn.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { live, selectReady, useExperience } from '@/experience/store'
import { useThemeStore } from '@/theme/store'
import { MAX_STEP, MEMBRANE_LAYER, landingIsStill, notePark, pace, pacer, wake, wakeByPointer } from './framePacing'
import { noteWaveInput, waves, wavesBusy } from './membraneWaves'
import { useQuality } from './quality'
import { useStyle } from './style'
import { useXRay } from './xrayState'

export function FramePacer() {
  const get = useThree((s) => s.get)

  useEffect(() => {
    let raf = 0
    let next = 0
    let last = performance.now()
    // R3F starts the clock at 0 in this mode; continue from there (the first step stays small).
    let clock = get().clock.elapsedTime
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (pacer.parked || document.hidden) {
        last = now
        return
      }
      const r = pace(now, next)
      next = r.next
      if (!r.draw) return
      clock += Math.min((now - last) / 1000, MAX_STEP)
      last = now
      // Waves on a still landing: the film alone (it is opaque there; the office behind it is
      // not drawn at all). Layer 0 = everything, as always.
      const camera = get().camera
      if (pacer.membraneOnly) camera.layers.set(MEMBRANE_LAYER)
      else camera.layers.set(0)
      get().advance(clock)
    }
    raf = requestAnimationFrame(tick)

    // Anything that can change the picture wakes the loop up.
    const unsubs = [
      useExperience.subscribe(wake),
      useThemeStore.subscribe(wake),
      useStyle.subscribe(wake),
      useQuality.subscribe(wake),
      useXRay.subscribe(wake),
    ]
    const events = ['scroll', 'resize', 'visibilitychange'] as const
    for (const e of events) window.addEventListener(e, wake, { passive: true })
    // The pointer stirs the film (D1): on the landing it wakes the loop for the film only.
    const onPointer = () => {
      if (!waves.enabled || useExperience.getState().handedOver) return
      noteWaveInput(performance.now())
      wakeByPointer()
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      unsubs.forEach((u) => u())
      for (const e of events) window.removeEventListener(e, wake)
      window.removeEventListener('pointermove', onPointer)
      wake()
    }
  }, [get])

  // Park once the landing has been still for a while (enough drawn frames after "ready" that
  // every text, texture and shader of the world is already on the GPU for the entrance).
  useFrame(() => {
    const st = useExperience.getState()
    const still = landingIsStill({
      handedOver: st.handedOver,
      scrollPx: live.scrollPx,
      progress: live.progress,
      ready: selectReady(st),
      portalBusy: st.portal.phase !== 'idle' || st.arrival !== null,
    })
    const now = performance.now()
    notePark(still, now, wavesBusy(now))
  })

  return null
}
