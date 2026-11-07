'use client'

import { Html, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { live, useExperience } from '@/experience/store'
import { isInternal, localizeHref } from '@/lib/href'
import { useTheme } from '@/theme/store'
import { FONT_BOLD } from '@/theme/typography'
import { htmlPortal } from '@/world/htmlPortal'
import { timeline } from '@/world/timeline'
import type { Custom3DProps } from '../types'
import styles from './Door3D.module.css'

/** Within this many rail stops of the door, it can be entered. */
const ACTIVE_GAP = 0.5

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
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * vec2(1.0, 1.5);
    float d = length(p);
    float rings = 0.5 + 0.5 * sin(d * 28.0 - uTime * (2.5 + uHover * 3.0));
    vec2 cell = fract(vUv * vec2(18.0, 27.0)) - 0.5;
    float dots = 1.0 - smoothstep(0.12, 0.18, length(cell));
    vec3 color = mix(uB, uA, rings * (1.0 - d * 0.9));
    color = mix(color, uB, dots * 0.25);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

/** A doorway to another page. Click it (or the button when close) to go through. */
export function Door3D({ block, locale, station, index, timing }: Custom3DProps) {
  const theme = useTheme()
  const [active, setActive] = useState(false)
  const hover = useRef(0)
  const hovered = useRef(false)
  // Own the material (see Membrane.tsx for why not <shaderMaterial uniforms={…}>).
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: portalVertex,
        fragmentShader: portalFragment,
        uniforms: {
          uA: { value: new THREE.Color() },
          uB: { value: new THREE.Color() },
          uTime: { value: 0 },
          uHover: { value: 0 },
        },
      }),
    [],
  )
  const uniforms = material.uniforms as {
    uA: { value: THREE.Color }
    uB: { value: THREE.Color }
    uTime: { value: number }
    uHover: { value: number }
  }
  useEffect(() => {
    uniforms.uA.value.set(theme.ui.accent)
    uniforms.uB.value.set(theme.ui.bg)
  }, [uniforms, theme.ui.accent, theme.ui.bg])
  useEffect(() => () => material.dispose(), [material])

  useFrame(({ clock }, delta) => {
    uniforms.uTime.value = clock.elapsedTime
    hover.current += ((hovered.current ? 1 : 0) - hover.current) * (1 - Math.exp(-delta * 6))
    uniforms.uHover.value = hover.current
    const gap = Math.abs(timeline(live.progress, timing.segments).railIndex - timing.stopRail[index]!)
    const next = gap < ACTIVE_GAP
    if (next !== active) setActive(next)
  })

  const go = () => {
    const { ripple, navigate } = useExperience.getState()
    ripple()
    const href = localizeHref(block.href, locale)
    if (isInternal(block.href) && navigate) navigate(href)
    else window.location.href = href
  }

  if (!station) return null
  const frame = theme.world.sign

  return (
    <group position={station.anchor} rotation-y={station.yaw}>
      {/* frame */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.98, 1.4, 0]}>
          <boxGeometry args={[0.2, 2.8, 0.3]} />
          <meshStandardMaterial color={frame} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 2.9, 0]}>
        <boxGeometry args={[2.16, 0.2, 0.3]} />
        <meshStandardMaterial color={frame} roughness={0.5} />
      </mesh>

      {/* portal surface */}
      <mesh
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

      {/* mat in front */}
      <mesh position={[0, 0.01, 1.2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2.2, 1.6]} />
        <meshStandardMaterial color={theme.world.platform} />
      </mesh>

      <Text
        font={FONT_BOLD}
        fontSize={0.42}
        anchorX="center"
        anchorY="bottom"
        letterSpacing={-0.01}
        color={frame}
        position={[0, 3.15, 0]}
      >
        {`${block.label} →`}
      </Text>

      {active && (
        <Html position={[0, 0.55, 0.4]} center portal={htmlPortal} zIndexRange={[30, 21]}>
          <button type="button" className={styles.enter} onClick={go}>
            Enter →
          </button>
        </Html>
      )}
    </group>
  )
}
