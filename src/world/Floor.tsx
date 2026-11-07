'use client'

import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useTheme } from '@/theme/store'

const TILE = 64
const SPACING = 0.5 // world units between dots
const SIZE = 400

/** Endless studio floor with the same dotted pattern as the 2D page. */
export function Floor() {
  const { world } = useTheme()
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TILE
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = world.floor
    ctx.fillRect(0, 0, TILE, TILE)
    ctx.fillStyle = world.floorDot
    ctx.beginPath()
    ctx.arc(TILE / 2, TILE / 2, TILE * 0.06, 0, Math.PI * 2)
    ctx.fill()
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(SIZE / SPACING, SIZE / SPACING)
    tex.anisotropy = maxAnisotropy
    return tex
  }, [world.floor, world.floorDot, maxAnisotropy])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, -SIZE / 2 + 40]}>
      <planeGeometry args={[SIZE, SIZE]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  )
}
