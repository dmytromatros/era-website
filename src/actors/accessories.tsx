'use client'

/**
 * Things a character can wear. Rendered in HEAD space: head cube centred at (0, 0.25, 0),
 * 0.5 wide, face at z ≈ 0.23. Add one: component here + name in catalog.ts + registry entry.
 */
import type { ComponentType } from 'react'
import type { ActorDef } from '@/content/schema'
import type { AccessoryName } from './catalog'
import { StyledMaterial } from '@/world/toonMaterial'

interface Props {
  palette: ActorDef['palette']
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

export const accessories: Record<AccessoryName, ComponentType<Props>> = {
  headphones: Headphones,
  cap: Cap,
  glasses: Glasses,
  beret: Beret,
  antenna: Antenna,
}
