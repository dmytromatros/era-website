'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { live, useExperience } from '@/experience/store'
import { useTheme } from '@/theme/store'
import { ENTRANCE_GEOMETRY } from './layout'
import { ENTRANCE } from './timeline'

const { cameraStart, membraneDistance, fov } = ENTRANCE_GEOMETRY
const Z = cameraStart[2] - membraneDistance
/** Height of the visible area at the membrane's distance from the start camera. */
const visibleHeight = 2 * membraneDistance * Math.tan(THREE.MathUtils.degToRad(fov / 2))

const vertexShader = /* glsl */ `
  uniform float uPush;
  uniform float uTime;
  uniform vec2 uCenter;
  varying vec2 vPos;
  void main() {
    vec3 p = position;
    float d = distance(p.xy, uCenter);
    // The film stretches away from the viewer before it tears, and wobbles like jelly.
    p.z -= uPush * exp(-d * d / 6.0);
    p.z += sin(d * 2.6 - uTime * 7.0) * uPush * 0.22 * exp(-d * 0.25);
    vPos = p.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uBg;
  uniform vec3 uDot;
  uniform float uSpacing;
  uniform float uRadius;
  uniform float uOpen;
  uniform float uTime;
  uniform vec2 uCenter;
  varying vec2 vPos;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    // Dotted page pattern (same look as the CSS background).
    vec2 cell = mod(vPos + uSpacing * 0.5, uSpacing) - uSpacing * 0.5;
    float aa = fwidth(length(cell));
    float dotMask = 1.0 - smoothstep(uRadius - aa, uRadius + aa, length(cell));
    vec3 color = mix(uBg, uDot, dotMask);

    // Tear: a hole with a wobbly, soap-film edge that grows from the pointer.
    vec2 rel = vPos - uCenter;
    float angle = atan(rel.y, rel.x);
    float wobble = (noise(vec2(angle * 2.5, uTime * 0.8)) - 0.5) * 1.4 * min(uOpen * 4.0, 1.0);
    float d = length(rel) + wobble;
    float hole = uOpen * uOpen * 32.0;
    float edge = d - hole;
    // No tear at all until the visitor starts entering.
    float alpha = mix(1.0, smoothstep(0.0, 0.25, edge), step(0.0001, uOpen));
    float rim = (1.0 - smoothstep(0.0, 0.8, abs(edge - 0.3))) * step(0.0001, uOpen);
    vec3 film = 0.6 + 0.4 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + angle / 6.2831 * 2.0 + uTime * 0.15));
    color = mix(color, film, rim * 0.8);

    // Fully torn pixels must not write depth, or they would hide the world behind them.
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`

/** The "page" itself as a film: it stretches, tears and lets the visitor into the world. */
export function Membrane() {
  const { ui } = useTheme()
  const size = useThree((s) => s.size)
  const mesh = useRef<THREE.Mesh>(null)

  // The material is created here and handed over as-is (<primitive>), so the uniforms we update
  // are guaranteed to be the ones the GPU reads. With a JSX <shaderMaterial uniforms={…}> the
  // material can end up holding a different uniforms object than this component (React dev
  // double-render), and the tear silently never animated.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uBg: { value: new THREE.Color() },
          uDot: { value: new THREE.Color() },
          uSpacing: { value: 0.1 },
          uRadius: { value: 0.01 },
          uOpen: { value: 0 },
          uPush: { value: 0 },
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector2(0, cameraStart[1]) },
        },
        transparent: true,
        // Writes depth so transparent things behind it (troika text, labels) stay hidden.
        depthWrite: true,
      }),
    [],
  )
  const uniforms = material.uniforms as {
    uBg: { value: THREE.Color }
    uDot: { value: THREE.Color }
    uSpacing: { value: number }
    uRadius: { value: number }
    uOpen: { value: number }
    uPush: { value: number }
    uTime: { value: number }
    uCenter: { value: THREE.Vector2 }
  }
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    uniforms.uBg.value.set(ui.bg)
    uniforms.uDot.value.set(ui.dot)
  }, [ui.bg, ui.dot, uniforms])

  // Match the CSS grid: 24px spacing, ~1.4px dot radius, at the current viewport height.
  useEffect(() => {
    const pxToWorld = visibleHeight / size.height
    uniforms.uSpacing.value = 24 * pxToWorld
    uniforms.uRadius.value = 1.4 * pxToWorld
  }, [size.height, uniforms])

  // The tear starts where the pointer is when the visitor starts scrolling.
  useEffect(
    () =>
      useExperience.subscribe((s, prev) => {
        if (s.handedOver && !prev.handedOver) {
          const aspect = size.width / size.height
          uniforms.uCenter.value.set(
            (live.pointerUv.x - 0.5) * visibleHeight * aspect,
            cameraStart[1] + (live.pointerUv.y - 0.5) * visibleHeight,
          )
        }
      }),
    [size, uniforms],
  )

  useFrame(({ clock }) => {
    const e = Math.min(Math.max(live.progress / ENTRANCE, 0), 1)
    // Fully torn across the view by e ≈ 0.4 — before the hero elements start travelling.
    const open = THREE.MathUtils.smoothstep(e, 0.04, 0.42)
    uniforms.uOpen.value = open
    uniforms.uPush.value = THREE.MathUtils.smoothstep(e, 0, 0.08) * (1 - open) * 2.6
    uniforms.uTime.value = clock.elapsedTime
    if (mesh.current) mesh.current.visible = open < 0.999
  })

  return (
    <mesh ref={mesh} position={[0, 0, Z]} renderOrder={-1}>
      <planeGeometry args={[80, 40, 96, 48]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
