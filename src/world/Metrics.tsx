'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
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

  useFrame((_, delta) => {
    const { render, memory } = gl.info
    metrics.calls = render.calls
    metrics.triangles = render.triangles
    metrics.geometries = memory.geometries
    metrics.textures = memory.textures
    metrics.programs = gl.info.programs?.length ?? 0
    if (delta > 0) metrics.fps = metrics.fps ? metrics.fps * 0.9 + (1 / delta) * 0.1 : 1 / delta
    gl.info.reset()
  }, 2)

  return null
}
