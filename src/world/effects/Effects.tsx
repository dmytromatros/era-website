'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import { live, useExperience } from '@/experience/store'
import { useQualitySettings } from '../quality'
import { RippleEffect } from './RippleEffect'

/** Post-processing stack. Fires the ripple whenever the store's `rippleAt` changes. */
export function Effects() {
  const ripple = useMemo(() => new RippleEffect(), [])
  const size = useThree((s) => s.size)
  const seen = useRef(-Infinity)
  const { multisampling } = useQualitySettings()

  useEffect(() => () => ripple.dispose(), [ripple])

  useEffect(() => {
    ripple.aspect = size.width / size.height
  }, [ripple, size])

  useFrame(() => {
    const { rippleAt } = useExperience.getState()
    if (rippleAt !== seen.current) {
      seen.current = rippleAt
      ripple.setCenter(live.pointerUv.x, live.pointerUv.y)
    }
    ripple.age = Math.min((performance.now() - rippleAt) / 1000, 10)
  })

  return (
    <EffectComposer multisampling={multisampling}>
      <primitive object={ripple} />
    </EffectComposer>
  )
}
