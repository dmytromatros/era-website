'use client'

import { PerformanceMonitor } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { useExperience } from '@/experience/store'
import { QUALITY, useQuality } from './quality'

/**
 * Judges the frame rate only after the visitor is inside 3D and things settled: the first
 * seconds (shader compiles, fonts, the entrance) are slow everywhere and would wrongly push
 * every device down.
 */
const WARM_UP_MS = 2500

/**
 * Keeps the quality level (quality.ts) matched to what the device can do: watches the frame
 * rate (drei PerformanceMonitor) and steps the level down when it stays low, up when it
 * recovers; after a few flip-flops it settles on the lower one. Also applies the level's
 * pixel ratio to the canvas.
 */
export function QualityGovernor() {
  const level = useQuality((s) => s.level)
  const step = useQuality((s) => s.step)
  const setDpr = useThree((s) => s.setDpr)
  const handedOver = useExperience((s) => s.handedOver)
  const [warm, setWarm] = useState(false)

  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, QUALITY[level].dpr))
  }, [level, setDpr])

  useEffect(() => {
    if (!handedOver || warm) return
    const id = setTimeout(() => setWarm(true), WARM_UP_MS)
    return () => clearTimeout(id)
  }, [handedOver, warm])

  if (!warm) return null
  return (
    <PerformanceMonitor
      flipflops={3}
      onDecline={() => step(-1)}
      onIncline={() => step(1)}
      onFallback={() => step(-1)}
    />
  )
}
