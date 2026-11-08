'use client'

import { Html, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { portalTo } from '@/experience/portal'
import { live, useExperience } from '@/experience/store'
import { localizeHref } from '@/lib/href'
import { StyledMaterial } from '@/world/toonMaterial'
import { useTheme } from '@/theme/store'
import { FONT_BOLD, FONT_MEDIUM } from '@/theme/typography'
import { htmlPortal } from '@/world/htmlPortal'
import { usePortalPreview } from '@/world/PortalPreview'
import { useFrontTextMaterial } from '@/world/textMaterial'
import { timeline } from '@/world/timeline'
import type { Page } from '@/content/schema'
import type { Custom3DProps } from '../types'
import { doorOffsets, portalDoors } from './doors'
import styles from './Door3D.module.css'

/** Within this many rail stops of the hall, its doors can be entered. */
const ACTIVE_GAP = 0.5
/** Within this many rail points of the hall, the doors show their pages live (B2). */
const PREVIEW_GAP = 2.5

const portalVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const portalFragment = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uTime;
  uniform float uHover;
  uniform float uOpacity;
  uniform sampler2D uPreview;  // the page behind the door, drawn with the real camera (B2)
  uniform float uPreviewMix;   // 0 = swirl only, 1 = live view
  uniform vec2 uResolution;    // drawing buffer size: the preview is sampled at screen coordinates
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * vec2(1.0, 1.5);
    float d = length(p);
    float rings = 0.5 + 0.5 * sin(d * 28.0 - uTime * (2.5 + uHover * 3.0));
    vec2 cell = fract(vUv * vec2(18.0, 27.0)) - 0.5;
    float dots = 1.0 - smoothstep(0.12, 0.18, length(cell));
    vec3 color = mix(uB, uA, rings * (1.0 - d * 0.9));
    color = mix(color, uB, dots * 0.25);
    if (uPreviewMix > 0.0) {
      // A window into the other office, with faint rings over the glass (stronger on hover)
      // and a glow of the portal colour at the edges.
      vec3 live = texture2D(uPreview, gl_FragCoord.xy / uResolution).rgb;
      live = mix(live, uA, rings * (0.03 + 0.14 * uHover));
      float edge = smoothstep(0.4, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
      live = mix(live, uA, edge * 0.35);
      color = mix(color, live, uPreviewMix);
    }
    gl_FragColor = vec4(color, uOpacity);
    #include <colorspace_fragment>
  }
`

type PortalUniforms = {
  uA: { value: THREE.Color }
  uB: { value: THREE.Color }
  uTime: { value: number }
  uHover: { value: number }
  uOpacity: { value: number }
  uPreview: { value: THREE.Texture | null }
  uPreviewMix: { value: number }
  uResolution: { value: THREE.Vector2 }
}

/** The swirling portal surface. Owns its material (see Membrane.tsx for why). */
export function usePortalMaterial(accentStrength: number) {
  const theme = useTheme()
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: portalVertex,
        fragmentShader: portalFragment,
        transparent: true,
        uniforms: {
          uA: { value: new THREE.Color() },
          uB: { value: new THREE.Color() },
          uTime: { value: 0 },
          uHover: { value: 0 },
          uOpacity: { value: 1 },
          uPreview: { value: null },
          uPreviewMix: { value: 0 },
          uResolution: { value: new THREE.Vector2(1, 1) },
        },
      }),
    [],
  )
  const uniforms = material.uniforms as PortalUniforms
  useEffect(() => {
    uniforms.uB.value.set(theme.ui.bg)
    uniforms.uA.value.set(theme.ui.bg).lerp(new THREE.Color(theme.ui.accent), accentStrength)
  }, [uniforms, theme.ui.accent, theme.ui.bg, accentStrength])
  useEffect(() => () => material.dispose(), [material])
  return { material, uniforms }
}

/** Door frame: two posts and a lintel. */
export function DoorFrame({ color }: { color: string }) {
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.98, 1.4, 0]}>
          <boxGeometry args={[0.2, 2.8, 0.3]} />
          <StyledMaterial color={color} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 2.9, 0]}>
        <boxGeometry args={[2.16, 0.2, 0.3]} />
        <StyledMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  )
}

/** One door of the hall: frame, portal, label, and an Enter button when the visitor is close. */
function PortalDoorView({
  label,
  href,
  primary,
  x,
  active,
  page,
  sceneKey,
  near,
  look,
}: {
  label: string
  href: string
  primary: boolean
  x: number
  active: boolean
  /** The page behind the door (live view, B2) and its scene key. */
  page: Page | undefined
  sceneKey: string
  near: () => boolean
  /** Door-space direction (x, z) from the hall viewpoint into this door. */
  look: [number, number]
}) {
  const theme = useTheme()
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const labelMaterial = useFrontTextMaterial()
  const { material, uniforms } = usePortalMaterial(primary ? 1 : 0.55)
  const frame = useRef<THREE.Group>(null)
  const surface = useRef<THREE.Mesh>(null)
  const hovered = useRef(false)
  const hover = useRef(0)
  const preview = usePortalPreview({ page, sceneKey, frame, surface, near, look })

  useFrame(({ clock }, delta) => {
    uniforms.uTime.value = clock.elapsedTime + x
    hover.current += ((hovered.current ? 1 : 0) - hover.current) * (1 - Math.exp(-delta * 6))
    uniforms.uHover.value = hover.current
    // Live view once its first picture is drawn (fades in instead of popping).
    const texture = preview.texture.current
    uniforms.uPreview.value = texture
    gl.getDrawingBufferSize(uniforms.uResolution.value)
    const want = texture ? 1 : 0
    uniforms.uPreviewMix.value += (want - uniforms.uPreviewMix.value) * (1 - Math.exp(-delta * 5))
  })

  const go = () => {
    const mesh = surface.current
    if (!mesh) return
    const target = mesh.getWorldPosition(new THREE.Vector3())
    const screen = target.clone().project(camera)
    portalTo(href, {
      target: target.toArray() as [number, number, number],
      origin: { x: (screen.x + 1) / 2, y: (1 - screen.y) / 2 },
    })
  }

  return (
    <group ref={frame} position={[x, 0, 0]}>
      {preview.node}
      <DoorFrame color={theme.world.sign} />
      <mesh
        ref={surface}
        position={[0, 1.4, 0]}
        onClick={(e) => {
          if (!active) return
          e.stopPropagation()
          go()
        }}
        onPointerOver={() => {
          if (!active) return
          hovered.current = true
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          hovered.current = false
          document.body.style.cursor = ''
        }}
      >
        <planeGeometry args={[1.76, 2.8]} />
        <primitive object={material} attach="material" />
      </mesh>
      <Text
        material={labelMaterial}
        font={primary ? FONT_BOLD : FONT_MEDIUM}
        fontSize={primary ? 0.42 : 0.3}
        anchorX="center"
        anchorY="bottom"
        letterSpacing={-0.01}
        color={theme.world.sign}
        position={[0, 3.15, 0]}
      >
        {`${label} →`}
      </Text>
      {active && (
        <Html position={[0, 0.55, 0.4]} center portal={htmlPortal} zIndexRange={[30, 21]}>
          <button type="button" className={primary ? styles.enter : styles.enterSecondary} onClick={go}>
            {primary ? 'Enter →' : label}
          </button>
        </Html>
      )}
    </group>
  )
}

/**
 * The portal hall at the end of a page: the module's own door in the middle, and a door for
 * every other page beside it. Going through one keeps the visitor in 3D (experience/portal.ts).
 */
export function Door3D({ block, locale, station, index, timing, nav, currentHref, previews }: Custom3DProps) {
  const theme = useTheme()
  const [active, setActive] = useState(false)
  const doors = useMemo(() => portalDoors(block, nav, currentHref), [block, nav, currentHref])
  const offsets = useMemo(() => doorOffsets(doors.length), [doors.length])
  // Hall viewpoint in the hall's own space (group: position anchor, rotation yaw).
  const view = useMemo(() => {
    const dx = station.viewpoint[0] - station.anchor[0]
    const dz = station.viewpoint[2] - station.anchor[2]
    const c = Math.cos(-station.yaw)
    const s = Math.sin(-station.yaw)
    return [dx * c + dz * s, -dx * s + dz * c] as const
  }, [station])
  const looks = useMemo(
    () =>
      offsets.map((x): [number, number] => {
        const lx = -(view[0] - x) // from the viewpoint to the door centre
        const lz = -view[1]
        const len = Math.hypot(lx, lz) || 1
        return lz < 0 ? [lx / len, lz / len] : [0, -1]
      }),
    [view, offsets],
  )
  const near = useCallback(
    () => Math.abs(timeline(live.progress, timing.segments).railIndex - timing.stopRail[index]!) < PREVIEW_GAP,
    [timing, index],
  )

  useFrame(() => {
    const gap = Math.abs(timeline(live.progress, timing.segments).railIndex - timing.stopRail[index]!)
    const next = gap < ACTIVE_GAP && useExperience.getState().portal.phase === 'idle'
    if (next !== active) setActive(next)
  })

  const width = (doors.length - 1) * 2.9 + 2.6
  return (
    <group position={station.anchor} rotation-y={station.yaw}>
      {doors.map((d, i) => (
        <PortalDoorView
          key={d.href}
          label={d.label}
          href={localizeHref(d.href, locale)}
          primary={d.primary}
          x={offsets[i]!}
          active={active}
          page={previews[d.href]}
          sceneKey={`${locale}/${d.href.split('/').filter(Boolean).join('/')}`}
          near={near}
          look={looks[i]!}
        />
      ))}
      {/* mat in front of the hall */}
      <mesh position={[0, 0.01, 1.2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[width, 1.6]} />
        <StyledMaterial color={theme.world.platform} />
      </mesh>
    </group>
  )
}
