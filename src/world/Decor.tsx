'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { seeded } from '@/lib/random'
import { useTheme } from '@/theme/store'
import type { Vec3 } from './layout'

const SHAPES = ['box', 'sphere', 'torus', 'cone'] as const

/**
 * Floating shapes that give the space depth. Scattered around the camera route (wherever it
 * turns or climbs), outside the corridors and mostly above wall height.
 */
export function Decor({ rail, clearance, perPoint = 3 }: { rail: Vec3[]; clearance: number; perPoint?: number }) {
  const theme = useTheme()
  const group = useRef<THREE.Group>(null)

  const items = useMemo(() => {
    const rand = seeded(7)
    return rail.slice(1).flatMap((p) =>
      Array.from({ length: perPoint }, () => {
        const angle = rand() * Math.PI * 2
        const dist = clearance + 2.5 + rand() * 10
        return {
          shape: SHAPES[Math.floor(rand() * SHAPES.length)]!,
          // rail points are at eye height (~1.7); +3.6 keeps every shape above the 4.2 m walls
          position: [p[0] + Math.cos(angle) * dist, p[1] + 3.6 + rand() * 6, p[2] + Math.sin(angle) * dist] as const,
          scale: 0.25 + rand() * 0.6,
          accent: rand() < 0.25,
          speed: 0.3 + rand() * 0.6,
          phase: rand() * Math.PI * 2,
        }
      }),
    )
  }, [rail, clearance, perPoint])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    group.current?.children.forEach((child, idx) => {
      const item = items[idx]
      if (!item) return
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
          <meshStandardMaterial color={item.accent ? theme.ui.accent : theme.world.platform} roughness={0.55} />
        </mesh>
      ))}
    </group>
  )
}
