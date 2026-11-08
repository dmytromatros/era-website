import * as THREE from 'three'
import { QUALITY, useQuality } from './quality'

/**
 * Compile the programs of `proxies` (never-drawn meshes) ahead of time, as the real scene would
 * use them: with the real scene's lights and fog, into the same kind of target the composer
 * renders the world into (half-float, MSAA of the current level — some drivers specialise a
 * program per target format). `compileAsync` uses parallel shader compile where it exists, so
 * frames do not block; then, at an idle moment, the proxies are drawn once inside the real
 * scene into a 1×1 target (drivers may finish a program only at its first draw) and taken out.
 * Keep the proxies' materials alive afterwards so the programs stay cached.
 *
 * Shared by StylePrecompile (A2) and the X-ray mode (B4).
 */
export function warmPrograms(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  proxies: THREE.Scene,
  cancelled: () => boolean,
): Promise<void> {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: QUALITY[useQuality.getState().level].multisampling,
  })
  const intoTarget = (fn: () => void) => {
    const previous = gl.getRenderTarget()
    gl.setRenderTarget(target)
    fn()
    gl.setRenderTarget(previous)
  }
  let done!: Promise<unknown>
  intoTarget(() => (done = gl.compileAsync(proxies, camera, scene)))
  return done
    .then(
      () =>
        new Promise<void>((resolve) => {
          const warm = () => {
            if (!cancelled()) {
              const list = [...proxies.children]
              list.forEach((p) => {
                p.frustumCulled = false
                scene.add(p)
              })
              intoTarget(() => gl.render(scene, camera))
              list.forEach((p) => proxies.add(p))
            }
            resolve()
          }
          if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2000 })
          else warm()
        }),
    )
    .finally(() => target.dispose())
}
