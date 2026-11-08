'use client'

import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ComponentType, type Ref } from 'react'
import * as THREE from 'three'
import type { ActorDef } from '@/content/schema'
import { accessories } from './accessories'
import { activities, greet, type PropProps } from './activities'
import type { ActivityName } from './catalog'
import { BODY, resetPose, resolveJoints } from './rig'
import { StyledMaterial } from '@/world/toonMaterial'

interface Props {
  def: ActorDef
  activity: ActivityName
  /** The visitor is here: turn to them and wave. */
  attentive: boolean
  /** Mouth moves while the speech bubble is typing. */
  talking: boolean
}

type Palette = ActorDef['palette']

const EYE = '#17171a'
const SHOE = '#232326'
const GREET_SECONDS = 1.8

function Mat({ color }: { color: string }) {
  return <StyledMaterial color={color} roughness={0.7} />
}

function Leg({ ref, x, palette }: { ref: Ref<THREE.Group>; x: number; palette: Palette }) {
  return (
    <group ref={ref} position={[x, BODY.hipY, 0]}>
      <mesh position={[0, -0.3, 0]}>
        <boxGeometry args={[0.2, 0.6, 0.24]} />
        <Mat color={palette.pants} />
      </mesh>
      <mesh position={[0, -0.58, 0.04]}>
        <boxGeometry args={[0.22, 0.08, 0.32]} />
        <Mat color={SHOE} />
      </mesh>
    </group>
  )
}

function Arm({
  ref,
  side,
  palette,
  Hand,
}: {
  ref: Ref<THREE.Group>
  side: -1 | 1
  palette: Palette
  Hand?: ComponentType<PropProps>
}) {
  return (
    <group ref={ref} position={[side * BODY.shoulderX, BODY.shoulderY, 0]}>
      <mesh position={[0, -0.24, 0]}>
        <boxGeometry args={[0.17, 0.5, 0.18]} />
        <Mat color={palette.shirt} />
      </mesh>
      <mesh position={[0, -0.54, 0]}>
        <boxGeometry args={[0.15, 0.12, 0.16]} />
        <Mat color={palette.skin} />
      </mesh>
      {Hand && (
        <group position={[0, -BODY.armLength, 0]}>
          <Hand palette={palette} />
        </group>
      )}
    </group>
  )
}

/** Stable per-actor phase so idle loops of different characters are not in sync. */
export function phaseOf(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997
  return h * 0.173
}

/**
 * A blocky character built from boxes — no model files. Everything about its look comes
 * from its content file (palette, accessories, activity), so new characters are pure data.
 */
export function Actor({ def, activity, attentive, talking }: Props) {
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)
  const mouth = useRef<THREE.Mesh>(null)

  const { palette } = def
  const act = activities[activity]
  const state = useRef({ attention: 0, greetStart: -Infinity, wasAttentive: false, nextBlink: 2 })
  const phase = useMemo(() => phaseOf(def.id), [def.id])
  const camLocal = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock, camera }, delta) => {
    const j = resolveJoints({ root, torso, head, armL, armR, legL, legR, eyes, mouth })
    if (!j) return
    const now = clock.elapsedTime
    const t = now + phase
    const s = state.current

    resetPose(j)
    act.animate(j, t)

    // Greeting wave when the visitor arrives (skipped if the activity already waves,
    // and when both hands are busy holding something up).
    if (attentive && !s.wasAttentive) s.greetStart = now
    s.wasAttentive = attentive
    const since = now - s.greetStart
    if (activity !== 'waving' && activity !== 'holding' && since < GREET_SECONDS) {
      greet(j, t, Math.sin((since / GREET_SECONDS) * Math.PI))
    }

    // Turn the head towards the camera.
    s.attention += ((attentive ? 1 : 0) - s.attention) * (1 - Math.exp(-delta * 4))
    if (s.attention > 0.001) {
      camLocal.copy(camera.position)
      j.root.worldToLocal(camLocal)
      const yaw = THREE.MathUtils.clamp(Math.atan2(camLocal.x, camLocal.z), -0.9, 0.9)
      const headY = BODY.hipY + BODY.neckY + 0.25
      const pitch = THREE.MathUtils.clamp(
        -Math.atan2(camLocal.y - headY, Math.hypot(camLocal.x, camLocal.z)),
        -0.4,
        0.3,
      )
      j.head.rotation.y = THREE.MathUtils.lerp(j.head.rotation.y, yaw, s.attention)
      j.head.rotation.x = THREE.MathUtils.lerp(j.head.rotation.x, pitch, s.attention)
    }

    // Blink.
    if (now > s.nextBlink) s.nextBlink = now + 2.5 + Math.random() * 3
    j.eyes.scale.y = s.nextBlink - now < 0.12 ? 0.15 : 1

    // Talk.
    j.mouth.scale.y = talking ? 0.6 + Math.abs(Math.sin(t * 16)) * 1.8 : 0.6
  })

  const { Prop, HandL, HandR } = act

  return (
    <group scale={def.scale}>
      <group ref={root}>
        <Leg ref={legL} x={-0.14} palette={palette} />
        <Leg ref={legR} x={0.14} palette={palette} />

        <group ref={torso} position={[0, BODY.hipY, 0]}>
          <RoundedBox args={[0.6, 0.64, 0.34]} radius={0.06} smoothness={3} position={[0, 0.32, 0]}>
            <Mat color={palette.shirt} />
          </RoundedBox>

          <Arm ref={armL} side={-1} palette={palette} Hand={HandL} />
          <Arm ref={armR} side={1} palette={palette} Hand={HandR} />

          <group ref={head} position={[0, BODY.neckY, 0]}>
            <RoundedBox args={[0.5, 0.5, 0.46]} radius={0.07} smoothness={3} position={[0, 0.25, 0]}>
              <Mat color={palette.skin} />
            </RoundedBox>
            {palette.hair && (
              <>
                <mesh position={[0, 0.47, -0.01]}>
                  <boxGeometry args={[0.52, 0.1, 0.48]} />
                  <Mat color={palette.hair} />
                </mesh>
                <mesh position={[0, 0.32, -0.21]}>
                  <boxGeometry args={[0.52, 0.32, 0.08]} />
                  <Mat color={palette.hair} />
                </mesh>
              </>
            )}
            <group ref={eyes} position={[0, 0.27, 0.234]}>
              {[-0.1, 0.1].map((x) => (
                <mesh key={x} position={[x, 0, 0]}>
                  <boxGeometry args={[0.07, 0.09, 0.02]} />
                  <meshBasicMaterial color={EYE} />
                </mesh>
              ))}
            </group>
            <mesh ref={mouth} position={[0, 0.13, 0.234]}>
              <boxGeometry args={[0.1, 0.025, 0.02]} />
              <meshBasicMaterial color={EYE} />
            </mesh>
            {def.accessories.map((name) => {
              const Accessory = accessories[name]
              return <Accessory key={name} palette={palette} />
            })}
          </group>
        </group>

        {Prop && <Prop palette={palette} />}
      </group>
    </group>
  )
}
