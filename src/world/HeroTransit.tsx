'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { ElementSpec } from '@/experience/measure'
import { live, useExperience } from '@/experience/store'
import { ElementView, textKeys } from './ElementView'
import { toWorld, type Vec3 } from './exhibitModel'
import { ENTRANCE_GEOMETRY } from './layout'
import { ENTRANCE } from './timeline'

const { cameraStart, heroDistance } = ENTRANCE_GEOMETRY
const PLANE_Z = cameraStart[2] - heroDistance

export interface TransitItem {
  spec: ElementSpec
  /** Where the element ends up (its spot in a hero exhibit). */
  target: { local: Vec3; anchor: Vec3; yaw: number }
}

type Fadeable = { fillOpacity?: number; material?: THREE.Material | THREE.Material[] }

function setOpacity(obj: THREE.Object3D, value: number) {
  obj.traverse((o) => {
    const f = o as THREE.Object3D & Fadeable
    if (typeof f.fillOpacity === 'number') f.fillOpacity = value
    else if (f.material && !Array.isArray(f.material)) f.material.opacity = value
  })
}

/**
 * The hero's elements in 3D. At scroll 0 each one sits exactly over its DOM twin (so the swap
 * is invisible); as the visitor enters, each flies to its own spot in the world.
 */
export function HeroTransit({
  items,
  k,
  viewport,
  sceneKey,
}: {
  items: TransitItem[]
  k: number
  viewport: { width: number; height: number }
  sceneKey: string
}) {
  const group = useRef<THREE.Group>(null)
  const synced = useRef(new Set<string>())

  const poses = useMemo(
    () =>
      items.map(({ spec, target }) => {
        const cx = spec.x + spec.width / 2 - viewport.width / 2
        const cy = spec.y + spec.height / 2 - viewport.height / 2
        return {
          from: new THREE.Vector3(cx * k, cameraStart[1] - cy * k, PLANE_Z),
          to: new THREE.Vector3(...toWorld(target.local, target.anchor, target.yaw)),
          yaw: target.yaw,
          // A little arc, different per element, so they do not all move in lockstep.
          lift: 0.4 + ((spec.y + spec.x) % 7) * 0.12,
          // Elements above the screen centre tip back, those below tip forward, as they peel off.
          tilt: cy < 0 ? -1 : 1,
        }
      }),
    [items, k, viewport],
  )

  // Ready = every text has its glyphs built (otherwise the swap would flash empty).
  const expected = useMemo(() => items.flatMap((i) => textKeys(i.spec)), [items])
  const check = () => {
    if (expected.length && expected.every((key) => synced.current.has(key))) {
      useExperience.getState().markCanvasReady(sceneKey)
    }
  }
  // after a re-measure the same texts may already be ready
  useEffect(check)
  const onSync = (key: string) => {
    synced.current.add(key)
    check()
  }

  useFrame(() => {
    const g = group.current
    if (!g) return
    const handedOver = useExperience.getState().handedOver
    const e = Math.min(Math.max(live.progress / ENTRANCE, 0), 1)
    // 1. Peel (e 0 → 0.25): each element lifts off the page towards the viewer and tips a
    //    little, while the film behind it bulges and tears — the moment it visibly becomes 3D.
    const peel = THREE.MathUtils.smoothstep(e, 0, 0.2)
    // 2. Travel (e 0.3 → 0.85): only once the tear covers the whole screen (Membrane opens by
    //    e ≈ 0.4) — otherwise elements would dive behind the film and blink out. Eased in and
    //    out, and well ahead of the camera.
    const travel = THREE.MathUtils.smootherstep(e, 0.3, 0.85)
    const hold = peel * (1 - travel) // the peel fades out as the element settles
    g.children.forEach((child, i) => {
      const p = poses[i]
      if (!p) return
      child.position.lerpVectors(p.from, p.to, travel)
      child.position.y += Math.sin(Math.PI * travel) * p.lift
      child.position.z += hold * 0.9
      child.rotation.set(p.tilt * hold * 0.22, p.yaw * travel, p.tilt * hold * 0.04)
      setOpacity(child, handedOver ? 1 : 0)
    })
  })

  return (
    <group ref={group}>
      {items.map(({ spec }, i) => (
        <group key={spec.id} position={poses[i]!.from}>
          <ElementView spec={spec} k={k} onSync={onSync} />
        </group>
      ))}
    </group>
  )
}
