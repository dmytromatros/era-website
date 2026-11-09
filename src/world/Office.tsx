'use client'

import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useExperience } from '@/experience/store'
import * as THREE from 'three'
import type { Theme } from '@/theme/tokens'
import { useTheme, useThemeStore } from '@/theme/store'
import type { Box } from './layout'
import type { Chair, Mat, Office as OfficeData, Prim } from './officeModel'
import { kickSpin, spin, stepSpin, type Spin } from './physics/chairSpin'
import { useQualitySettings } from './quality'
import { createScreenMaterial } from './screenMaterial'
import { useStylePreset } from './style'
import { applyToon, liveTime } from './toonMaterial'

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
 * Swivel chair seats (C2): one instanced mesh for all of them; a click spins a seat around its
 * stem (chairSpin.ts). Only spinning chairs are updated — a still office costs nothing.
 */
function Chairs({
  chairs,
  material,
  colorOf,
  interactive,
}: {
  chairs: Chair[]
  material: THREE.Material
  colorOf: (p: Prim) => string
  interactive: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const items = useMemo(() => chairs.flatMap((c, ci) => c.prims.map((p) => ({ p, ci }))), [chairs])
  const first = useMemo(() => {
    const out: number[] = []
    let n = 0
    for (const c of chairs) {
      out.push(n)
      n += c.prims.length
    }
    return out
  }, [chairs])
  const spins = useRef(new Map<number, Spin>())

  const place = (mesh: THREE.InstancedMesh, ci: number, angle: number) => {
    const c = chairs[ci]!
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    c.prims.forEach((p, k) => {
      // rotate the prim's offset from the stem by `angle` around y (three.js convention)
      const dx = p.center[0] - c.pivot[0]
      const dz = p.center[2] - c.pivot[2]
      tmp.position.set(c.pivot[0] + dx * cos + dz * sin, p.center[1], c.pivot[2] - dx * sin + dz * cos)
      tmp.rotation.set(0, p.yaw + angle, 0)
      tmp.scale.set(...p.size)
      tmp.updateMatrix()
      mesh.setMatrixAt(first[ci]! + k, tmp.matrix)
    })
  }

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    chairs.forEach((_, ci) => place(mesh, ci, 0))
    items.forEach(({ p }, i) => mesh.setColorAt(i, color.set(colorOf(p))))
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `place` only reads `chairs` / `first`
  }, [chairs, items, first, colorOf])

  useFrame((_, delta) => {
    const mesh = ref.current
    if (!mesh || !spins.current.size) return
    for (const [ci, s] of spins.current) {
      const moving = stepSpin(s, delta)
      place(mesh, ci, s.angle)
      if (!moving) spins.current.delete(ci)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || !useExperience.getState().handedOver || e.instanceId === undefined) return
    e.stopPropagation()
    const ci = items[e.instanceId]!.ci
    const c = chairs[ci]!
    // Which way it turns: the side of the stem that was hit, seen along the click.
    const ox = e.point.x - c.pivot[0]
    const oz = e.point.z - c.pivot[2]
    const dx = e.point.x - e.camera.position.x
    const dz = e.point.z - e.camera.position.z
    const torque = (ox * dz - oz * dx) / (Math.hypot(dx, dz) || 1)
    const s = spins.current.get(ci) ?? spin()
    kickSpin(s, Math.max(-1, Math.min(1, torque / 0.3)))
    spins.current.set(ci, s)
  }

  if (!items.length) return null
  return (
    <instancedMesh
      key={items.length}
      ref={ref}
      args={[BOX, material, items.length]}
      frustumCulled={false}
      onClick={interactive ? onClick : undefined}
      onPointerOver={
        interactive ? () => useExperience.getState().handedOver && (document.body.style.cursor = 'pointer') : undefined
      }
      onPointerOut={interactive ? () => (document.body.style.cursor = '') : undefined}
    />
  )
}

/**
 * Draws the whole office (see office.ts) with a handful of instanced meshes: solid boxes,
 * cylinders and balls (per-instance colours from the theme), glass, frosted glass, ceiling
 * lights, windows, and the ceiling plane.
 */
export function Office({
  data,
  accent,
  tickTime = true,
}: {
  data: OfficeData
  accent?: string
  /**
   * Whether this office advances the shared `liveTime`. Only the page's own office does: the
   * offices seen through the portal doors (B2) would otherwise speed the plants and screens up.
   */
  tickTime?: boolean
}) {
  const baseTheme = useTheme()
  const preset = useStylePreset()
  const themeName = useThemeStore((s) => s.name)
  // The style's office palette for the current theme (A4).
  const theme = useMemo<Theme>(() => {
    const palette = themeName === 'dark' ? preset.paletteDark : preset.palette
    return palette ? { ...baseTheme, world: { ...baseTheme.world, office: { ...baseTheme.world.office, ...palette } } } : baseTheme
  }, [baseTheme, preset, themeName])
  const o = theme.world.office

  const groups = useMemo(
    () => ({
      // Screens and foliage get their own instanced meshes: code scrolls on the screens and
      // the plants sway (A5) — one extra draw call each.
      box: data.solid.filter((p) => p.shape === 'box' && p.mat !== 'screen'),
      screen: data.solid.filter((p) => p.shape === 'box' && p.mat === 'screen'),
      cyl: data.solid.filter((p) => p.shape === 'cyl'),
      ball: data.solid.filter((p) => p.shape === 'ball' && p.mat !== 'plant' && p.mat !== 'plantDark'),
      foliage: data.solid.filter((p) => p.shape === 'ball' && (p.mat === 'plant' || p.mat === 'plantDark')),
    }),
    [data],
  )

  const materials = useMemo(() => {
    const solid = new THREE.MeshStandardMaterial({ roughness: 0.85 })
    return {
      solid,
      plant: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      screen: createScreenMaterial(),
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
  // Cartoon light response for the opaque office surfaces (wow-plan A2; glass stays as is).
  useLayoutEffect(() => {
    applyToon(materials.solid, preset)
    applyToon(materials.plant, preset, 'plant')
    applyToon(materials.ceiling, preset, 'ceiling')
  }, [materials, preset])
  useLayoutEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  const colorBox = useMemo(() => (i: number) => matColor(theme, groups.box[i]!.mat, accent), [theme, groups, accent])
  const colorCyl = useMemo(() => (i: number) => matColor(theme, groups.cyl[i]!.mat, accent), [theme, groups, accent])
  const colorBall = useMemo(() => (i: number) => matColor(theme, groups.ball[i]!.mat, accent), [theme, groups, accent])
  const colorScreen = useMemo(() => (i: number) => matColor(theme, groups.screen[i]!.mat, accent), [theme, groups, accent])
  const colorFoliage = useMemo(() => (i: number) => matColor(theme, groups.foliage[i]!.mat, accent), [theme, groups, accent])
  const colorChair = useMemo(() => (p: Prim) => matColor(theme, p.mat, accent), [theme, accent])

  // Living details move only on quality levels that allow it (on `low` they hold still).
  const { liveDetails } = useQualitySettings()
  useFrame((_, delta) => {
    if (liveDetails && tickTime) liveTime.value += Math.min(delta, 0.1)
  })

  return (
    <group>
      <Instanced items={groups.box} geometry={BOX} material={materials.solid} colorOf={colorBox} yawSign={1} />
      <Instanced items={groups.cyl} geometry={CYL} material={materials.solid} colorOf={colorCyl} yawSign={1} />
      <Instanced items={groups.ball} geometry={BALL} material={materials.solid} colorOf={colorBall} yawSign={1} />
      <Instanced items={groups.foliage} geometry={BALL} material={materials.plant} colorOf={colorFoliage} yawSign={1} />
      <Instanced items={groups.screen} geometry={BOX} material={materials.screen} colorOf={colorScreen} yawSign={1} />
      {/* Swivel seats: they spin when clicked — only in the page's own office, not behind portal doors. */}
      <Chairs chairs={data.chairs} material={materials.solid} colorOf={colorChair} interactive={tickTime} />
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
