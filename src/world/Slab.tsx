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
 *
 * `inset` > 0 makes it a frame (a CSS border): only the outer `inset` rim, the inside is a
 * hole. A card's border is such a frame around a slab that fills the hole — the two never
 * overlap, so they can not fight for depth (on phones a full border slab behind the card
 * showed through it in patches).
 */
export function Slab({
  width,
  height,
  radius,
  depth,
  inset = 0,
  children,
}: {
  width: number
  height: number
  radius: number
  depth: number
  inset?: number
  children: ReactNode
}) {
  const geometry = useRef<THREE.ExtrudeGeometry>(null)
  const args = useMemo(() => {
    const shape = roundedRect(width, height, radius)
    if (inset > 0 && width > 2 * inset && height > 2 * inset) {
      const hole = roundedRect(width - 2 * inset, height - 2 * inset, Math.max(radius - inset, 0))
      shape.holes.push(new THREE.Path(hole.getPoints().reverse()))
    }
    return [shape, { depth, bevelEnabled: false, curveSegments: 10 }] as const
  }, [width, height, radius, depth, inset])
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
