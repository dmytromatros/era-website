'use client'

import { useLayoutEffect } from 'react'
import { useTheme } from '@/theme/store'
import { toonSun } from './toonMaterial'

/** Background, fog and lights — all from the current theme. */
export function Atmosphere() {
  const { world } = useTheme()
  // Cartoon bands are relative to the sun's strength (toonMaterial.tsx).
  useLayoutEffect(() => {
    toonSun.value = world.sunIntensity
  }, [world.sunIntensity])
  return (
    <>
      <color attach="background" args={[world.background]} />
      <fog attach="fog" args={[world.background, world.fogNear, world.fogFar]} />
      <hemisphereLight args={[world.hemiSky, world.hemiGround, world.hemiIntensity]} />
      <directionalLight position={[6, 12, 8]} color={world.sun} intensity={world.sunIntensity} />
    </>
  )
}
