'use client'

/**
 * What a character is busy doing. Each activity = a pose animation + optional props.
 *
 * Add a move: write an `Activity` below, add its name to `ACTIVITIES` in catalog.ts,
 * register it in `activities`. Content can then use it (`activity: my-move`).
 */
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { createContext, useContext, useRef, type ComponentType } from 'react'
import type * as THREE from 'three'
import type { ActorDef } from '@/content/schema'
import { CoffeeCup } from '@/world/coffee/Cup'
import type { ActorDrive } from './Actor'
import type { ActivityName } from './catalog'
import type { Joints } from './rig'
import { StyledMaterial } from '@/world/toonMaterial'

/** Rate of the `holding` strain; a held kinetic heading sways in time with it (KineticText). */
export const HOLDING_RATE = 2.4

/** Whether the character holding a prop is on screen this frame (its props pause when not). */
export const ActorOnScreen = createContext<{ current: boolean }>({ current: true })
/** The character's outside drive (D3), for props that depend on it (the carried cup). */
export const ActorDriveContext = createContext<ActorDrive | undefined>(undefined)

export interface PropProps {
  palette: ActorDef['palette']
}

/** Where the activity happens relative to the character (from the exhibit layout). */
export interface PoseContext {
  /** Side of the element the character works on: +1 = its +x (armR side), −1 = its −x. */
  side: 1 | -1
  /** Driven from outside (D3: walking, holding a coffee out). */
  drive?: ActorDrive
}

export interface Activity {
  /** Sets joint rotations for time `t` (seconds). Joints start from the rest pose each frame. */
  animate: (j: Joints, t: number, ctx: PoseContext) => void
  /**
   * Hands placed by IK on the element (C1), after `animate`: `hold` = both palms under it,
   * `point` = the arm on the element's side points at its centre.
   */
  reach?: 'hold' | 'point'
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
        <StyledMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <boxGeometry args={[0.12, 0.86, 0.12]} />
        <StyledMaterial color="#d9d9d4" />
      </mesh>
      {/* laptop */}
      <mesh position={[0, 0.925, 0.02]}>
        <boxGeometry args={[0.56, 0.03, 0.36]} />
        <StyledMaterial color="#c9ccd3" metalness={0.3} roughness={0.4} />
      </mesh>
      <group position={[0, 0.94, 0.2]} rotation-x={0.3}>
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[0.56, 0.36, 0.02]} />
          <StyledMaterial color="#c9ccd3" metalness={0.3} roughness={0.4} />
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
        <StyledMaterial color="#9c6b3f" />
      </mesh>
      <mesh position={[0.22, 0.6, -0.08]} rotation-z={-0.12}>
        <boxGeometry args={[0.05, 1.3, 0.05]} />
        <StyledMaterial color="#9c6b3f" />
      </mesh>
      <mesh position={[0, 1.2, 0]} rotation-x={-0.1}>
        <boxGeometry args={[0.72, 0.56, 0.03]} />
        <StyledMaterial color="#ffffff" />
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
      <StyledMaterial color="#222222" />
    </mesh>
  )
}

function PaintPalette({ palette }: PropProps) {
  return (
    <mesh position={[0, -0.04, 0.12]} rotation-x={Math.PI / 2 - 0.3}>
      <cylinderGeometry args={[0.16, 0.16, 0.02, 20]} />
      <StyledMaterial color={palette.accent} />
    </mesh>
  )
}

function FloatingCube({ palette }: PropProps) {
  const ref = useRef<THREE.Mesh>(null)
  const shown = useContext(ActorOnScreen)
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m || !shown.current) return
    const t = clock.elapsedTime
    m.rotation.set(t * 0.7, t * 1.1, 0)
    m.position.y = 1.5 + Math.sin(t * 1.6) * 0.06
  })
  return (
    <mesh ref={ref} position={[0, 1.5, 0.62]}>
      <boxGeometry args={[0.34, 0.34, 0.34]} />
      <StyledMaterial color={palette.accent} roughness={0.3} metalness={0.1} />
    </mesh>
  )
}

function JuggleBalls({ palette }: PropProps) {
  const group = useRef<THREE.Group>(null)
  const colors = [palette.accent, palette.shirt, '#ffffff']
  const shown = useContext(ActorOnScreen)
  useFrame(({ clock }) => {
    if (!shown.current) return
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
          <StyledMaterial color={c} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

function ChartBoard({ palette }: PropProps) {
  const bars = useRef<THREE.Group>(null)
  const shown = useContext(ActorOnScreen)
  useFrame(({ clock }) => {
    if (!shown.current) return
    bars.current?.children.forEach((bar, i) => {
      const h = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.2 + i * 1.3)) * (i + 1) * 0.5
      bar.scale.y = h
      bar.position.y = -0.3 + h / 2
    })
  })
  return (
    <group position={[-1.05, 1.45, 0.35]} rotation-y={0.55}>
      <RoundedBox args={[1, 0.8, 0.04]} radius={0.03} smoothness={3}>
        <StyledMaterial color="#ffffff" />
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

/**
 * The cup in the right hand (D3, `carrying`): upright whatever the arm does — the arm's and the
 * forearm's bends always add up to the same angle (see `carrying`) — shown while carried.
 */
function CarriedCup() {
  const drive = useContext(ActorDriveContext)
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    if (group.current) group.current.visible = drive?.carrying ?? false
  })
  return (
    <group ref={group} rotation-x={CARRY_ANGLE}>
      <group position={[0, -0.02, 0.06]}>
        <CoffeeCup />
      </group>
    </group>
  )
}

/** Arm + forearm bend while carrying (rad): the cup is turned back by as much. */
const CARRY_ANGLE = 1.75

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

  /**
   * Holds the element above its head so it does not fall (element is lifted to fit). The palms
   * are pressed under it by IK; the arms are a bit too short for that, so they stretch a little
   * and the shoulders shrug — straining, cartoon style.
   */
  holding: {
    animate: (j, t) => {
      const strain = Math.sin(t * HOLDING_RATE) * 0.05
      // Fallback pose (IK overrides the arms when the element is known).
      j.armL.rotation.set(-0.15, 0, -2.78 + strain)
      j.armR.rotation.set(-0.15, 0, 2.78 - strain)
      j.armL.position.y += 0.05 + strain * 0.2
      j.armR.position.y += 0.05 - strain * 0.2
      j.head.rotation.x = -0.32 + Math.sin(t * 0.9) * 0.05
      j.torso.rotation.z = Math.sin(t * 1.2) * 0.03
      // Knees give a little under the weight (the feet stay planted by IK).
      j.root.position.y = -0.015 - Math.abs(Math.sin(t * 1.2)) * 0.02
    },
    reach: 'hold',
  },

  /**
   * Carries something in the right hand (D3: a coffee for the visitor), elbow bent; `drive.offer`
   * holds it out towards the visitor. The two bends always add up to CARRY_ANGLE.
   */
  carrying: {
    animate: (j, t, { drive }) => {
      breathe(j, t)
      const offer = drive?.offer ?? 0
      const arm = -0.75 - 0.75 * offer
      j.armR.rotation.set(arm, 0, 0.12 - 0.08 * offer)
      j.foreR.rotation.x = -CARRY_ANGLE - arm
      j.armL.rotation.x = Math.sin(t * 1.1) * 0.06
    },
    HandR: CarriedCup,
  },

  /** Points at the element beside it (either side). */
  pointing: {
    animate: (j, t, { side }) => {
      breathe(j, t)
      const [arm, other] = side > 0 ? [j.armR, j.armL] : [j.armL, j.armR]
      j.torso.rotation.y = 0.25 * side
      j.head.rotation.y = (0.5 + Math.sin(t * 0.6) * 0.2) * side
      // Fallback pose (IK aims the arm when the element is known).
      arm.rotation.set(-0.35 + Math.sin(t * 2.2) * 0.08, 0, 1.35 * side)
      other.rotation.set(0.05, 0, -0.1 * side)
    },
    reach: 'point',
  },
}

/** One-off greeting layered on top of any activity when the visitor arrives. */
export function greet(j: Joints, t: number, weight: number) {
  if (weight <= 0) return
  const lerp = (a: number, b: number) => a + (b - a) * weight
  j.armR.rotation.x = lerp(j.armR.rotation.x, 0)
  j.armR.rotation.y = lerp(j.armR.rotation.y, 0)
  j.armR.rotation.z = lerp(j.armR.rotation.z, 2.55 + Math.sin(t * 9) * 0.35)
  // The hand waves from the elbow.
  j.foreR.rotation.x = lerp(j.foreR.rotation.x, 0)
  j.foreR.rotation.z = lerp(j.foreR.rotation.z, Math.sin(t * 9 + 0.6) * 0.35)
}
