'use client'

import { Text } from '@react-three/drei'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import type { Page } from '@/content/schema'
import { useTheme } from '@/theme/store'
import { FONT_BOLD, FONT_MEDIUM } from '@/theme/typography'
import { Floor } from './Floor'
import { Office } from './Office'
import { buildPreview, type PreviewModel } from './portalPreviewModel'
import { useQualitySettings } from './quality'
import { useStylePreset } from './style'
import { useFrontTextMaterial } from './textMaterial'
import { useXRay } from './xrayState'

/** Hero heading size in the preview (metres): small enough that a line fits the door opening. */
const HEADING_SIZE = 0.4

/** The other page's world: its lights, floor, office and hero heading. */
function PreviewWorld({ model }: { model: PreviewModel }) {
  const { world } = useTheme()
  const text = useFrontTextMaterial()
  const { hero } = model
  return (
    <>
      <hemisphereLight args={[world.hemiSky, world.hemiGround, world.hemiIntensity]} />
      <directionalLight position={[6, 12, 8]} color={world.sun} intensity={world.sunIntensity} />
      <Floor />
      <Office data={model.office} accent={model.accent} tickTime={false} />
      {hero && (
        <group position={hero.anchor} rotation-y={hero.yaw}>
          {hero.eyebrow && (
            <Text
              material={text}
              font={FONT_MEDIUM}
              fontSize={HEADING_SIZE * 0.3}
              anchorX="center"
              anchorY="bottom"
              color={world.sign}
              position={[0, hero.up + HEADING_SIZE * hero.lines.length * 0.55 + 0.1, 0]}
            >
              {hero.eyebrow.toUpperCase()}
            </Text>
          )}
          <Text
            material={text}
            font={FONT_BOLD}
            fontSize={HEADING_SIZE}
            lineHeight={1}
            letterSpacing={-0.02}
            anchorX="center"
            anchorY="middle"
            textAlign="center"
            color={world.sign}
            position={[0, hero.up, 0]}
          >
            {hero.lines.join('\n')}
          </Text>
        </group>
      )}
    </>
  )
}

/**
 * Live view of another page through a portal door (task B2). The page's world (portalPreviewModel)
 * lives in a scene of its own, placed behind the door, and is drawn with the REAL camera into a
 * texture; the door surface shows that texture at screen coordinates — so it moves with the
 * camera like a window into another room (true parallax).
 *
 * Cheap on purpose:
 * - drawn only while the hall is near (`near()`), the door is in view and X-ray is off;
 * - redrawn only when the camera moved since the last time (or the theme / style / size
 *   changed) — standing at the hall on a phone costs nothing;
 * - at a fraction of the screen resolution, and on `low` at most ~10 times a second
 *   (QUALITY.portalScale / portalMaxFps);
 * - same materials and lights as the real office, so no new shader programs.
 *
 * `frame` is the door's group (door space: +z towards the visitor, surface in z = 0).
 * Returns the texture (null until the first draw), and the portal node to render.
 */
export function usePortalPreview({
  page,
  sceneKey,
  frame,
  surface,
  near,
  look,
}: {
  page: Page | undefined
  sceneKey: string
  frame: RefObject<THREE.Group | null>
  surface: RefObject<THREE.Mesh | null>
  near: () => boolean
  /** Door-space direction (x, z) the visitor looks through the door from the hall. */
  look: [number, number]
}): { texture: RefObject<THREE.Texture | null>; node: ReactNode } {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const theme = useTheme()
  const preset = useStylePreset()
  const { portalScale, portalMaxFps } = useQualitySettings()
  const scene = useMemo(() => new THREE.Scene(), [])
  const root = useRef<THREE.Group>(null)
  const texture = useRef<THREE.Texture | null>(null)
  const model = useMemo(
    () => (page ? buildPreview(page, sceneKey, size.width / size.height, look) : null),
    [page, sceneKey, size.width, size.height, look],
  )

  const target = useMemo(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }), [])
  useEffect(() => () => target.dispose(), [target])
  const state = useMemo(
    () => ({
      dirty: true,
      at: -Infinity,
      camera: new THREE.Matrix4(),
      projection: new THREE.Matrix4(),
      frustum: new THREE.Frustum(),
      clip: new THREE.Matrix4(),
      sphere: new THREE.Sphere(new THREE.Vector3(), 1.8),
    }),
    [],
  )

  // Resolution: a fraction of the drawing buffer. Any change → draw again.
  useEffect(() => {
    if (portalScale <= 0) return
    const w = Math.max(1, Math.round(size.width * dpr * portalScale))
    const h = Math.max(1, Math.round(size.height * dpr * portalScale))
    target.setSize(w, h)
    state.dirty = true
  }, [target, size, dpr, portalScale, state])

  // The other office's air: background and fog of the theme.
  useEffect(() => {
    scene.background = new THREE.Color(theme.world.background)
    scene.fog = new THREE.Fog(theme.world.background, theme.world.fogNear, theme.world.fogFar)
    state.dirty = true
  }, [scene, theme, state])
  useEffect(() => {
    state.dirty = true
  }, [preset, model, state])

  useFrame(({ camera, clock }) => {
    const door = frame.current
    const plane = surface.current
    if (!model || !door || !plane || !root.current || portalScale <= 0) return
    if (useXRay.getState().on || !near()) return

    // Is the door on screen at all?
    camera.updateMatrixWorld()
    plane.getWorldPosition(state.sphere.center)
    state.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    state.frustum.setFromProjectionMatrix(state.clip)
    if (!state.frustum.intersectsSphere(state.sphere)) return

    const moved = !state.camera.equals(camera.matrixWorld) || !state.projection.equals(camera.projectionMatrix)
    if (!moved && !state.dirty) return
    const now = clock.elapsedTime
    if (portalMaxFps > 0 && now - state.at < 1 / portalMaxFps) return

    // The other world sits in door space.
    door.updateWorldMatrix(true, false)
    root.current.matrix.copy(door.matrixWorld)
    root.current.matrixWorldNeedsUpdate = true

    const previous = gl.getRenderTarget()
    gl.setRenderTarget(target)
    gl.render(scene, camera)
    gl.setRenderTarget(previous)

    state.camera.copy(camera.matrixWorld)
    state.projection.copy(camera.projectionMatrix)
    state.dirty = false
    state.at = now
    texture.current = target.texture
  })

  const node =
    model &&
    createPortal(
      <group ref={root} matrixAutoUpdate={false}>
        <group position={model.transform.position} rotation-y={model.transform.yaw}>
          <PreviewWorld model={model} />
        </group>
      </group>,
      scene,
    )
  return { texture, node }
}
