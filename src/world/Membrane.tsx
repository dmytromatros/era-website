'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { live, useExperience } from '@/experience/store'
import { useTheme } from '@/theme/store'
import { burstAt, entranceBreak, healAt } from './firstPerson/breakModel'
import { crackFrame } from './firstPerson/crack'
import { FILM, handsAt, leanAt, tearPoint } from './firstPerson/handsModel'
import { MEMBRANE_LAYER } from './framePacing'
import { ENTRANCE_GEOMETRY } from './layout'
import { WaveSim, waves, wavesBusy } from './membraneWaves'
import { useQualitySettings } from './quality'

const { cameraStart, membraneDistance, fov } = ENTRANCE_GEOMETRY
const Z = cameraStart[2] - membraneDistance
/** Height of the visible area at the membrane's distance from the start camera. */
const visibleHeight = 2 * membraneDistance * Math.tan(THREE.MathUtils.degToRad(fov / 2))

/** Waves: how much a pointer stroke (per uv of travel) and the palms' press stir the film. */
const STROKE_GAIN = 1.5
const STROKE_MAX = 0.035
const PRESS_GAIN = 0.22
/** The crack: one big ring from the burst point. */
const CRACK_STIR = 0.3

const vertexShader = /* glsl */ `
  uniform float uPush;
  uniform float uTime;
  uniform float uStress;
  uniform vec2 uCenter;
  varying vec2 vPos;
  void main() {
    vec3 p = position;
    float d = distance(p.xy, uCenter);
    // The film stretches away under the leaning palms and wobbles like jelly; the harder they
    // lean, the more it quivers — about to give way.
    p.z -= uPush * exp(-d * d / 6.0);
    p.z += sin(d * 2.6 - uTime * 7.0) * uPush * 0.22 * exp(-d * 0.25);
    p.z += sin(uTime * 61.0 + d * 9.0) * 0.035 * uStress * exp(-d * 0.4);
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
  uniform float uStress;
  uniform float uJag;
  uniform vec2 uHole;
  uniform float uTime;
  uniform vec2 uCenter;
  // Waves (D1): height field over the start view, x = origin, y = size (world units).
  uniform sampler2D uWaves;
  uniform vec2 uWaveTexel;
  uniform vec4 uWaveRect;
  uniform float uWaveOn;
  varying vec2 vPos;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  // Dotted page pattern (same look as the CSS background).
  float dots(vec2 p) {
    vec2 cell = mod(p + uSpacing * 0.5, uSpacing) - uSpacing * 0.5;
    float aa = fwidth(length(cell));
    return 1.0 - smoothstep(uRadius - aa, uRadius + aa, length(cell));
  }

  void main() {
    vec3 color;
    // Liquid glass: the slope of the waves bends the dots behind it (each colour a little
    // differently), slopes facing the light brighten and the others darken. Flat = exactly the
    // 2D page.
    vec2 g = vec2(0.0);
    if (uWaveOn > 0.5) {
      vec2 suv = (vPos - uWaveRect.xy) / uWaveRect.zw;
      if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
        float hx = texture2D(uWaves, suv + vec2(uWaveTexel.x, 0.0)).r - texture2D(uWaves, suv - vec2(uWaveTexel.x, 0.0)).r;
        float hy = texture2D(uWaves, suv + vec2(0.0, uWaveTexel.y)).r - texture2D(uWaves, suv - vec2(0.0, uWaveTexel.y)).r;
        // Slope per domain height (cells are square).
        g = vec2(hx, hy) / (2.0 * uWaveTexel.y);
      }
    }
    if (dot(g, g) > 1e-10) {
      vec2 o = g * 0.3;
      color = vec3(
        mix(uBg.r, uDot.r, dots(vPos - o * 1.18)),
        mix(uBg.g, uDot.g, dots(vPos - o)),
        mix(uBg.b, uDot.b, dots(vPos - o * 0.82)));
      float slope = length(g);
      float lit = dot(g, vec2(-0.55, 0.83));
      color *= 1.0 + clamp(lit * 0.2, -0.1, 0.08);
      // A glint along the crests facing the light, and a faint soap-film tint on the steep parts.
      color += vec3(smoothstep(0.35, 1.2, lit)) * 0.4;
      vec3 sheen = 0.6 + 0.4 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + atan(g.y, g.x) / 6.2831 + uTime * 0.1));
      color = mix(color, sheen, smoothstep(0.3, 1.6, slope) * 0.22);
    } else {
      color = mix(uBg, uDot, dots(vPos));
    }

    // Strain (D1): the leaning palms stretch the film — rainbow stress streaks and a ring
    // around them, stronger the harder they lean, until it gives way.
    if (uStress > 0.0) {
      vec2 sr = vPos - uCenter;
      float sd = length(sr);
      float sa = atan(sr.y, sr.x);
      float streak = pow(noise(vec2(sa * 14.0, sd * 1.5 - uTime * 0.6)), 3.0) * exp(-sd * 0.45);
      float ring = exp(-pow((sd - 0.4 - uStress * 0.9) * 1.8, 2.0));
      vec3 strain = 0.6 + 0.4 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + sd * 0.4 - uTime * 0.25));
      color = mix(color, strain, uStress * clamp(ring * 0.4 + streak * 0.7, 0.0, 1.0));
    }

    // Tear: the film bursts from under the slipping palm (uHole) — a hole with jagged, glassy
    // spikes (uJag) and a soap-film edge, open across the view in a fraction of a second.
    vec2 rel = vPos - uHole;
    float angle = atan(rel.y, rel.x);
    float grow = min(uOpen * 4.0, 1.0);
    float wobble = (noise(vec2(angle * 2.5, uTime * 0.8)) - 0.5) * 1.4 * grow;
    float spikes = ((noise(vec2(angle * 9.0, 3.1)) - 0.5) * 2.6 + (noise(vec2(angle * 23.0, 7.7)) - 0.5) * 1.1) * uJag * grow;
    // Grows visibly over the burst (a quarter of a second to cover the view), then runs away.
    float hole = uOpen * 6.0 + pow(uOpen, 6.0) * 30.0;
    float edge = length(rel) + wobble + spikes - hole;
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

/** Touch screen: the tear starts in the centre (handsModel.tearPoint). */
const coarsePointer = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

/** The "page" itself as a film: it ripples, stretches, tears and lets the visitor into the world. */
export function Membrane() {
  const { ui } = useTheme()
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const mesh = useRef<THREE.Mesh>(null)
  const { waves: cells } = useQualitySettings()
  const aspect = size.width / size.height

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
          uStress: { value: 0 },
          uJag: { value: 0 },
          uHole: { value: new THREE.Vector2(0, cameraStart[1]) },
          uPush: { value: 0 },
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector2(0, cameraStart[1]) },
          uWaves: { value: null },
          uWaveTexel: { value: new THREE.Vector2(1, 1) },
          uWaveRect: { value: new THREE.Vector4() },
          uWaveOn: { value: 0 },
        },
        transparent: true,
        // Writes depth so transparent things behind it (troika text, labels) stay hidden.
        depthWrite: true,
      }),
    [],
  )
  const u = material.uniforms as {
    uBg: { value: THREE.Color }
    uDot: { value: THREE.Color }
    uSpacing: { value: number }
    uRadius: { value: number }
    uOpen: { value: number }
    uStress: { value: number }
    uJag: { value: number }
    uHole: { value: THREE.Vector2 }
    uPush: { value: number }
    uTime: { value: number }
    uCenter: { value: THREE.Vector2 }
    uWaves: { value: THREE.Texture | null }
    uWaveTexel: { value: THREE.Vector2 }
    uWaveRect: { value: THREE.Vector4 }
    uWaveOn: { value: number }
  }
  useEffect(() => () => material.dispose(), [material])

  // The waves: one small simulation for the start view (none on `low`).
  const sim = useMemo(() => (cells > 0 ? new WaveSim(cells, aspect) : null), [cells, aspect])
  useEffect(() => {
    waves.enabled = !!sim
    if (sim) u.uWaveTexel.value.copy(sim.texel)
    u.uWaveOn.value = 0
    return () => {
      waves.enabled = false
      sim?.dispose()
    }
  }, [sim, u])
  useEffect(() => {
    const w = visibleHeight * aspect
    u.uWaveRect.value.set(-w / 2, cameraStart[1] - visibleHeight / 2, w, visibleHeight)
  }, [aspect, u])

  useEffect(() => {
    u.uBg.value.set(ui.bg)
    u.uDot.value.set(ui.dot)
  }, [ui.bg, ui.dot, u])

  // Match the CSS grid: 24px spacing, ~1.4px dot radius, at the current viewport height.
  useEffect(() => {
    const pxToWorld = visibleHeight / size.height
    u.uSpacing.value = 24 * pxToWorld
    u.uRadius.value = 1.4 * pxToWorld
  }, [size.height, u])

  // Drawn also when the loop draws the film alone (pointer waves on a still landing).
  useEffect(() => {
    mesh.current?.layers.enable(MEMBRANE_LAYER)
  }, [])

  // The tear starts where the pointer is when the visitor starts scrolling (D1: the hands press
  // there; centre on a touch screen).
  useEffect(
    () =>
      useExperience.subscribe((s, prev) => {
        if (s.handedOver && !prev.handedOver) {
          const t = tearPoint(live.pointerUv, coarsePointer())
          live.tear.x = t.x
          live.tear.y = t.y
        }
      }),
    [],
  )

  const stir = useRef({ x: live.pointerUv.x, y: live.pointerUv.y, at: -Infinity, press: 0, cracked: false })
  const toFilm = (uv: { x: number; y: number }, out: THREE.Vector2) =>
    out.set((uv.x - 0.5) * visibleHeight * aspect, cameraStart[1] + (uv.y - 0.5) * visibleHeight)

  useFrame(({ clock }, delta) => {
    // The film is intact until the crack (breakModel.ts); then it bursts open in real time and,
    // if the visitor scrolls back up, heals with the progress.
    const { e, since } = crackFrame(clock.elapsedTime, aspect)
    const lean = leanAt(e)
    const burst = since === null ? 0 : since === Infinity ? 1 : burstAt(since)
    const open = since === null ? 0 : burst * healAt(e)
    u.uOpen.value = open
    u.uPush.value = FILM.push * lean * (1 - burst)
    u.uStress.value = since === null ? lean * lean : 0
    u.uJag.value = since === null || since === Infinity ? 0 : 1
    u.uTime.value = clock.elapsedTime
    toFilm(live.tear, u.uCenter.value)
    toFilm(since === null ? live.tear : entranceBreak.uv, u.uHole.value)
    const visible = open < 0.999
    if (mesh.current) mesh.current.visible = visible
    const entering = e > 0 && (since === null || since < 1)
    const hands = entering && since === null ? handsAt(e, live.tear, { aspect, fov }) : null

    if (!sim) return
    const now = performance.now()
    const s = stir.current
    if (visible && (wavesBusy(now) || entering)) {
      // The pointer's path since the last frame (screen uv = the film's uv at the start view).
      const p = live.pointerUv
      if (waves.lastInput > s.at) {
        // First stir after a rest: start from here, not from where the pointer was long ago.
        if (now - s.at > 200) {
          s.x = p.x
          s.y = p.y
        }
        const len = Math.hypot(p.x - s.x, p.y - s.y)
        sim.stir(s.x, s.y, p.x, p.y, Math.min(len * STROKE_GAIN, STROKE_MAX))
        s.x = p.x
        s.y = p.y
        s.at = waves.lastInput
      }
      // The palms: a ring from each as they lean in (and back as they let go)…
      const press = hands?.press ?? 0
      const dp = press - s.press
      s.press = press
      if (hands && Math.abs(dp) > 1e-4) for (const palm of hands.palms) sim.stir(palm.x, palm.y, palm.x, palm.y, dp * PRESS_GAIN)
      // …and one big ring from the burst point when the film gives way.
      if (since !== null && since !== Infinity && !s.cracked) {
        const b = entranceBreak.uv
        sim.stir(b.x, b.y, b.x, b.y, CRACK_STIR)
      }
      s.cracked = since !== null
      sim.step(gl, delta)
      u.uWaves.value = sim.texture
      u.uWaveOn.value = 1
    } else if (u.uWaveOn.value) {
      // Died out (or torn): flat again, and no more steps until something stirs.
      sim.clear(gl)
      s.press = 0
      s.cracked = since !== null
      u.uWaveOn.value = 0
    }
  })

  return (
    <mesh ref={mesh} position={[0, 0, Z]} renderOrder={-1}>
      <planeGeometry args={[80, 40, 96, 48]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
