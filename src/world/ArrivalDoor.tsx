'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { DoorFrame, usePortalMaterial } from '@/blocks/door/Door3D'
import { PORTAL_TIMING } from '@/experience/portal'
import { useExperience } from '@/experience/store'
import { useTheme } from '@/theme/store'
import type { Vec3 } from './layout'

/** How far behind the first viewpoint the door stands (the camera starts further back, see CameraRig). */
const BEHIND = 0.9

/**
 * The door the visitor steps out of after a portal: its swirling surface matches the portal
 * cover, then fades as the camera moves through it into the new office. Only on pages entered
 * through a portal.
 */
export function ArrivalDoor({ viewpoint, focus }: { viewpoint: Vec3; focus: Vec3 }) {
  const theme = useTheme()
  const { material, uniforms } = usePortalMaterial(1)
  const surface = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const { portal } = useExperience.getState()
    const age = performance.now() - portal.since
    const opacity =
      portal.phase === 'covered' ? 1 : portal.phase === 'revealing' ? Math.max(0, 1 - age / PORTAL_TIMING.reveal) : 0
    uniforms.uTime.value = clock.elapsedTime
    uniforms.uOpacity.value = opacity
    if (surface.current) surface.current.visible = opacity > 0.01
  })

  // Behind the first viewpoint (the hero, always on the ground floor), its portal side facing
  // the camera coming through.
  const dx = focus[0] - viewpoint[0]
  const dz = focus[2] - viewpoint[2]
  const len = Math.hypot(dx, dz) || 1
  const [fx, fz] = [dx / len, dz / len]
  return (
    <group position={[viewpoint[0] - fx * BEHIND, 0, viewpoint[2] - fz * BEHIND]} rotation-y={Math.atan2(-fx, -fz)}>
      <DoorFrame color={theme.world.sign} />
      <mesh ref={surface} position={[0, 1.4, 0]}>
        <planeGeometry args={[1.76, 2.8]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  )
}
