'use client'

import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { useExperience } from '@/experience/store'
import { warmPrograms } from './precompile'
import { STYLE, SWITCHABLE } from './style'
import { applyToon, type ToonVariant } from './toonMaterial'

/** Start after the visitor is inside 3D and things settled. */
const DELAY_MS = 3000

/**
 * Makes the Comic ↔ Pastel switch instant (wow-plan A2). Switching style changes every toon
 * material's shader; compiled on the spot, that is a visible hitch (measured headless: a
 * 564 ms frame on the first switch, idle worst 113 ms). So, once the browser is idle after the
 * handover, this compiles every switchable style ahead of time:
 *
 * - one invisible proxy per distinct kind of toon material in the scene (instanced or not,
 *   instance colours, side, transparency, …) and per style, in a scene that is never drawn;
 * - compiled with the real scene's lights and fog, into an off-screen target (the composer
 *   renders the world into one — the shader differs from rendering to the screen);
 * - `compileAsync` uses the browser's parallel shader compile where it exists, so this does
 *   not block frames; then the proxies are drawn once into a 1×1 target (drivers may finish a
 *   program only at its first draw);
 * - the proxies are kept (not disposed) so their programs stay cached; a real material
 *   switching style then finds its program ready.
 */
export function StylePrecompile() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  // Once per page (scene key): the first time the visitor is inside its 3D. Not undone when
  // they scroll back to the 2D hero — only when the page (or the canvas) goes away.
  const [ready, setReady] = useState<string | null>(null)
  useEffect(
    () =>
      useExperience.subscribe((s) => {
        const key = s.scene?.key
        if (s.handedOver && key) setReady((prev) => (prev === key ? prev : key))
      }),
    [],
  )

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const proxies = new THREE.Scene()
    const materials: THREE.Material[] = []

    const run = () => {
      if (cancelled) return
      const seen = new Set<string>()
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh | THREE.InstancedMesh
        const m = mesh.material as THREE.MeshStandardMaterial | undefined
        if (!m || Array.isArray(m) || !m.userData?.eraToon) return
        const variant = m.userData.eraToon as ToonVariant
        const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh === true
        const colored = instanced && !!(mesh as THREE.InstancedMesh).instanceColor
        const sig = [variant, instanced, colored, m.side, m.transparent, m.vertexColors, !!m.map, m.alphaTest > 0].join('|')
        if (seen.has(sig)) return
        seen.add(sig)
        for (const name of SWITCHABLE) {
          const clone = m.clone()
          applyToon(clone, STYLE[name], variant)
          materials.push(clone)
          const proxy = instanced ? new THREE.InstancedMesh(mesh.geometry, clone, 1) : new THREE.Mesh(mesh.geometry, clone)
          if (colored) (proxy as THREE.InstancedMesh).setColorAt(0, new THREE.Color())
          proxies.add(proxy)
        }
      })
      void warmPrograms(gl, scene, camera, proxies, () => cancelled)
    }

    const timer = setTimeout(() => {
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 })
      else run()
    }, DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      materials.forEach((m) => m.dispose())
    }
  }, [ready, gl, scene, camera])

  return null
}
