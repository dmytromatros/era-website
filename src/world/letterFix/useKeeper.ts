'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import type { ActorDrive } from '@/actors/Actor'
import type { ActivityName } from '@/actors/catalog'
import { FIX, letterFix, standNear, walkStep } from './letterModel'

type Mode = 'post' | 'alarm' | 'run' | 'pick' | 'carry' | 'place' | 'grumble'

/**
 * The one holding the hero heading fetches a knocked-off letter (E4, letterModel.ts): sees it
 * fall (surprised), lets go — the heading sags — runs over, picks it up, carries it back over the
 * head, the letter springs back into its slot, and mutters one of its `grumbles`. Moves the
 * `walker` group (the character inside the helper's group, `post` = where it stands); off when
 * `grumbles` is empty. Nothing runs between fixes but a phase check.
 */
export function useKeeper(walker: RefObject<THREE.Group | null>, post: RefObject<THREE.Group | null>, grumbles: string[], scale: number) {
  const on = grumbles.length > 0
  const drive = useMemo<ActorDrive>(() => ({ walked: 0, moving: 0, offer: 0, carrying: false, cue: null }), [])
  const [activity, setActivity] = useState<ActivityName | null>(null)
  const [line, setLine] = useState<string | null>(null)
  const st = useRef({ mode: 'post' as Mode, since: 0, x: 0, z: 0, yaw: 0, said: 0, to: { x: 0, z: 0 } })
  const v = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }, delta) => {
    if (!on) return
    const w = walker.current
    const p = post.current
    if (!w || !p) return
    const s = st.current
    const fix = letterFix
    const now = clock.elapsedTime
    const dt = Math.min(delta, 0.1)
    const go = (mode: Mode) => {
      s.mode = mode
      s.since = now
    }
    const t = now - s.since

    // The letter is simply back (the visitor left the hero, a re-measure): back at the post.
    if (fix.phase === 'idle' && (s.mode === 'alarm' || s.mode === 'run' || s.mode === 'pick' || s.mode === 'carry')) {
      Object.assign(s, { x: 0, z: 0, yaw: 0 })
      drive.moving = 0
      setActivity(null)
      go('post')
    }
    // Where the letter is, in the post's space.
    const letter = () => {
      p.worldToLocal(v.set(...fix.world))
      return { x: v.x, z: v.z }
    }
    const faceTo = (yaw: number | null) => {
      if (yaw === null) return
      let d = yaw - s.yaw
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      s.yaw += d * (1 - Math.exp(-12 * dt))
    }
    const walkTo = (to: { x: number; z: number }) => {
      const step = walkStep(s, to, dt)
      s.x = step.x
      s.z = step.z
      drive.walked += step.moved
      faceTo(step.yaw)
      return step.arrived
    }

    switch (s.mode) {
      case 'post':
        if (fix.phase === 'falling') {
          drive.cue = { move: 'surprised', emoji: '😱' }
          go('alarm')
        }
        break
      case 'alarm':
        if (t >= FIX.notice) {
          setActivity('idle')
          go('run')
        }
        break
      case 'run': {
        // Towards where the letter is now (it may still be sliding).
        s.to = standNear(s, letter())
        if (walkTo(s.to) && fix.phase === 'lying') go('pick')
        break
      }
      case 'pick': {
        const l = letter()
        faceTo(Math.atan2(l.x - s.x, l.z - s.z))
        if (t >= FIX.pick * 0.5 && fix.phase === 'lying') {
          fix.phase = 'carried'
          fix.since = now
          // Both hands up: carried over the head.
          setActivity('holding')
        }
        if (t >= FIX.pick) go('carry')
        break
      }
      case 'carry':
        if (walkTo({ x: 0, z: 0 })) {
          fix.phase = 'back'
          fix.since = now
          go('place')
        }
        break
      case 'place':
        faceTo(0)
        if (t >= 0.35) {
          setActivity(null)
          setLine(grumbles[s.said++ % grumbles.length]!)
          drive.cue = { move: 'shrug', emoji: '😤' }
          go('grumble')
        }
        break
      case 'grumble':
        faceTo(0)
        if (t >= FIX.grumble) {
          setLine(null)
          go('post')
        }
        break
    }

    const walking = s.mode === 'run' || s.mode === 'carry'
    drive.moving += ((walking ? 1 : 0) - drive.moving) * (1 - Math.exp(-10 * dt))
    const away = s.mode === 'run' || s.mode === 'pick' || s.mode === 'carry' || (s.mode === 'alarm' && t > FIX.notice * 0.6)
    fix.away += ((away ? 1 : 0) - fix.away) * (1 - Math.exp(-5 * dt))
    if (fix.away < 1e-3) fix.away = 0
    if (fix.phase === 'carried') {
      // Over the head, a little in front: in the post's space → world.
      const f = FIX.carryForward * scale
      v.set(s.x + Math.sin(s.yaw) * f, FIX.carryUp * scale, s.z + Math.cos(s.yaw) * f)
      p.localToWorld(v)
      fix.carry = [v.x, v.y, v.z]
    }
    w.position.set(s.x, 0, s.z)
    w.rotation.y = s.yaw
  })

  // At its post (its own pose, hands on the heading) whenever no other activity is set.
  return { on, drive: on ? drive : undefined, activity, line, atPost: activity === null }
}
