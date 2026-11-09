'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useQuality } from './quality'

/**
 * What one frame costs, for the debug overlay (?debug=1) and later the X-ray mode (B4).
 * Plain mutable object — written every frame, read on a timer, never React state.
 */
export const metrics = {
  /** Frames per second, smoothed. */
  fps: 0,
  /** Draw calls in the whole frame (scene + every post-processing pass). */
  calls: 0,
  triangles: 0,
  /** Geometries / textures alive on the GPU. */
  geometries: 0,
  textures: 0,
  /** Compiled shader programs (a jump = something compiled shaders during play). */
  programs: 0,
  level: 'high' as string,
}

/**
 * Collects `metrics`. renderer.info normally resets on every render() call, and the effect
 * composer renders several times a frame — so it is switched to manual reset and read once,
 * after the composer (priority 2 > its 1), then reset for the next frame.
 */
export function Metrics() {
  const gl = useThree((s) => s.gl)
  const level = useQuality((s) => s.level)

  useEffect(() => {
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
    }
  }, [gl])

  useEffect(() => {
    metrics.level = level
  }, [level])

  // FPS from the real time between drawn frames — not the scene clock's delta, which is capped
  // per step (FramePacer) and would flatter a slow device.
  const lastFrame = useRef(0)
  useFrame(() => {
    const now = performance.now()
    const gap = lastFrame.current ? (now - lastFrame.current) / 1000 : 0
    lastFrame.current = now
    const { render, memory } = gl.info
    metrics.calls = render.calls
    metrics.triangles = render.triangles
    metrics.geometries = memory.geometries
    metrics.textures = memory.textures
    metrics.programs = gl.info.programs?.length ?? 0
    // A park (still landing) or a background tab is not a slow frame: skip such gaps.
    if (gap > 0 && gap < 1) metrics.fps = metrics.fps ? metrics.fps * 0.9 + (1 / gap) * 0.1 : 1 / gap
    gl.info.reset()
  }, 2)

  return null
}
