'use client'

import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  const x = -w / 2
  const y = -h / 2
  const s = new THREE.Shape()
  s.moveTo(x + radius, y)
  s.lineTo(x + w - radius, y)
  s.quadraticCurveTo(x + w, y, x + w, y + radius)
  s.lineTo(x + w, y + h - radius)
  s.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  s.lineTo(x + radius, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - radius)
  s.lineTo(x, y + radius)
  s.quadraticCurveTo(x, y, x + radius, y)
  return s
}

/**
 * A flat rounded rectangle with a little thickness — like a CSS box with border-radius.
 * (drei's RoundedBox rounds the depth too, which turns pill buttons into capsules.)
 * Centred on its origin; the front face is at z = +depth / 2.
 */
export function Slab({
  width,
  height,
  radius,
  depth,
  children,
}: {
  width: number
  height: number
  radius: number
  depth: number
  children: ReactNode
}) {
  const geometry = useRef<THREE.ExtrudeGeometry>(null)
  const args = useMemo(
    () =>
      [
        roundedRect(width, height, radius),
        { depth, bevelEnabled: false, curveSegments: 10 },
      ] as const,
    [width, height, radius, depth],
  )
  useLayoutEffect(() => {
    geometry.current?.translate(0, 0, -depth / 2)
  }, [args, depth])
  return (
    <mesh>
      <extrudeGeometry ref={geometry} args={args} />
      {children}
    </mesh>
  )
}
