'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Theme } from '@/theme/tokens'
import { useTheme } from '@/theme/store'
import type { Box } from './layout'
import type { Mat, Office as OfficeData, Prim } from './officeModel'

const BOX = new THREE.BoxGeometry(1, 1, 1)
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16)
// Low-poly balls (foliage) match the blocky characters.
const BALL = new THREE.IcosahedronGeometry(0.5, 1)

const tmp = new THREE.Object3D()
const color = new THREE.Color()

function matColor(theme: Theme, mat: Mat, accent?: string): string {
  const o = theme.world.office
  if (mat === 'wall') return theme.world.wall
  // the page's accent tints the soft furnishings, so each office has its own character
  if (accent && (mat === 'fabricA' || mat === 'fabricB')) {
    return '#' + color.set(o[mat]).lerp(new THREE.Color(accent), mat === 'fabricA' ? 0.7 : 0.35).getHexString()
  }
  return o[mat]
}

/** One instanced mesh for a list of primitives / boxes (same geometry, one draw call). */
function Instanced({
  items,
  geometry,
  material,
  colorOf,
  yawSign,
}: {
  items: (Prim | Box)[]
  geometry: THREE.BufferGeometry
  material: THREE.Material
  colorOf?: (i: number) => string
  /** Prims carry a three.js yaw (+1); layout Boxes carry a route heading (−1). */
  yawSign: 1 | -1
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((it, i) => {
      tmp.position.set(...it.center)
      tmp.rotation.set(0, yawSign * it.yaw, 0)
      tmp.scale.set(...it.size)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
      if (colorOf) mesh.setColorAt(i, color.set(colorOf(i)))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items, colorOf, yawSign])

  if (!items.length) return null
  // `key` on count: an InstancedMesh cannot grow, so a different count needs a new one.
  return <instancedMesh key={items.length} ref={ref} args={[geometry, material, items.length]} frustumCulled={false} />
}

/**
 * Draws the whole office (see office.ts) with a handful of instanced meshes: solid boxes,
 * cylinders and balls (per-instance colours from the theme), glass, frosted glass, ceiling
 * lights, windows, and the ceiling plane.
 */
export function Office({ data, accent }: { data: OfficeData; accent?: string }) {
  const theme = useTheme()
  const o = theme.world.office

  const groups = useMemo(
    () => ({
      box: data.solid.filter((p) => p.shape === 'box'),
      cyl: data.solid.filter((p) => p.shape === 'cyl'),
      ball: data.solid.filter((p) => p.shape === 'ball'),
    }),
    [data],
  )

  const materials = useMemo(() => {
    const solid = new THREE.MeshStandardMaterial({ roughness: 0.85 })
    return {
      solid,
      glass: new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.1 }),
      frosted: new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.6 }),
      light: new THREE.MeshBasicMaterial(),
      window: new THREE.MeshBasicMaterial(),
      ceiling: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.95 }),
    }
  }, [])
  useLayoutEffect(() => {
    materials.glass.color.set(o.glass)
    materials.glass.opacity = o.glassOpacity
    materials.frosted.color.set(o.frosted)
    materials.frosted.opacity = o.frostedOpacity
    materials.light.color.set(o.light)
    materials.window.color.set(o.window)
    materials.ceiling.color.set(o.ceiling)
  }, [materials, o])
  useLayoutEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  const colorBox = useMemo(() => (i: number) => matColor(theme, groups.box[i]!.mat, accent), [theme, groups, accent])
  const colorCyl = useMemo(() => (i: number) => matColor(theme, groups.cyl[i]!.mat, accent), [theme, groups, accent])
  const colorBall = useMemo(() => (i: number) => matColor(theme, groups.ball[i]!.mat, accent), [theme, groups, accent])

  return (
    <group>
      <Instanced items={groups.box} geometry={BOX} material={materials.solid} colorOf={colorBox} yawSign={1} />
      <Instanced items={groups.cyl} geometry={CYL} material={materials.solid} colorOf={colorCyl} yawSign={1} />
      <Instanced items={groups.ball} geometry={BALL} material={materials.solid} colorOf={colorBall} yawSign={1} />
      <Instanced items={data.frosted} geometry={BOX} material={materials.frosted} yawSign={-1} />
      <Instanced items={data.glass} geometry={BOX} material={materials.glass} yawSign={-1} />
      <Instanced items={data.lights} geometry={BOX} material={materials.light} yawSign={-1} />
      <Instanced items={data.windows} geometry={BOX} material={materials.window} yawSign={-1} />
      <mesh position={data.ceiling.center} rotation-x={Math.PI / 2} material={materials.ceiling}>
        <planeGeometry args={data.ceiling.size} />
      </mesh>
    </group>
  )
}
