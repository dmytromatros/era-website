'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PORTAL_TIMING } from '@/experience/portal'
import { live, useExperience } from '@/experience/store'
import { arcadeWeight, useArcade } from './arcade/arcadeState'
import { monitorWeight, useMonitor } from './monitor/monitorState'
import { accentAt, cameraFocus, dollyFov, dollyPosition } from './cinema'
import { ATTENTION, attention, attentionWeight, cameraStill, glanceZoom, STILL_AFTER } from './crowd/attention'
import { cutsceneNow } from './cutscene/cutsceneModel'
import { ZERO_KICK, entranceBreak, kickAt } from './firstPerson/breakModel'
import { cameraBody, crackFrame } from './firstPerson/crack'
import { glanceYaw } from './firstPerson/handsModel'
import { newWalk, stepWalk, walkNow } from './firstPerson/walkModel'
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
  // Walking (D2): the gait state and how much walking is allowed (smoothed).
  const walk = useMemo(() => ({ state: newWalk(), weight: 0, rail: new THREE.Vector3() }), [])
  // A glance at a gag (E2a, crowd/attention.ts): how much, smoothed so a gate closing mid-glance
  // (arriving at a key stop) eases it out instead of snapping back.
  const glance = useMemo(() => ({ weight: 0, at: new THREE.Vector3(), railLook: new THREE.Vector3() }), [])
  // ?debug=1: the walk's numbers for tuning (window.__eraWalk).
  useLayoutEffect(() => {
    if (new URLSearchParams(location.search).get('debug') !== '1') return
    const w = window as unknown as { __eraWalk?: unknown }
    w.__eraWalk = { state: walk.state, get now() { return walkNow.walk } }
    return () => void delete w.__eraWalk
  }, [walk])

  // New page: snap to the start (the hero must line up with the DOM).
  useLayoutEffect(() => {
    current.current.index = 0
    camera.fov = ENTRANCE_GEOMETRY.fov
    camera.updateProjectionMatrix()
    camera.position.set(...ENTRANCE_GEOMETRY.cameraStart)
    look.getPoint(0, current.current.lookAt)
    camera.lookAt(current.current.lookAt)
  }, [camera, look])

  useFrame(({ clock }, delta) => {
    // `live.progress` is already smoothed (world/Driver.tsx); a second smoothing here would
    // make the camera lag behind the elements and the film.
    const t = timeline(live.progress, timing.segments)
    const c = current.current
    c.index = t.railIndex

    const last = layout.rail.length - 1
    const u = Math.min(Math.max(c.index / last, 0), 1)
    rail.getPoint(u, tmpPos)
    look.getPoint(u, tmpLook)

    // The walk is measured on the rail itself (not the pointer parallax: moving the mouse at a
    // stop must not make the visitor step).
    walk.rail.copy(tmpPos)

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

    // A glance at a gag the visitor walks past (E2a): look over, zoom in, pull focus — and back.
    // Between stops only: never at a key stop (its frame and the magnet), in the entrance, the
    // cutscene or a portal. Time-based from the gag's start, like the crack (rules 1, 27).
    const { portal, arrivedVia } = useExperience.getState()
    const accent = accentAt(t.railIndex, timing.keyRail)
    // How far into a screen — the arcade's (E3) or the monitor's (E5); 0 = on the rail: no glance
    // meanwhile, no steps. One at a time (a click on either waits for the other to be idle).
    const arcW = arcadeWeight()
    const monW = arcW > 0 ? 0 : monitorWeight()
    const arc = arcW || monW
    const free =
      t.entrance >= 1 && portal.phase === 'idle' && arc === 0 && (cutsceneNow.phase === 'idle' || cutsceneNow.phase === 'done')
    // Standing or scrolling? (From the shown progress, rule 1.) Scrolling again mid-glance eases it out.
    if (Math.abs(live.progress - cameraStill.last) > 1e-5 || !Number.isFinite(cameraStill.last)) cameraStill.since = clock.elapsedTime
    cameraStill.last = live.progress
    cameraStill.still = clock.elapsedTime - cameraStill.since >= STILL_AFTER
    const want = free && cameraStill.still ? attentionWeight(clock.elapsedTime) * (1 - accent) : 0
    glance.weight += (want - glance.weight) * (1 - Math.exp(-Math.min(delta, 0.1) * 10))
    if (glance.weight < 1e-3) glance.weight = 0
    glance.railLook.copy(tmpLook)
    if (glance.weight > 0) {
      glance.at.set(...attention.at)
      tmpLook.lerp(glance.at, glance.weight * ATTENTION.look)
    }

    // The fov punch is NOT compensated: the world warps for a moment.
    const fov = dolly + kick.fov - glance.weight * glanceZoom
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

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

    // Flying into the arcade's screen (E3, arcade/arcadeState.ts) or the monitor's (E5,
    // monitor/monitorState.ts) and back: from wherever the rail has the camera to straight in
    // front of the screen (it fills the frame). The look turns to it first, the camera follows.
    // In real time from the click (like the portal, rule 1); the field of view stays (rule 27):
    // only the distance makes the screen fill the frame.
    const arcState = arcW > 0 ? useArcade.getState() : monW > 0 ? useMonitor.getState() : null
    if (arcState?.eye && arcState.look) {
      tmpTarget.set(...arcState.eye)
      tmpPos.lerp(tmpTarget, arc)
      tmpTarget.set(...arcState.look)
      tmpLook.lerp(tmpTarget, Math.min(1, arc * 1.35))
    }

    camera.position.copy(tmpPos)
    c.lookAt.copy(tmpLook)
    camera.lookAt(c.lookAt)

    // Walking (D2, walkModel.ts): steps from the distance walked along the rail, a run when fast,
    // a step onto each stair, a lean into turns. None during the entrance or a portal (faded).
    const allowed = THREE.MathUtils.smoothstep(t.entrance, 0.9, 1) * (portal.phase === 'idle' && arc === 0 ? 1 : 0)
    walk.weight += (allowed - walk.weight) * (1 - Math.exp(-Math.min(delta, 0.1) * 4))
    const w = stepWalk(walk.state, {
      position: [walk.rail.x, walk.rail.y, walk.rail.z],
      // The rail's own look (a glance turns the head, not the walk).
      look: [glance.railLook.x, glance.railLook.y, glance.railLook.z],
      dt: delta,
      flights: layout.architecture.flights,
      weight: walk.weight,
    })
    walkNow.walk = w
    if (w.moving > 0 || w.up !== 0) {
      camera.translateY(w.up)
      camera.translateX(w.side)
      camera.rotateX(w.pitch)
      camera.rotateZ(w.roll)
    }

    // The body (the hands hang on it) walks with the head; only the crack's kick is the head's.
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
    // Focus: on what the rail looks at — or, during a glance, pulled to the gag, with the
    // background blur on just for that moment (B3 blurs only at key stops otherwise).
    const railFocus = tmpPos.distanceTo(glance.railLook)
    cameraFocus.distance = glance.weight > 0 ? THREE.MathUtils.lerp(railFocus, tmpPos.distanceTo(glance.at), glance.weight) : railFocus
    cameraFocus.accent = Math.max(accent, glance.weight)
    // Into a screen: focus on it, the office behind blurs for the flight (a whoosh),
    // sharp again once there.
    if (arcState?.look) {
      tmpTarget.set(...arcState.look)
      cameraFocus.distance = THREE.MathUtils.lerp(cameraFocus.distance, tmpPos.distanceTo(tmpTarget), arc)
      cameraFocus.accent = Math.max(cameraFocus.accent * (1 - arc), Math.sin(Math.PI * arc) * 0.85)
    }
  })

  return null
}
