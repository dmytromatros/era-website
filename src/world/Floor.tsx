'use client'

import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { seeded } from '@/lib/random'
import { useTheme } from '@/theme/store'

const TILE_PX = 512
/** One texture tile covers this many metres: 12 rows of 20 cm planks. */
const TILE_M = 2.4
const ROWS = 12
// Big enough for routes that turn in any direction (the office walls and fog hide the edges).
const SIZE = 600

/** Light oak plank floor of the office. Colours from the theme (`floor` + `floorDot` seams). */
export function Floor() {
  const { world } = useTheme()
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())

  const texture = useMemo(() => {
    const rand = seeded(3)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TILE_PX
    const ctx = canvas.getContext('2d')!
    const row = TILE_PX / ROWS
    for (let r = 0; r < ROWS; r++) {
      // planks of varying length; the pattern wraps horizontally
      let x = -rand() * TILE_PX * 0.5
      while (x < TILE_PX) {
        const len = TILE_PX * (0.35 + rand() * 0.4)
        ctx.fillStyle = world.floor
        ctx.fillRect(x, r * row, len, row)
        // subtle per-plank tone
        const tone = rand() * 0.08 - 0.04
        ctx.fillStyle = tone > 0 ? `rgba(255,255,255,${tone})` : `rgba(0,0,0,${-tone})`
        ctx.fillRect(x, r * row, len, row)
        ctx.fillStyle = world.floorDot
        ctx.fillRect(x, r * row, 1.5, row) // end joint
        x += len
      }
      ctx.fillStyle = world.floorDot
      ctx.fillRect(0, r * row, TILE_PX, 1.5) // long seam
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(SIZE / TILE_M, SIZE / TILE_M)
    tex.anisotropy = maxAnisotropy
    return tex
  }, [world.floor, world.floorDot, maxAnisotropy])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, -SIZE / 2 + 60]}>
      <planeGeometry args={[SIZE, SIZE]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  )
}
