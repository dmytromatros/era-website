'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import { live, useExperience } from '@/experience/store'
import * as THREE from 'three'
import { useQualitySettings } from '../quality'
import { ENTRANCE } from '../timeline'
import { useStylePreset } from '../style'
import { RippleEffect } from './RippleEffect'
import { StyleEffect } from './StyleEffect'

/**
 * The style's outlines and grade grow with the entrance — while the membrane tears (entrance
 * progress e ≈ 0.15 → 0.45, see HeroTransit / Membrane), so the tear hides the change. At the
 * very top (e = 0) the 3D hero looks exactly like the 2D page, even after the handover.
 */
const STYLE_FROM = 0.15
const STYLE_TO = 0.45

/**
 * Post-processing stack (one composer — compatible effects are merged into one pass):
 * the style pass (outlines + grade, only for cartoon styles) and the ripple. Fires the ripple
 * whenever the store's `rippleAt` changes.
 */
export function Effects() {
  const ripple = useMemo(() => new RippleEffect(), [])
  const style = useMemo(() => new StyleEffect(), [])
  const size = useThree((s) => s.size)
  const seen = useRef(-Infinity)
  const { multisampling, outlines } = useQualitySettings()
  const preset = useStylePreset()

  useEffect(
    () => () => {
      ripple.dispose()
      style.dispose()
    },
    [ripple, style],
  )

  useEffect(() => {
    ripple.aspect = size.width / size.height
  }, [ripple, size])

  useEffect(() => {
    style.configure(preset.post, outlines)
  }, [style, preset, outlines])

  useFrame(() => {
    const { rippleAt, handedOver } = useExperience.getState()
    if (rippleAt !== seen.current) {
      seen.current = rippleAt
      ripple.setCenter(live.pointerUv.x, live.pointerUv.y)
    }
    ripple.age = Math.min((performance.now() - rippleAt) / 1000, 10)
    // The style must not touch the swap frame or the resting hero: 0 until the handover and at
    // the top, then grows with the entrance (live.progress is already smoothed, rule 1).
    const entrance = Math.min(Math.max(live.progress / ENTRANCE, 0), 1)
    style.mix = handedOver && preset.post ? THREE.MathUtils.smoothstep(entrance, STYLE_FROM, STYLE_TO) : 0
  })

  return (
    <EffectComposer multisampling={multisampling}>
      {preset.post ? <primitive object={style} /> : <></>}
      <primitive object={ripple} />
    </EffectComposer>
  )
}
