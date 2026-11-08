'use client'

import type { ThreeElements } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { useStylePreset, type StylePreset, type ToonSettings } from './style'

/**
 * Cartoon shading for the world's standard materials (wow-plan A2), injected into three's
 * MeshStandardMaterial with onBeforeCompile — so instancing, fog, colours and lights keep
 * working, only the light response becomes cartoon:
 * - direct (sun) light is quantised into the style's bands (soft or hard edges);
 * - specular is gone or a hard highlight;
 * - a rim light at grazing angles;
 * - optional hatch lines in the darkest band (comic).
 * Settings are compiled in as constants (customProgramCacheKey per style), no uniforms to keep
 * in sync — except the sun strength, a shared uniform set by <Atmosphere>.
 */

/** Sun intensity of the current theme — bands are relative to it. Shared by all materials. */
export const toonSun = { value: 1 }

/**
 * Time (s) of the office's living details (A5: wind in the plants, code on the screens).
 * Shared uniform; advanced by <Office> only on quality levels that allow it.
 */
export const liveTime = { value: 0 }

/** Wind sway for plant foliage (instanced): more at the top of each ball, out of phase per plant. */
const WIND_GLSL = /* glsl */ `
  #ifdef USE_INSTANCING
    vec3 eraIp = instanceMatrix[3].xyz;
    float eraPh = eraIp.x * 0.7 + eraIp.z * 0.9;
    float eraW = sin(eraTime * 1.4 + eraPh) * 0.6 + sin(eraTime * 2.3 + eraPh * 1.7) * 0.4;
    transformed.x += eraW * 0.08 * (position.y + 0.5);
    transformed.z += eraW * 0.05 * (position.y + 0.5);
  #endif
`

const f = (n: number) => n.toFixed(4)
const v3 = (c: [number, number, number]) => `vec3(${c.map(f).join(',')})`

function bandsGlsl(t: ToonSettings): string {
  // q = brightness of the band `lit` falls into, with soft edges between bands.
  let code = `float q = ${f(t.bands[0]![1])};`
  for (let i = 1; i < t.bands.length; i++) {
    const [at, value] = t.bands[i]!
    const prev = t.bands[i - 1]![1]
    code += ` q += ${f(value - prev)} * smoothstep(${f(at - t.softness)}, ${f(at + t.softness)}, lit);`
  }
  return code
}

function patch(shader: THREE.WebGLProgramParametersWithUniforms, t: ToonSettings | null, variant: ToonVariant) {
  if (variant === 'plant') {
    shader.uniforms.eraTime = liveTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float eraTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_GLSL}`)
  }
  if (!t) return
  shader.uniforms.eraSun = toonSun
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float eraSun;')
    .replace(
      '#include <lights_fragment_end>',
      /* glsl */ `#include <lights_fragment_end>
      vec3 eraBase = max(diffuseColor.rgb, vec3(1e-3));
      float eraLit = dot(reflectedLight.directDiffuse / eraBase, vec3(0.299, 0.587, 0.114));
      // directDiffuse = base * NdotL * sun / PI (BRDF_Lambert): back to 0..1 of the sun.
      float lit = clamp(eraLit * PI / max(eraSun, 1e-3), 0.0, 1.0);
      ${bandsGlsl(t)}
      // Same light hue, brightness replaced by the band.
      vec3 eraHue = eraLit > 1e-5 ? reflectedLight.directDiffuse / (eraBase * eraLit) : vec3(1.0);
      reflectedLight.directDiffuse = eraBase * q * eraSun * RECIPROCAL_PI * eraHue;
      reflectedLight.indirectDiffuse *= ${f(t.ambient)};
      ${
        t.highlight > 0
          ? `reflectedLight.directSpecular = vec3(step(0.5, dot(reflectedLight.directSpecular, vec3(0.333)))) * ${f(t.highlight)};`
          : 'reflectedLight.directSpecular = vec3(0.0);'
      }
      reflectedLight.indirectSpecular *= 0.0;`,
    )
    .replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      float eraRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), ${f(t.rim.power)});
      outgoingLight += ${v3(t.rim.color)} * eraRim * ${f(t.rim.strength)};
      ${
        t.hatch > 0
          ? `float eraDark = 1.0 - smoothstep(${f(t.bands[1]![0] - 0.05)}, ${f(t.bands[1]![0] + 0.05)}, lit);
      float eraLine = step(0.6, fract((gl_FragCoord.x + gl_FragCoord.y) / ${f(t.hatchSpacing)}));
      outgoingLight *= 1.0 - ${f(t.hatch)} * eraDark * eraLine;`
          : ''
      }
      #include <opaque_fragment>`,
    )
}

/**
 * Variants of the toon look for different surfaces. `ceiling` faces away from the sun — no
 * hatching there, it would cover the whole sky. `plant` sways in the wind (A5).
 */
export type ToonVariant = 'default' | 'ceiling' | 'plant'

/** Toon settings + program cache key of a style for a surface variant. */
export function toonFor(preset: StylePreset, variant: ToonVariant): { toon: ToonSettings | null; key: string } {
  if (!preset.toon) return { toon: null, key: `${preset.label}-${variant}` }
  if (variant === 'ceiling') return { toon: { ...preset.toon, hatch: 0 }, key: `${preset.label}-ceiling` }
  return { toon: preset.toon, key: `${preset.label}-${variant}` }
}

/**
 * Make a material cartoon-shaded in the given style (or plain for a style without toon).
 * Remembers the variant on the material so StylePrecompile can prepare the other styles.
 */
export function applyToon(material: THREE.MeshStandardMaterial, preset: StylePreset, variant: ToonVariant = 'default') {
  const { toon, key } = toonFor(preset, variant)
  material.onBeforeCompile = (shader) => patch(shader, toon, variant)
  material.customProgramCacheKey = () => `era-toon-${key}`
  material.userData.eraToon = variant
  material.needsUpdate = true
}

/**
 * Drop-in for JSX `<meshStandardMaterial>` that follows the current style. Same props.
 */
export function StyledMaterial(props: ThreeElements['meshStandardMaterial']) {
  const ref = useRef<THREE.MeshStandardMaterial>(null)
  const preset = useStylePreset()
  useLayoutEffect(() => {
    if (ref.current) applyToon(ref.current, preset)
  }, [preset])
  return <meshStandardMaterial ref={ref} {...props} />
}
