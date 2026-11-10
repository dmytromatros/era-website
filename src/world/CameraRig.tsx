'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PORTAL_TIMING } from '@/experience/portal'
import { live, useExperience } from '@/experience/store'
import { accentAt, cameraFocus, dollyFov, dollyPosition } from './cinema'
import { ZERO_KICK, entranceBreak, kickAt } from './firstPerson/breakModel'
import { cameraBody, crackFrame } from './firstPerson/crack'
import { glanceYaw } from './firstPerson/handsModel'
import { ENTRANCE_GEOMETRY, type WorldLayout } from './layout'
import type { Timing } from './route'
import { timeline } from './timeline'

const toVectors = (points: WorldLayout['rail']) => points.map((p) => new THREE.Vector3(...p))

/** Moves the camera along the rail according to scroll. */
/** How far behind the arrival door the camera starts when stepping out of a portal. */
const STEP_OUT = 1.8

export function CameraRig({ layout, timing, sceneKey }: { layout: WorldLayout; timing: Timing; sceneKey: string }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
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
    camera.fov = ENTRANCE_GEOMETRY.fov
    camera.updateProjectionMatrix()
    camera.position.set(...ENTRANCE_GEOMETRY.cameraStart)
    look.getPoint(0, current.current.lookAt)
    camera.lookAt(current.current.lookAt)
  }, [camera, look])

  useFrame(({ clock }) => {
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

    // Dolly zoom on the way in (B3, cinema.ts): wider view, camera closer to the first stop by
    // as much as keeps it the same size. Exactly the normal fov at the top and after entering.
    const target = layout.stations[0]?.focus
    // The crack (D1, breakModel.ts): the film gives way, the visitor falls through, stumbles and
    // looks at their hands — on top of the rail, in real time from that moment, exactly zero
    // again BREAK.settle later. The confused look fades if they scroll on; all of it while
    // scrolling back to the top.
    const cf = crackFrame(clock.elapsedTime, size.width / size.height)
    const aspect = size.width / size.height
    const kick = kickAt(cf.since, entranceBreak.side, cf.look, cf.heal, glanceYaw({ aspect, fov: ENTRANCE_GEOMETRY.fov }))
    const dolly = target ? dollyFov(t.entrance) : ENTRANCE_GEOMETRY.fov
    if (target && dolly !== ENTRANCE_GEOMETRY.fov) tmpPos.set(...dollyPosition([tmpPos.x, tmpPos.y, tmpPos.z], target, dolly))
    // The fov punch is NOT compensated: the world warps for a moment.
    const fov = dolly + kick.fov
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

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
    // The body (the hands hang on it) stays on the rail; only the head is kicked.
    camera.updateMatrixWorld()
    cameraBody.copy(camera.matrixWorld)
    if (kick !== ZERO_KICK) {
      camera.translateZ(-kick.forward)
      camera.translateY(-kick.down)
      camera.translateX(kick.side)
      camera.rotateY(kick.yaw)
      camera.rotateX(kick.pitch)
      camera.rotateZ(kick.roll)
    }
    cameraFocus.distance = tmpPos.distanceTo(tmpLook)
    cameraFocus.accent = accentAt(t.railIndex, timing.keyRail)
  })

  return null
}
