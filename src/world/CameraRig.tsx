'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PORTAL_TIMING } from '@/experience/portal'
import { live, useExperience } from '@/experience/store'
import { ENTRANCE_GEOMETRY, type WorldLayout } from './layout'
import type { Timing } from './route'
import { timeline } from './timeline'

const toVectors = (points: WorldLayout['rail']) => points.map((p) => new THREE.Vector3(...p))

/** Moves the camera along the rail according to scroll. */
/** How far behind the arrival door the camera starts when stepping out of a portal. */
const STEP_OUT = 1.8

export function CameraRig({ layout, timing, sceneKey }: { layout: WorldLayout; timing: Timing; sceneKey: string }) {
  const camera = useThree((s) => s.camera)
  const { rail, look } = useMemo(
    () => ({
      rail: new THREE.CatmullRomCurve3(toVectors(layout.rail), false, 'centripetal'),
      look: new THREE.CatmullRomCurve3(toVectors(layout.look), false, 'centripetal'),
    }),
    [layout],
  )
  const current = useRef({ index: 0, lookAt: new THREE.Vector3() })
  const tmpPos = useMemo(() => new THREE.Vector3(), [])
  const tmpLook = useMemo(() => new THREE.Vector3(), [])
  const tmpTarget = useMemo(() => new THREE.Vector3(), [])

  // New page: snap to the start (the hero must line up with the DOM).
  useLayoutEffect(() => {
    current.current.index = 0
    camera.position.set(...ENTRANCE_GEOMETRY.cameraStart)
    look.getPoint(0, current.current.lookAt)
    camera.lookAt(current.current.lookAt)
  }, [camera, look])

  useFrame(() => {
    // `live.progress` is already smoothed (world/Driver.tsx); a second smoothing here would
    // make the camera lag behind the elements and the film.
    const t = timeline(live.progress, timing.segments)
    const c = current.current
    c.index = t.railIndex

    const last = layout.rail.length - 1
    const u = Math.min(Math.max(c.index / last, 0), 1)
    rail.getPoint(u, tmpPos)
    look.getPoint(u, tmpLook)

    // Subtle pointer parallax, faded in after the entrance so the start stays pixel-exact.
    const parallax = THREE.MathUtils.smoothstep(t.entrance, 0.3, 1) * 0.25
    tmpPos.x += live.pointer.x * parallax
    tmpPos.y += live.pointer.y * parallax * 0.5

    const { portal, arrivedVia } = useExperience.getState()
    const age = performance.now() - portal.since

    // Diving into a door: pull the camera towards it and look straight in.
    if (portal.phase === 'diving' && portal.target) {
      const k = Math.min(age / PORTAL_TIMING.dive, 1)
      const ease = k * k * k
      tmpTarget.set(...portal.target)
      tmpPos.lerp(tmpTarget, ease * 0.85)
      tmpLook.lerp(tmpTarget, Math.min(k * 2, 1))
    }

    // Arrived through a portal: start behind the arrival door and step out through it, along
    // the way the camera looks (the door stands behind the first stop, see ArrivalDoor).
    if (arrivedVia === sceneKey && (portal.phase === 'covered' || portal.phase === 'revealing')) {
      const k = portal.phase === 'covered' ? 0 : Math.min(age / PORTAL_TIMING.reveal, 1)
      tmpTarget.subVectors(tmpLook, tmpPos).setY(0).normalize()
      tmpPos.addScaledVector(tmpTarget, -STEP_OUT * (1 - k) * (1 - k))
    }

    camera.position.copy(tmpPos)
    c.lookAt.copy(tmpLook)
    camera.lookAt(c.lookAt)
  })

  return null
}
