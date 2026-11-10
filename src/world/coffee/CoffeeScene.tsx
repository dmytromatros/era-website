'use client'

import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Actor, type ActorDrive } from '@/actors/Actor'
import { BODY } from '@/actors/rig'
import type { ActorDef, Welcome } from '@/content/schema'
import { live } from '@/experience/store'
import { useTheme } from '@/theme/store'
import { cutsceneNow } from '../cutscene/cutsceneModel'
import { htmlPortal } from '../htmlPortal'
import { ENTRANCE_GEOMETRY, type Vec3 } from '../layout'
import { warmPrograms } from '../precompile'
import type { Timing } from '../route'
import { SpeechBubble } from '../SpeechBubble'
import { timeline } from '../timeline'
import { cupParts } from './Cup'
import {
  COFFEE,
  coffeeHand,
  coffeePath,
  coffeeStatus,
  coffeeTalk,
  herCup,
  newCoffee,
  offerReach,
  present,
  stepCoffee,
  takeHand,
  type CoffeePhase,
} from './coffeeModel'
import styles from '../Helper.module.css'

interface Props {
  welcome: Welcome & { def: ActorDef }
  /** The end of the entrance (rail point 1): where the camera stands and what it looks at. */
  viewpoint: Vec3
  focus: Vec3
  floorY: number
  timing: Timing
}

type Say = 'offer' | 'thanks' | 'shrug' | null

const _v = new THREE.Vector3()

/**
 * The coffee welcome (wow-plan D3; coffeeModel.ts has the story and its rules). Mounted with the
 * page; the character herself only while she is in the scene — before and after, nothing of her
 * is drawn or computed.
 */
export function CoffeeScene({ welcome, viewpoint, focus, floorY, timing }: Props) {
  const theme = useTheme()
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const aspect = size.width / size.height
  const path = useMemo(() => coffeePath(viewpoint, focus, floorY, aspect, ENTRANCE_GEOMETRY.fov), [viewpoint, focus, floorY, aspect])
  const state = useMemo(() => newCoffee(path), [path])
  const drive = useMemo<ActorDrive>(() => ({ walked: 0, moving: 0, offer: 0, carrying: true, cue: null }), [])
  const group = useRef<THREE.Group>(null)
  const [phase, setPhase] = useState<CoffeePhase>(state.phase)
  const [say, setSay] = useState<Say>(null)
  const [typed, setTyped] = useState(false)
  const docked = size.width < 720
  const thanked = useRef(false)

  // The steam's program, ahead of time (the cup only appears with her).
  useEffect(() => {
    let cancelled = false
    const proxies = new THREE.Scene()
    proxies.add(new THREE.Mesh(cupParts().steam, cupParts().steamMaterial))
    const timer = setTimeout(() => void warmPrograms(gl, scene, camera, proxies, () => cancelled), 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [gl, scene, camera])

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime
    const before = state.phase
    stepCoffee(state, path, {
      now,
      dt: delta,
      // The entrance cutscene starts it (only after a fall in from the 2D landing).
      start: cutsceneNow.phase === 'coffee',
      away: timeline(live.progress, timing.segments).railIndex > 1 + COFFEE.scrolledOn,
    })
    if (state.phase !== before) {
      coffeeStatus.phase = state.phase
      coffeeStatus.since = now
      setPhase(state.phase)
      if (state.phase === 'offering') {
        setSay('offer')
        setTyped(false)
      }
      if (state.phase === 'declining') {
        setSay('shrug')
        drive.cue = { move: 'shrug', emoji: '🙂' }
      }
      if (state.phase === 'leaving' && before === 'approaching') setSay(null)
      if (state.phase === 'done') setSay(null)
    }
    if (state.phase === 'taking' && now - state.since >= COFFEE.pass && !thanked.current) {
      thanked.current = true
      setSay('thanks')
      drive.cue = { move: 'jump', emoji: '😊' }
    }

    drive.walked = state.walked
    drive.moving = state.moving
    drive.offer = offerReach(state, now)
    drive.carrying = herCup(state, now)

    // The visitor's hand reaches along the ray to the cup she holds out.
    coffeeHand.take = takeHand(state, now)
    const g = group.current
    if (g) {
      g.position.set(...state.position)
      g.rotation.y = state.yaw
      if (coffeeHand.take > 0) {
        _v.set(0.2, 1.25, 0.45).applyMatrix4(g.matrixWorld)
        camera.worldToLocal(_v).normalize()
        coffeeHand.toward = [_v.x, _v.y, _v.z]
      }
    }
  })

  const answer = useCallback(
    (a: 'take' | 'decline') => {
      if (state.phase === 'offering') state.answer = a
    },
    [state],
  )
  const typedDone = useCallback(() => setTyped(true), [])

  // While she talks, the other characters' bubbles wait (Helper).
  useEffect(() => {
    coffeeTalk.on = say !== null && present(phase)
    return () => void (coffeeTalk.on = false)
  }, [say, phase])

  if (!present(phase)) return null
  const def = welcome.def
  const lines = say === 'offer' ? welcome.lines : say === 'thanks' ? [welcome.thanks] : say === 'shrug' ? [welcome.shrug] : []
  const bubble = say && (
    <SpeechBubble key={say} name={`${def.name} · ${def.role}`} lines={lines} onDone={typedDone}>
      {say === 'offer' && typed && phase === 'offering' && (
        <div className={styles.actions}>
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => answer('take')}>
            {welcome.take}
          </button>
          <button type="button" className={styles.button} onClick={() => answer('decline')}>
            {welcome.decline}
          </button>
        </div>
      )}
    </SpeechBubble>
  )

  return (
    <group ref={group}>
      <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.45, 32]} />
        <meshBasicMaterial color={theme.world.shadow} transparent opacity={theme.world.shadowOpacity} />
      </mesh>
      <Actor def={def} activity="carrying" attentive talking={say !== null && !typed} drive={drive} />
      {bubble && docked && (
        <Html calculatePosition={() => [0, 0]} portal={htmlPortal} zIndexRange={[20, 11]}>
          <div className={styles.dock}>{bubble}</div>
        </Html>
      )}
      {bubble && !docked && (
        <Html position={[0, BODY.height * def.scale + 0.25, 0]} portal={htmlPortal} zIndexRange={[20, 11]}>
          <div className={styles.anchorAbove}>{bubble}</div>
        </Html>
      )}
    </group>
  )
}

