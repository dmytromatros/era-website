'use client'

import { useTheme } from '@/theme/store'

/** Background, fog and lights — all from the current theme. */
export function Atmosphere() {
  const { world } = useTheme()
  return (
    <>
      <color attach="background" args={[world.background]} />
      <fog attach="fog" args={[world.background, world.fogNear, world.fogFar]} />
      <hemisphereLight args={[world.hemiSky, world.hemiGround, world.hemiIntensity]} />
      <directionalLight position={[6, 12, 8]} color={world.sun} intensity={world.sunIntensity} />
    </>
  )
}
