'use client'

/**
 * Things a character can wear. Rendered in HEAD space (head cube centred at (0, 0.25, 0),
 * 0.5 wide, face at z ≈ 0.23) or TORSO space (torso box centred at (0, 0.32, 0), 0.6 × 0.64,
 * chest at z = 0.17) — see `mount`. Add one: component here + name in catalog.ts + registry entry.
 *
 * Secondary motion (C1): each accessory swings around its `pivot` on a spring (`wobble`,
 * lifeModel.ts) — a cap lags behind a quick turn, an antenna bobs on a hop, a badge swings.
 */
import { useEffect, useMemo, type ComponentType } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ActorDef } from '@/content/schema'
import type { AccessoryName } from './catalog'
import type { WobbleTuning } from './lifeModel'
import { StyledMaterial } from '@/world/toonMaterial'

interface Props {
  palette: ActorDef['palette']
  /** The character's name (the badge shows it). */
  name: string
}

export interface AccessoryDef {
  Component: ComponentType<Props>
  mount: 'head' | 'torso'
  /** Point it swings around, in mount space. */
  pivot: [number, number, number]
  wobble: WobbleTuning
}

const DARK = '#1b1b1f'

function Headphones({ palette }: Props) {
  return (
    <group>
      <mesh position={[0, 0.27, 0]}>
        <torusGeometry args={[0.29, 0.032, 8, 24, Math.PI]} />
        <StyledMaterial color={DARK} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.285, 0.24, 0]}>
          <boxGeometry args={[0.09, 0.2, 0.2]} />
          <StyledMaterial color={palette.accent} />
        </mesh>
      ))}
    </group>
  )
}

function Cap({ palette }: Props) {
  return (
    <group>
      <mesh position={[0, 0.54, 0]}>
        <boxGeometry args={[0.54, 0.13, 0.5]} />
        <StyledMaterial color={palette.accent} />
      </mesh>
      <mesh position={[0, 0.49, 0.32]}>
        <boxGeometry args={[0.5, 0.035, 0.22]} />
        <StyledMaterial color={palette.accent} />
      </mesh>
    </group>
  )
}

function Glasses() {
  return (
    <group position={[0, 0.27, 0.245]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.11, 0, 0]}>
          <boxGeometry args={[0.16, 0.11, 0.015]} />
          <StyledMaterial color="#9ad7ff" transparent opacity={0.55} />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 0.005]}>
        <boxGeometry args={[0.42, 0.025, 0.02]} />
        <StyledMaterial color={DARK} />
      </mesh>
    </group>
  )
}

function Beret({ palette }: Props) {
  return (
    <group position={[0.04, 0.53, 0]} rotation-z={0.22}>
      <mesh>
        <cylinderGeometry args={[0.31, 0.28, 0.08, 24]} />
        <StyledMaterial color={palette.accent} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.05, 8]} />
        <StyledMaterial color={palette.accent} />
      </mesh>
    </group>
  )
}

function Antenna({ palette }: Props) {
  return (
    <group position={[0.12, 0.5, 0]}>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.3, 6]} />
        <StyledMaterial color={DARK} />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <StyledMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

/**
 * Name badge on a lanyard. Two draw calls: both cords are one geometry, and the card is one box
 * with the whole face (white card, colour strip, name) drawn once into a canvas texture.
 */
function Badge({ palette, name }: Props) {
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 154
    const ctx = canvas.getContext('2d')!
    // 256 × 154 ≈ the card's 0.2 × 0.12 face.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 256, 154)
    ctx.fillStyle = palette.accent === '#ffffff' ? palette.shirt : palette.accent
    ctx.fillRect(0, 0, 256, 40)
    ctx.fillStyle = '#17171a'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 54
    do ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`
    while (ctx.measureText(name).width > 228 && --size > 20)
    ctx.fillText(name, 128, 99)
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [name, palette.accent, palette.shirt])
  useEffect(() => () => texture?.dispose(), [texture])

  // A "V" from both sides of the neck down to the card, as one geometry.
  const cords = useMemo(() => {
    const parts = [-1, 1].map((s) =>
      new THREE.BoxGeometry(0.018, 0.28, 0.012).rotateZ(-s * 0.42).translate(s * 0.065, -0.12, 0.035),
    )
    const merged = mergeGeometries(parts)
    for (const g of parts) g.dispose()
    return merged
  }, [])
  useEffect(() => () => cords.dispose(), [cords])

  // Pivot (in torso space) is where the lanyard meets at the back of the neck: (0, 0.62, 0.15).
  return (
    <group position={[0, 0.62, 0.15]}>
      <mesh geometry={cords}>
        <StyledMaterial color={palette.accent === '#ffffff' ? '#1b1b1f' : palette.accent} />
      </mesh>
      <mesh position={[0, -0.31, 0.04]}>
        <boxGeometry args={[0.2, 0.12, 0.012]} />
        {texture ? <meshBasicMaterial map={texture} toneMapped={false} /> : <StyledMaterial color="#ffffff" />}
      </mesh>
    </group>
  )
}

/** Light things on the head: a short, quick lag. */
const SNUG: WobbleTuning = {
  gain: [0.025, 0.035, 0.025],
  turnSwing: 0,
  bounce: 0.25,
  stiffness: 160,
  damping: 11,
  limit: [0.12, 0.15, 0.12],
}

export const accessories: Record<AccessoryName, AccessoryDef> = {
  headphones: { Component: Headphones, mount: 'head', pivot: [0, 0.25, 0], wobble: { ...SNUG, gain: [0.01, 0.015, 0.01], bounce: 0.1 } },
  cap: { Component: Cap, mount: 'head', pivot: [0, 0.5, -0.1], wobble: SNUG },
  glasses: { Component: Glasses, mount: 'head', pivot: [0, 0.33, 0.24], wobble: { ...SNUG, gain: [0.01, 0, 0.012], bounce: 0.15 } },
  beret: { Component: Beret, mount: 'head', pivot: [0, 0.5, 0], wobble: { ...SNUG, gain: [0.04, 0.05, 0.04], stiffness: 110 } },
  // A thin rod with a ball on top: big, bouncy, slow to settle.
  antenna: {
    Component: Antenna,
    mount: 'head',
    pivot: [0.12, 0.5, 0],
    wobble: { gain: [0.09, 0, 0.09], turnSwing: 0.08, bounce: 1.1, stiffness: 70, damping: 3.2, limit: [0.6, 0, 0.6] },
  },
  // Hangs on the chest: swings forward freely, never into the chest.
  badge: {
    Component: Badge,
    mount: 'torso',
    pivot: [0, 0.62, 0.15],
    wobble: {
      gain: [0.12, 0, 0.1],
      turnSwing: 0.1,
      bounce: 0.9,
      stiffness: 45,
      damping: 3.5,
      limit: [0.7, 0, 0.5],
      xRange: [-0.7, 0.02],
    },
  },
}
