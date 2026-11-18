'use client'

import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useRef, useState } from 'react'
import type * as THREE from 'three'
import { Actor } from '@/actors/Actor'
import type { ActorDef } from '@/content/schema'
import { live } from '@/experience/store'
import { coffeeTalk } from './coffee/coffeeModel'
import { useTheme } from '@/theme/store'
import type { PlacedHelper } from './exhibitModel'
import { htmlPortal } from './htmlPortal'
import { SpeechBubble } from './SpeechBubble'
import type { Timing } from './route'
import { timeline } from './timeline'
import { useKeeper } from './letterFix/useKeeper'
import styles from './Helper.module.css'

/**
 * How close (in rail stops) the visitor must be for the character to notice them; with
 * hysteresis. Based on the scroll timeline, so it behaves the same on every screen shape.
 */
const NOTICE = 0.3
const FORGET = 0.45

interface Props {
  placed: PlacedHelper
  actor: ActorDef
  stopIndex: number
  timing: Timing
  /** Key under which prop hits reach this character (C2). */
  hitKey: string
}

/** A character working next to an element; talks when the camera stops at its exhibit. */
export function Helper({ placed, actor, stopIndex, timing, hitKey }: Props) {
  const theme = useTheme()
  const [attentive, setAttentive] = useState(false)
  const [talking, setTalking] = useState(false)
  const near = useRef(false)
  // The coffee welcome (D3) is talking: this bubble waits so the two do not overlap.
  const [hushed, setHushed] = useState(false)

  useFrame(() => {
    if (coffeeTalk.on !== hushed) {
      setHushed(coffeeTalk.on)
      // Its bubble comes back and types the lines again: the mouth moves with it.
      if (!coffeeTalk.on && near.current) setTalking(true)
    }
    const gap = Math.abs(timeline(live.progress, timing.segments).railIndex - timing.stopRail[stopIndex]!)
    const next = near.current ? gap < FORGET : gap < NOTICE
    if (next !== near.current) {
      near.current = next
      setAttentive(next)
      setTalking(next)
    }
  })

  const stopTalking = useCallback(() => setTalking(false), [])
  // E4: the one holding the hero heading fetches a letter knocked off it (and grumbles).
  const post = useRef<THREE.Group>(null)
  const walker = useRef<THREE.Group>(null)
  const keeper = useKeeper(walker, post, placed.helper.pose === 'holding' ? (placed.helper.grumbles ?? []) : [], actor.scale)
  const quiet = hushed || keeper.line !== null
  // On narrow screens a bubble beside the character would run off the edge: dock it instead.
  const docked = useThree((s) => s.size.width < 720)
  const { helper, local, bubble, bubbleY } = placed

  return (
    <group position={local} ref={post}>
      <group ref={walker}>
        <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.45, 32]} />
          <meshBasicMaterial color={theme.world.shadow} transparent opacity={theme.world.shadowOpacity} />
        </mesh>
        {/* No bubble while hushed — no talking mouth either (it would move with nothing to say). */}
        <Actor
          def={actor}
          activity={keeper.activity ?? helper.pose}
          attentive={attentive && keeper.atPost}
          talking={(talking && !quiet) || keeper.line !== null}
          target={keeper.atPost ? placed.target : undefined}
          hitKey={hitKey}
          drive={keeper.drive}
        />
        {keeper.line && (
          <Html position={[0, bubbleY, 0]} portal={htmlPortal} zIndexRange={[20, 11]}>
            <div className={styles.anchorAbove}>
              <SpeechBubble name={`${actor.name} · ${actor.role}`} lines={[keeper.line]} onDone={() => {}} />
            </div>
          </Html>
        )}
      </group>
      {attentive && !quiet && docked && (
        // Pinned to the overlay's top-left corner; the CSS docks it to the bottom of the screen.
        <Html calculatePosition={() => [0, 0]} portal={htmlPortal} zIndexRange={[20, 11]}>
          <div className={styles.dock}>
            <SpeechBubble name={`${actor.name} · ${actor.role}`} lines={helper.lines} onDone={stopTalking} />
          </div>
        </Html>
      )}
      {attentive && !quiet && !docked && (
        <Html position={[bubble === 'right' ? 0.4 : 0, bubbleY, 0]} portal={htmlPortal} zIndexRange={[20, 11]}>
          <div className={bubble === 'right' ? styles.anchorRight : styles.anchorAbove}>
            <SpeechBubble name={`${actor.name} · ${actor.role}`} lines={helper.lines} onDone={stopTalking} />
          </div>
        </Html>
      )}
    </group>
  )
}
