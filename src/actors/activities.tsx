'use client'

/**
 * What a character is busy doing. Each activity = a pose animation + optional props.
 *
 * Add a move: write an `Activity` below, add its name to `ACTIVITIES` in catalog.ts,
 * register it in `activities`. Content can then use it (`activity: my-move`).
 */
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, type ComponentType } from 'react'
import type * as THREE from 'three'
import type { ActorDef } from '@/content/schema'
import type { ActivityName } from './catalog'
import type { Joints } from './rig'

export interface PropProps {
  palette: ActorDef['palette']
}

export interface Activity {
  /** Sets joint rotations for time `t` (seconds). Joints start from the rest pose each frame. */
  animate: (j: Joints, t: number) => void
  /** Rendered in actor space (feet at the origin, facing +z). */
  Prop?: ComponentType<PropProps>
  /** Rendered in the right / left hand. */
  HandR?: ComponentType<PropProps>
  HandL?: ComponentType<PropProps>
}

const SCREEN = '#0f1115'

/* ---------------------------------------------------------------- props */

function Desk({ palette }: PropProps) {
  return (
    <group position={[0, 0, 0.62]}>
      <mesh position={[0, 0.88, 0]}>
        <boxGeometry args={[1, 0.06, 0.5]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <boxGeometry args={[0.12, 0.86, 0.12]} />
        <meshStandardMaterial color="#d9d9d4" />
      </mesh>
      {/* laptop */}
      <mesh position={[0, 0.925, 0.02]}>
        <boxGeometry args={[0.56, 0.03, 0.36]} />
        <meshStandardMaterial color="#c9ccd3" metalness={0.3} roughness={0.4} />
      </mesh>
      <group position={[0, 0.94, 0.2]} rotation-x={0.3}>
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[0.56, 0.36, 0.02]} />
          <meshStandardMaterial color="#c9ccd3" metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.18, -0.012]}>
          <planeGeometry args={[0.5, 0.3]} />
          <meshBasicMaterial color={palette.accent === '#ffffff' ? palette.shirt : palette.accent} side={2} />
        </mesh>
      </group>
    </group>
  )
}

function Easel({ palette }: PropProps) {
  const strokes = [palette.accent, palette.shirt, '#3b6cf6', '#2bb673']
  return (
    <group position={[0.62, 0, 0.55]} rotation-y={-0.7}>
      <mesh position={[-0.22, 0.6, -0.08]} rotation-z={0.12}>
        <boxGeometry args={[0.05, 1.3, 0.05]} />
        <meshStandardMaterial color="#9c6b3f" />
      </mesh>
      <mesh position={[0.22, 0.6, -0.08]} rotation-z={-0.12}>
        <boxGeometry args={[0.05, 1.3, 0.05]} />
        <meshStandardMaterial color="#9c6b3f" />
      </mesh>
      <mesh position={[0, 1.2, 0]} rotation-x={-0.1}>
        <boxGeometry args={[0.72, 0.56, 0.03]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {strokes.map((c, i) => (
        <mesh key={i} position={[-0.2 + i * 0.13, 1.12 + (i % 2) * 0.12, 0.022]} rotation={[-0.1, 0, i * 0.5]}>
          <boxGeometry args={[0.22, 0.05, 0.005]} />
          <meshBasicMaterial color={c} />
        </mesh>
      ))}
    </group>
  )
}

function Brush() {
  return (
    <mesh position={[0, -0.05, 0.08]} rotation-x={1.2}>
      <cylinderGeometry args={[0.015, 0.02, 0.32, 6]} />
      <meshStandardMaterial color="#222222" />
    </mesh>
  )
}

function PaintPalette({ palette }: PropProps) {
  return (
    <mesh position={[0, -0.04, 0.12]} rotation-x={Math.PI / 2 - 0.3}>
      <cylinderGeometry args={[0.16, 0.16, 0.02, 20]} />
      <meshStandardMaterial color={palette.accent} />
    </mesh>
  )
}

function FloatingCube({ palette }: PropProps) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    const t = clock.elapsedTime
    m.rotation.set(t * 0.7, t * 1.1, 0)
    m.position.y = 1.5 + Math.sin(t * 1.6) * 0.06
  })
  return (
    <mesh ref={ref} position={[0, 1.5, 0.62]}>
      <boxGeometry args={[0.34, 0.34, 0.34]} />
      <meshStandardMaterial color={palette.accent} roughness={0.3} metalness={0.1} />
    </mesh>
  )
}

function JuggleBalls({ palette }: PropProps) {
  const group = useRef<THREE.Group>(null)
  const colors = [palette.accent, palette.shirt, '#ffffff']
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 3.2
    group.current?.children.forEach((ball, i) => {
      const a = t + (i * Math.PI * 2) / 3
      ball.position.set(Math.cos(a) * 0.32, 1.25 + Math.abs(Math.sin(a)) * 0.6, 0.55)
    })
  })
  return (
    <group ref={group}>
      {colors.map((c, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.075, 16, 12]} />
          <meshStandardMaterial color={c} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

function ChartBoard({ palette }: PropProps) {
  const bars = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    bars.current?.children.forEach((bar, i) => {
      const h = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.2 + i * 1.3)) * (i + 1) * 0.5
      bar.scale.y = h
      bar.position.y = -0.3 + h / 2
    })
  })
  return (
    <group position={[-1.05, 1.45, 0.35]} rotation-y={0.55}>
      <RoundedBox args={[1, 0.8, 0.04]} radius={0.03} smoothness={3}>
        <meshStandardMaterial color="#ffffff" />
      </RoundedBox>
      <group ref={bars} position={[0, 0, 0.03]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[-0.25 + i * 0.25, 0, 0]}>
            <boxGeometry args={[0.15, 1, 0.02]} />
            <meshBasicMaterial color={i === 2 ? palette.accent : SCREEN} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------- activities */

const breathe = (j: Joints, t: number) => {
  j.torso.rotation.x = Math.sin(t * 1.8) * 0.015
  j.root.position.y = Math.sin(t * 1.8) * 0.006
}

export const activities: Record<ActivityName, Activity> = {
  idle: {
    animate: (j, t) => {
      breathe(j, t)
      j.torso.rotation.y = Math.sin(t * 0.5) * 0.08
      j.head.rotation.y = Math.sin(t * 0.37) * 0.35
      j.armL.rotation.x = Math.sin(t * 1.1) * 0.06
      j.armR.rotation.x = -Math.sin(t * 1.1) * 0.06
    },
  },

  typing: {
    animate: (j, t) => {
      breathe(j, t)
      j.head.rotation.x = 0.28 + Math.sin(t * 0.7) * 0.04
      j.armL.rotation.set(-1.15 + Math.sin(t * 17) * 0.05, 0, 0.18)
      j.armR.rotation.set(-1.15 + Math.sin(t * 17 + 1.7) * 0.05, 0, -0.18)
    },
    Prop: Desk,
  },

  drawing: {
    animate: (j, t) => {
      breathe(j, t)
      j.torso.rotation.y = -0.25
      j.head.rotation.set(0.08, -0.35 + Math.sin(t * 0.6) * 0.1, 0)
      j.armR.rotation.set(-1.35 + Math.sin(t * 3) * 0.22, 0, 0.25 + Math.cos(t * 3) * 0.18)
      j.armL.rotation.set(-0.85, 0, 0.2)
    },
    Prop: Easel,
    HandR: Brush,
    HandL: PaintPalette,
  },

  'rotating-cube': {
    animate: (j, t) => {
      breathe(j, t)
      j.head.rotation.x = -0.12
      j.armL.rotation.set(-1.45 + Math.sin(t * 1.6) * 0.06, 0, 0.32)
      j.armR.rotation.set(-1.45 + Math.sin(t * 1.6 + 0.4) * 0.06, 0, -0.32)
    },
    Prop: FloatingCube,
  },

  juggling: {
    animate: (j, t) => {
      breathe(j, t)
      const s = Math.sin(t * 6.4)
      j.armL.rotation.set(-1.05 + s * 0.28, 0, 0.12)
      j.armR.rotation.set(-1.05 - s * 0.28, 0, -0.12)
      j.head.rotation.x = -0.2 + Math.abs(s) * 0.1
      j.root.position.y = Math.abs(Math.sin(t * 3.2)) * 0.02
    },
    Prop: JuggleBalls,
  },

  presenting: {
    animate: (j, t) => {
      breathe(j, t)
      j.torso.rotation.y = 0.15
      j.head.rotation.y = 0.45 + Math.sin(t * 0.5) * 0.35
      j.armL.rotation.set(-0.5 + Math.sin(t * 2) * 0.08, 0, -1.25)
      j.armR.rotation.set(0.05, 0, 0.12)
    },
    Prop: ChartBoard,
  },

  waving: {
    animate: (j, t) => {
      breathe(j, t)
      j.armR.rotation.set(0, 0, 2.55 + Math.sin(t * 7) * 0.32)
      j.head.rotation.z = Math.sin(t * 3.5) * 0.06
      j.root.position.y = Math.abs(Math.sin(t * 3.5)) * 0.025
    },
  },

  /** Holds the element above its head so it does not fall (element is lifted to fit). */
  holding: {
    animate: (j, t) => {
      const strain = Math.sin(t * 2.4) * 0.05
      j.armL.rotation.set(-0.15, 0, -2.78 + strain)
      j.armR.rotation.set(-0.15, 0, 2.78 - strain)
      j.head.rotation.x = -0.32 + Math.sin(t * 0.9) * 0.05
      j.torso.rotation.z = Math.sin(t * 1.2) * 0.03
      j.root.position.y = -Math.abs(Math.sin(t * 1.2)) * 0.02
    },
  },

  /** Points at the element to its right. */
  pointing: {
    animate: (j, t) => {
      breathe(j, t)
      j.torso.rotation.y = 0.25
      j.head.rotation.y = 0.5 + Math.sin(t * 0.6) * 0.2
      j.armR.rotation.set(-0.35 + Math.sin(t * 2.2) * 0.08, 0, 1.35)
      j.armL.rotation.set(0.05, 0, -0.1)
    },
  },
}

/** One-off greeting layered on top of any activity when the visitor arrives. */
export function greet(j: Joints, t: number, weight: number) {
  if (weight <= 0) return
  const lerp = (a: number, b: number) => a + (b - a) * weight
  j.armR.rotation.x = lerp(j.armR.rotation.x, 0)
  j.armR.rotation.y = lerp(j.armR.rotation.y, 0)
  j.armR.rotation.z = lerp(j.armR.rotation.z, 2.55 + Math.sin(t * 9) * 0.35)
}
