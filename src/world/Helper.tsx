'use client'

import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useRef, useState } from 'react'
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
  // On narrow screens a bubble beside the character would run off the edge: dock it instead.
  const docked = useThree((s) => s.size.width < 720)
  const { helper, local, bubble, bubbleY } = placed

  return (
    <group position={local}>
      <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.45, 32]} />
        <meshBasicMaterial color={theme.world.shadow} transparent opacity={theme.world.shadowOpacity} />
      </mesh>
      {/* No bubble while hushed — no talking mouth either (it would move with nothing to say). */}
      <Actor def={actor} activity={helper.pose} attentive={attentive} talking={talking && !hushed} target={placed.target} hitKey={hitKey} />
      {attentive && !hushed && docked && (
        // Pinned to the overlay's top-left corner; the CSS docks it to the bottom of the screen.
        <Html calculatePosition={() => [0, 0]} portal={htmlPortal} zIndexRange={[20, 11]}>
          <div className={styles.dock}>
            <SpeechBubble name={`${actor.name} · ${actor.role}`} lines={helper.lines} onDone={stopTalking} />
          </div>
        </Html>
      )}
      {attentive && !hushed && !docked && (
        <Html position={[bubble === 'right' ? 0.4 : 0, bubbleY, 0]} portal={htmlPortal} zIndexRange={[20, 11]}>
          <div className={bubble === 'right' ? styles.anchorRight : styles.anchorAbove}>
            <SpeechBubble name={`${actor.name} · ${actor.role}`} lines={helper.lines} onDone={stopTalking} />
          </div>
        </Html>
      )}
    </group>
  )
}
