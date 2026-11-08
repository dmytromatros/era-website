'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import { live, useExperience } from '@/experience/store'
import * as THREE from 'three'
import { useQualitySettings } from '../quality'
import { ENTRANCE } from '../timeline'
import { cameraFocus } from '../cinema'
import { useStylePreset } from '../style'
import { useXRay } from '../xrayState'
import { BLUR, DepthBlurEffect } from './DepthBlurEffect'
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
 * The background blur (B3): 0 at the top, and only at accents — while the camera stands at a
 * key stop (cameraFocus.accent); sharp in flight.
 */
const BLUR_FROM = 0.85
const BLUR_TO = 1

/**
 * Post-processing stack (one composer — compatible effects are merged into one pass):
 * the background blur (B3; first, so the grade and outlines are drawn over it), the style pass
 * (outlines + grade, only for cartoon styles) and the ripple. Blur and ripple are both
 * convolutions, so with the blur on the ripple gets a pass of its own. Fires the ripple
 * whenever the store's `rippleAt` changes.
 */
export function Effects() {
  const ripple = useMemo(() => new RippleEffect(), [])
  const style = useMemo(() => new StyleEffect(), [])
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const seen = useRef(-Infinity)
  const { multisampling, outlines, depthBlur } = useQualitySettings()
  const preset = useStylePreset()
  // Sample count is a shader constant: a new effect when the quality level changes it.
  const blur = useMemo(() => (depthBlur > 0 ? new DepthBlurEffect(depthBlur) : null), [depthBlur])
  useEffect(() => () => blur?.dispose(), [blur])
  useEffect(() => {
    if (blur) blur.radius = BLUR.radius * dpr
  }, [blur, dpr])

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
    // X-ray (B4) shows the bare world: no grade, outlines or blur over the blueprint.
    const xray = useXRay.getState().on
    if (rippleAt !== seen.current) {
      seen.current = rippleAt
      ripple.setCenter(live.pointerUv.x, live.pointerUv.y)
    }
    ripple.age = Math.min((performance.now() - rippleAt) / 1000, 10)
    // The style must not touch the swap frame or the resting hero: 0 until the handover and at
    // the top, then grows with the entrance (live.progress is already smoothed, rule 1).
    const entrance = Math.min(Math.max(live.progress / ENTRANCE, 0), 1)
    style.mix = handedOver && preset.post && !xray ? THREE.MathUtils.smoothstep(entrance, STYLE_FROM, STYLE_TO) : 0
    // Background blur: focused on what the camera looks at (cinema.ts), after the entrance, and
    // only at an accent (a key stop) — sharp while flying between.
    const blurMix =
      blur && handedOver && !xray ? THREE.MathUtils.smoothstep(entrance, BLUR_FROM, BLUR_TO) * cameraFocus.accent : 0
    if (blur) {
      blur.mix = blurMix
      blur.focus = cameraFocus.distance
    }
    style.setBlur(blurMix, cameraFocus.distance)
  })

  return (
    <EffectComposer multisampling={multisampling}>
      {blur ? <primitive object={blur} /> : <></>}
      {preset.post ? <primitive object={style} /> : <></>}
      <primitive object={ripple} />
    </EffectComposer>
  )
}
