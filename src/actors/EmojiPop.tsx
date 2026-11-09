'use client'

/**
 * The emoji a character shows when clicked (C1): pops up beside its head, floats, shrinks away. A
 * plane in the world with the emoji drawn into a canvas texture (CLAUDE.md rule 24 — no HTML over
 * the canvas), turned to face the camera. Invisible (no draw call) when no emoji is in the air.
 *
 * Solid, not see-through: it writes depth (alpha-tested edges). A transparent plane that writes
 * no depth is "background" for the depth blur (B3) and was blurred away beside the head.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { emojiState } from './lifeModel'

/** One texture per emoji, shared by every character (a handful in total). */
const textures = new Map<string, THREE.CanvasTexture>()

function emojiTexture(emoji: string): THREE.CanvasTexture {
  let t = textures.get(emoji)
  if (t) return t
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '100px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
  ctx.fillText(emoji, 64, 70)
  t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  textures.set(emoji, t)
  return t
}

export interface EmojiShow {
  /** Emoji in the air, or null. */
  emoji: string | null
  /** Clock time (s) it popped. */
  start: number
}

interface Props {
  show: EmojiShow
  /** Start point (x beside, y above the feet). */
  x: number
  y: number
  /** Texture to start with (keeps the material's program the same when the emoji changes). */
  first: string
}

export function EmojiPop({ show, x, y, first }: Props) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: emojiTexture(first),
        alphaTest: 0.5,
        toneMapped: false,
      }),
    [first],
  )
  useEffect(() => () => material.dispose(), [material])
  const parentQ = useMemo(() => new THREE.Quaternion(), [])

  useFrame(({ clock, camera }) => {
    const m = mesh.current
    if (!m) return
    const state = show.emoji ? emojiState(clock.elapsedTime - show.start) : null
    if (!state?.visible) {
      if (m.visible) m.visible = false
      if (show.emoji && state && !state.visible) show.emoji = null
      return
    }
    const map = emojiTexture(show.emoji!)
    if (material.map !== map) material.map = map
    m.visible = true
    m.position.set(x, y + state.rise, 0)
    m.scale.setScalar(0.42 * state.scale)
    // Face the camera: world rotation = camera rotation.
    m.parent!.getWorldQuaternion(parentQ)
    m.quaternion.copy(parentQ.invert()).multiply(camera.quaternion)
  })

  return (
    <mesh ref={mesh} visible={false}>
      <planeGeometry args={[1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
