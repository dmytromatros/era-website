'use client'

import { PerformanceMonitor } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { useExperience } from '@/experience/store'
import { QUALITY, useQuality } from './quality'

/**
 * Judges the frame rate only while the visitor is inside 3D and things settled: the first
 * seconds (shader compiles, fonts, the entrance) are slow everywhere and would wrongly push
 * every device down. Back on the 2D landing it stops judging: there the canvas parks (draws no
 * frames, FramePacer) and the gap would read as a terrible frame rate — the level would drop
 * every time the visitor scrolled back to the top.
 */
const WARM_UP_MS = 2500
/** Changes of direction (down ↔ up) before the level settles on the lower one. */
const FLIP_FLOPS = 3

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
  // Flip-flops are counted here, not by PerformanceMonitor: it is remounted on every entrance
  // and would forget them. After FLIP_FLOPS changes of direction the level stays on the lower one.
  const flips = useRef({ count: 0, last: 0 as -1 | 0 | 1, settled: false })
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, QUALITY[level].dpr))
  }, [level, setDpr])

  const judge = (dir: -1 | 1) => {
    const f = flips.current
    if (f.settled) return
    if (f.last !== 0 && dir !== f.last) f.count++
    f.last = dir
    if (f.count >= FLIP_FLOPS) {
      f.settled = true
      setSettled(true)
      if (dir > 0) return // settle on the lower one: do not take this last step up
    }
    step(dir)
  }

  if (!handedOver || settled) return null
  return <Judge onChange={judge} />
}

/** Judges only WARM_UP_MS after it mounts — i.e. after each entrance into 3D. */
function Judge({ onChange }: { onChange: (dir: -1 | 1) => void }) {
  const [warm, setWarm] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setWarm(true), WARM_UP_MS)
    return () => clearTimeout(id)
  }, [])
  if (!warm) return null
  return <PerformanceMonitor onDecline={() => onChange(-1)} onIncline={() => onChange(1)} onFallback={() => onChange(-1)} />
}
