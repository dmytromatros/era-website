'use client'

import { useFrame, type RootState } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { live, useExperience } from '@/experience/store'
import { useQualitySettings } from './quality'
import { entranceAt, timeline, type Segment } from './timeline'
import { zoneOpacity, type RailRange } from './widgetZone'
import { glyphAt, glyphsFromBounds, KINETIC_MAX_GLYPHS, stepGlyphs, tap, writeMotion, type Glyph } from './kineticModel'
import { carryTo, FIX, knock, letterFix, resetFix, stepDrop } from './letterFix/letterModel'
import { coffeeTalk } from './coffee/coffeeModel'
import { cutsceneNow } from './cutscene/cutsceneModel'

/** What a kinetic text needs to know about the page (built in SceneContent). */
export interface KineticOptions {
  /** Rail range of the text's module: the letters only live while the camera is there. */
  zone: RailRange
  segments: Segment[]
  /**
   * Strain of the character holding this text up — `(clock + actorPhase) * rate` gives the
   * phase of its arms (see `holding` in activities.tsx); null = nobody holds it.
   */
  holder: { phase: number; rate: number } | null
  /**
   * E4: a click on a letter knocks it off (it falls to the floor at this world height, the holder
   * fetches it — letterFix). Off when nobody holds the heading or the holder has nothing to say.
   */
  knock?: { floorY: number }
}

/** A finger counts as a tap when it moved less than this (px) and lifted within TAP_MS. */
const TAP_PX = 10
const TAP_MS = 500

/**
 * Single-sided transparent text material (like useFrontTextMaterial) whose vertex shader moves
 * glyph number `gl_InstanceID` by a per-glyph offset and tilt. Injected after `<begin_vertex>`:
 * troika derives its text material from this one and runs this hook first, then rewrites
 * `position` to the glyph-placed quad — so `transformed` here is already the placed glyph.
 * The uniform arrays are ours and mutated in place (CLAUDE.md rule 6: own the uniforms).
 */
function createKineticMaterial() {
  const centers = new Float32Array(KINETIC_MAX_GLYPHS * 4)
  const motion = new Float32Array(KINETIC_MAX_GLYPHS * 4)
  const uniforms = {
    eraKineticCenter: { value: centers },
    eraKineticMotion: { value: motion },
  }
  const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide, transparent: true })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader =
      `uniform vec4 eraKineticCenter[${KINETIC_MAX_GLYPHS}];\nuniform vec4 eraKineticMotion[${KINETIC_MAX_GLYPHS}];\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (gl_InstanceID < ${KINETIC_MAX_GLYPHS}) {
          vec4 eraM = eraKineticMotion[gl_InstanceID];
          vec2 eraC = eraKineticCenter[gl_InstanceID].xy;
          vec2 eraP = transformed.xy - eraC;
          float eraS = sin(eraM.w);
          float eraK = cos(eraM.w);
          transformed.xy = eraC + vec2(eraK * eraP.x - eraS * eraP.y, eraS * eraP.x + eraK * eraP.y);
          transformed += eraM.xyz;
        }`,
      )
  }
  material.customProgramCacheKey = () => 'era-kinetic-text'
  return { material, centers, motion }
}

/**
 * Brings one troika text to life (task B1, see kineticModel.ts). Returns the material to give
 * the text and an `onSync` that must receive the troika mesh (drei <Text onSync>).
 */
export function useKineticText(options: KineticOptions, size: number) {
  const { material, centers, motion } = useMemo(() => createKineticMaterial(), [])
  useEffect(() => () => material.dispose(), [material])

  const { kineticText: enabled, letterKnock } = useQualitySettings()
  const glyphs = useRef<Glyph[]>([])
  const mesh = useRef<THREE.Mesh | null>(null)
  // Last pointer position (client px); null = no cursor over the page / no finger down.
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const pendingTap = useRef<{ x: number; y: number } | null>(null)
  // A mouse click (E4: it knocks a letter off; a tap on a phone does too, if it hits one).
  const pendingClick = useRef<{ x: number; y: number } | null>(null)
  const atRest = useRef(true)
  const scratch = useMemo(
    () => ({ ndc: new THREE.Vector2(), ray: new THREE.Raycaster(), plane: new THREE.Plane(), hit: new THREE.Vector3(), n: new THREE.Vector3() }),
    [],
  )

  useEffect(() => {
    let down: { x: number; y: number; t: number } | null = null
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || down) pointer.current = { x: e.clientX, y: e.clientY }
    }
    let mouseDown: { x: number; y: number; t: number } | null = null
    const press = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        mouseDown = { x: e.clientX, y: e.clientY, t: performance.now() }
        return
      }
      down = { x: e.clientX, y: e.clientY, t: performance.now() }
      pointer.current = { x: e.clientX, y: e.clientY }
    }
    const release = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        const md = mouseDown
        mouseDown = null
        // A click on the page's own UI over the heading (the header, the coffee's buttons) is not a knock.
        const ui = (e.target as Element | null)?.closest?.('button, a, input, textarea, select, [role="button"]')
        if (md && !ui && e.type === 'pointerup' && Math.hypot(e.clientX - md.x, e.clientY - md.y) < TAP_PX && performance.now() - md.t < TAP_MS) {
          pendingClick.current = { x: e.clientX, y: e.clientY }
        }
        return
      }
      const onUi = (e.target as Element | null)?.closest?.('button, a, input, textarea, select, [role="button"]')
      if (down && !onUi && e.type === 'pointerup') {
        const still = Math.hypot(e.clientX - down.x, e.clientY - down.y) < TAP_PX
        if (still && performance.now() - down.t < TAP_MS) pendingTap.current = { x: e.clientX, y: e.clientY }
      }
      down = null
      pointer.current = null
    }
    const leave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && !e.relatedTarget) pointer.current = null
    }
    const blur = () => {
      down = null
      pointer.current = null
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', press, { passive: true })
    window.addEventListener('pointerup', release, { passive: true })
    window.addEventListener('pointercancel', release, { passive: true })
    window.addEventListener('pointerout', leave, { passive: true })
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', press)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('pointerout', leave)
      window.removeEventListener('blur', blur)
    }
  }, [])

  /** Client px → the text's local plane (null if the ray misses it). */
  // Canvas rect from R3F's size (kept up to date by its resize observer) — no layout read per frame.
  const toLocal = (p: { x: number; y: number }, camera: THREE.Camera, rect: RootState['size'], m: THREE.Mesh) => {
    scratch.ndc.set(((p.x - rect.left) / rect.width) * 2 - 1, -((p.y - rect.top) / rect.height) * 2 + 1)
    scratch.ray.setFromCamera(scratch.ndc, camera)
    m.getWorldPosition(scratch.hit)
    scratch.n.set(0, 0, 1).transformDirection(m.matrixWorld)
    scratch.plane.setFromNormalAndCoplanarPoint(scratch.n, scratch.hit)
    if (!scratch.ray.ray.intersectPlane(scratch.plane, scratch.hit)) return null
    m.worldToLocal(scratch.hit)
    return { x: scratch.hit.x, y: scratch.hit.y }
  }

  const tmp = useMemo(() => ({ v: new THREE.Vector3(), s: new THREE.Vector3() }), [])

  /** Let go of a knocked-off letter: it springs back from where it is. */
  const release = (list: Glyph[]) => {
    const g = list[letterFix.glyph]
    if (g) g.held = false
    resetFix()
  }

  useFrame(({ camera, clock, size: rect }, delta) => {
    const m = mesh.current
    const list = glyphs.current
    if (!m || !list.length) return
    const e = Math.min(Math.max(entranceAt(live.progress), 0), 1)
    // 0 until the hero has landed after the handover (the swap shows the untouched heading),
    // and outside the module's zone.
    const weight =
      enabled && useExperience.getState().handedOver
        ? THREE.MathUtils.smoothstep(e, 0.85, 1) * zoneOpacity(timeline(live.progress, options.segments).railIndex, options.zone)
        : 0

    if (weight <= 0) {
      pendingTap.current = null
      pendingClick.current = null
      // Left the hero (or 2D again): a letter on the floor is simply back in place.
      if (options.knock && letterFix.phase !== 'idle') release(list)
      if (atRest.current) return
      // Left the zone: drop any motion so it does not resume mid-bounce later.
      for (const g of list) Object.assign(g, { ox: 0, oy: 0, oz: 0, a: 0, vx: 0, vy: 0, vz: 0, va: 0, kickAt: Infinity })
      writeMotion(list, centers, motion, 0, size, null)
      atRest.current = true
      return
    }

    const now = clock.elapsedTime
    const dt = Math.min(delta, 0.1)
    // World metres per text unit (falls are in metres).
    const scale = m.getWorldScale(tmp.s).x || 1
    // A click or a tap right on a letter knocks it off (E4), if none is off already.
    const knockAt = (p: { x: number; y: number }) => {
      if (!options.knock || !letterKnock || letterFix.phase !== 'idle') return false
      // Not while the entrance cutscene or the coffee plays (the visitor is answering her).
      if ((cutsceneNow.phase !== 'idle' && cutsceneNow.phase !== 'done') || coffeeTalk.on) return false
      const hit = toLocal(p, camera, rect, m)
      if (!hit) return false
      const i = glyphAt(list, hit.x, hit.y, size * 0.08)
      const g = list[i]
      if (!g) return false
      if (!knock(letterFix, i, g, hit.x < g.cx ? 1 : -1, scale, now)) return false
      g.held = true
      return true
    }
    if (pendingClick.current) {
      knockAt(pendingClick.current)
      pendingClick.current = null
    }
    if (pendingTap.current) {
      if (!knockAt(pendingTap.current)) {
        const hit = toLocal(pendingTap.current, camera, rect, m)
        const bounds = (m as THREE.Mesh & { textRenderInfo?: { blockBounds: number[] } }).textRenderInfo?.blockBounds
        const pad = size * 0.5
        if (hit && bounds && hit.x > bounds[0]! - pad && hit.x < bounds[2]! + pad && hit.y > bounds[1]! - pad && hit.y < bounds[3]! + pad) {
          tap(list, hit.x, size, now)
        }
      }
      pendingTap.current = null
    }
    // The knocked-off letter: falls, lies, is carried, goes back (letterModel.ts).
    const fix = letterFix
    const held = options.knock && fix.phase !== 'idle' ? list[fix.glyph] : undefined
    if (held) {
      if (fix.phase === 'back') {
        // Into its slot: from where it is, on its spring (a bounce as it snaps in).
        held.held = false
        Object.assign(held, { ox: fix.ox, oy: fix.oy, oz: fix.oz, a: fix.a, vx: 0, vy: 0, vz: 0, va: 0 })
        resetFix()
      } else {
        held.held = true // (a re-measure builds the glyphs anew)
        // The floor under the letter, in the text's space (an offset from the glyph's rest centre).
        m.localToWorld(tmp.v.set(held.cx, held.cy, 0))
        tmp.v.y = options.knock!.floorY
        m.worldToLocal(tmp.v)
        const floor = tmp.v.y - held.cy
        if (fix.phase === 'falling' || fix.phase === 'lying') stepDrop(fix, dt, now, floor, held.hw, held.hh, scale)
        else if (fix.phase === 'carried' && fix.carry) {
          m.worldToLocal(tmp.v.set(...fix.carry))
          carryTo(fix, { x: tmp.v.x - held.cx, y: tmp.v.y - held.cy, z: tmp.v.z }, dt)
        }
        Object.assign(held, { ox: fix.ox, oy: fix.oy, oz: fix.oz, a: fix.a })
        m.localToWorld(tmp.v.set(held.cx + fix.ox, held.cy + fix.oy, fix.oz))
        fix.world = [tmp.v.x, tmp.v.y, tmp.v.z]
      }
    }
    const local = pointer.current ? toLocal(pointer.current, camera, rect, m) : null
    stepGlyphs(list, { size, pointer: local }, now, dt)
    const { holder } = options
    // Nobody holding it (E4: the holder went to fetch a letter): no strain sway, it sags.
    const sag = options.knock ? fix.away : 0
    const phase = holder && sag < 0.5 ? (now + holder.phase) * holder.rate : null
    writeMotion(list, centers, motion, weight, size, phase, sag, now, FIX.sag, FIX.sagTilt)
    atRest.current = false
  })

  const onSync = (m: THREE.Mesh) => {
    mesh.current = m
    const info = (m as THREE.Mesh & { textRenderInfo?: { glyphBounds: Float32Array } }).textRenderInfo
    glyphs.current = info ? glyphsFromBounds(info.glyphBounds) : []
    // New layout (re-measure, theme, resize): start from rest, with the new pivots uploaded.
    writeMotion(glyphs.current, centers, motion, 0, size, null)
    atRest.current = true
  }

  return { material, onSync }
}
