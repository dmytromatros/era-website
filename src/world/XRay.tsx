'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useExperience } from '@/experience/store'
import { warmPrograms } from './precompile'
import { trianglesOf, useXRay, XRAY_BACKGROUND, XRAY_TEXT, xrayHue, xrayStats } from './xrayState'

/** Precompile the X-ray shader this long after the visitor is inside 3D (after the styles' 3 s). */
const PRECOMPILE_DELAY_MS = 5000

/**
 * Wireframe in the colour of its draw call. Instances of one instanced mesh share the colour
 * and differ only a little in brightness — "one colour = one draw call". Instance colours of
 * the original are ignored on purpose. No fog: the far lines of a blueprint stay visible.
 * Every X-ray material shares ONE program (same shader text, constant cache key; wireframe
 * is a draw mode, not a shader change). UI plates (`userData.xraySolid`, Slab.tsx) stay solid
 * in a dark shade of their colour, so the text on them reads over the lines behind.
 */
function makeXRayMaterial(color: THREE.Color, wireframe = true): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, wireframe, fog: false })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying float vXrayShade;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vXrayShade = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
        #else
          vXrayShade = 0.5;
        #endif`,
      )
    shader.fragmentShader =
      'varying float vXrayShade;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb = diffuse * (0.7 + 0.6 * vXrayShade);',
      )
  }
  m.customProgramCacheKey = () => 'era-xray'
  return m
}

type TextMesh = THREE.Mesh & { color: unknown }
const isText = (mesh: THREE.Mesh) =>
  !Array.isArray(mesh.material) && (mesh.material as { isTroikaTextMaterial?: boolean }).isTroikaTextMaterial === true

/**
 * The X-ray mode in the world (B4). While on, every frame: each mesh gets its X-ray material
 * (the original is remembered — and re-remembered if React swaps it meanwhile, so meshes that
 * appear later, e.g. after a portal, are caught too), troika texts turn light so they read on
 * the blueprint (they cannot take another material: their shader places the glyphs), and the
 * background turns blueprint blue. Off: everything is put back as it was. Costs nothing off.
 */
export function XRay() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const on = useXRay((s) => s.on)
  const background = useMemo(() => new THREE.Color(XRAY_BACKGROUND), [])
  const state = useMemo(
    () => ({
      materials: new Map<THREE.Mesh, THREE.MeshBasicMaterial>(),
      saved: new Map<THREE.Mesh, THREE.Material | THREE.Material[]>(),
      texts: new Map<TextMesh, unknown>(),
      background: null as THREE.Scene['background'],
      next: 0,
    }),
    [],
  )

  const materialFor = (mesh: THREE.Mesh) => {
    let m = state.materials.get(mesh)
    if (!m) {
      const { h, s, l } = xrayHue(state.next++)
      const solid = mesh.userData.xraySolid === true
      m = makeXRayMaterial(new THREE.Color().setHSL(h, solid ? 0.5 : s, solid ? 0.1 : l), !solid)
      state.materials.set(mesh, m)
    }
    return m
  }

  useFrame(() => {
    if (!on) return
    if (scene.background !== background) {
      state.background = scene.background
      scene.background = background
    }
    let meshes = 0
    let instancedMeshes = 0
    let instances = 0
    let triangles = 0
    scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      meshes++
      const g = mesh.geometry as THREE.BufferGeometry & { instanceCount?: number }
      const copies = (mesh as THREE.InstancedMesh).isInstancedMesh
        ? (mesh as THREE.InstancedMesh).count
        : Number.isFinite(g.instanceCount) ? g.instanceCount! : 1 // troika glyphs: one quad per instance
      triangles += trianglesOf(g.index?.count ?? null, g.attributes.position?.count ?? 0, copies)
      if (isText(mesh)) {
        const text = mesh as TextMesh
        if (text.color !== XRAY_TEXT) {
          state.texts.set(text, text.color)
          text.color = XRAY_TEXT
        }
        return
      }
      const instanced = mesh as THREE.InstancedMesh
      if (instanced.isInstancedMesh) {
        instancedMeshes++
        instances += instanced.count
      }
      const x = materialFor(mesh)
      if (mesh.material !== x) {
        state.saved.set(mesh, mesh.material)
        mesh.material = x
      }
    })
    xrayStats.meshes = meshes
    xrayStats.instancedMeshes = instancedMeshes
    xrayStats.instances = instances
    xrayStats.triangles = triangles
  })

  // Off (and on unmount): put everything back and drop the X-ray materials (their program stays
  // cached by the precompile proxies, so the next switch is instant again).
  useEffect(() => {
    if (!on) return
    return () => {
      for (const [mesh, original] of state.saved) if (mesh.material === state.materials.get(mesh)) mesh.material = original
      state.saved.clear()
      for (const [text, color] of state.texts) if (text.color === XRAY_TEXT) text.color = color
      state.texts.clear()
      if (scene.background === background) scene.background = state.background
      state.materials.forEach((m) => m.dispose())
      state.materials.clear()
      state.next = 0
    }
  }, [on, scene, background, state])

  // Compile the X-ray program ahead (plain, instanced, instanced with colours), so the first
  // switch does not hitch — once the visitor is inside 3D and the browser is idle.
  const [inside, setInside] = useState(false)
  useEffect(() => useExperience.subscribe((s) => s.handedOver && setInside(true)), [])
  useEffect(() => {
    if (!inside) return
    let cancelled = false
    const material = makeXRayMaterial(new THREE.Color())
    const geometry = new THREE.BoxGeometry()
    const proxies = new THREE.Scene()
    const colored = new THREE.InstancedMesh(geometry, material, 1)
    colored.setColorAt(0, new THREE.Color())
    proxies.add(new THREE.Mesh(geometry, material), new THREE.InstancedMesh(geometry, material, 1), colored)
    const timer = setTimeout(() => {
      const run = () => {
        if (!cancelled) void warmPrograms(gl, scene, camera, proxies, () => cancelled)
      }
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 })
      else run()
    }, PRECOMPILE_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      material.dispose()
      geometry.dispose()
    }
  }, [inside, gl, scene, camera])

  return null
}
