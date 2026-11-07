'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { useTheme } from '@/theme/store'
import { seeded } from '@/lib/random'
import { pathCenterX } from './layout'

const COUNT = 36
const SHAPES = ['box', 'sphere', 'torus', 'cone'] as const

/** Floating shapes that give the space depth. Placed away from the camera path. */
export function Decor() {
  const theme = useTheme()
  const group = useRef<THREE.Group>(null)

  const items = useMemo(() => {
    const rand = seeded(7)
    return Array.from({ length: COUNT }, () => {
      const z = -rand() * 110
      const i = -z / 7 // roughly the stop index at that depth
      const side = rand() < 0.5 ? -1 : 1
      return {
        shape: SHAPES[Math.floor(rand() * SHAPES.length)]!,
        position: [pathCenterX(i) + side * (5 + rand() * 9), 0.6 + rand() * 5.5, z] as const,
        scale: 0.25 + rand() * 0.6,
        accent: rand() < 0.25,
        speed: 0.3 + rand() * 0.6,
        phase: rand() * Math.PI * 2,
      }
    })
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    group.current?.children.forEach((child, idx) => {
      const item = items[idx]!
      child.position.y = item.position[1] + Math.sin(t * item.speed + item.phase) * 0.25
      child.rotation.x = t * item.speed * 0.4 + item.phase
      child.rotation.y = t * item.speed * 0.3
    })
  })

  return (
    <group ref={group}>
      {items.map((item, idx) => (
        <mesh key={idx} position={item.position} scale={item.scale}>
          {item.shape === 'box' && <boxGeometry args={[1, 1, 1]} />}
          {item.shape === 'sphere' && <sphereGeometry args={[0.6, 24, 16]} />}
          {item.shape === 'torus' && <torusGeometry args={[0.5, 0.18, 12, 32]} />}
          {item.shape === 'cone' && <coneGeometry args={[0.55, 1, 4]} />}
          <meshStandardMaterial
            color={item.accent ? theme.ui.accent : theme.world.platform}
            roughness={0.55}
          />
        </mesh>
      ))}
    </group>
  )
}
