'use client'

import { useFrame } from '@react-three/fiber'
import { live, selectReady, useExperience } from '@/experience/store'

/** How fast the shown progress catches up with the scroll (1/seconds). */
const CATCH_UP = 6

/**
 * Runs first in every frame (mounted before everything else in the canvas):
 *
 * 1. Smooths scroll into `live.progress`, so a jumpy wheel still gives fluid motion.
 * 2. Decides the 2D → 3D handover INSIDE the frame. The DOM hero hides in the same frame the
 *    3D copy is drawn (DOM changes made during a frame's callbacks land in the same paint),
 *    so there is never a frame with neither on screen.
 *
 * Before the handover the world is frozen at its start pose; if the visitor scrolled before
 * the 3D text was ready, progress then glides up from zero instead of jumping.
 */
export function Driver() {
  useFrame((_, delta) => {
    const state = useExperience.getState()

    if (!state.handedOver) {
      live.progress = 0
    } else {
      live.progress += (live.scroll - live.progress) * (1 - Math.exp(-delta * CATCH_UP))
      if (Math.abs(live.scroll - live.progress) < 1e-4) live.progress = live.scroll
    }

    // Back to 2D only once the 3D world has glided back to its start pose.
    const want = selectReady(state) && (live.scrollPx > 2 || live.progress > 0.002)
    if (want !== state.handedOver) state.setHandedOver(want)
  })
  return null
}
