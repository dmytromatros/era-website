import * as THREE from 'three'
import { liveTime } from './toonMaterial'

/**
 * Monitors with code scrolling on them (wow-plan A5) — drawn in the fragment shader from the
 * box's UVs and the shared `liveTime`, no textures, one instanced draw call for every screen.
 * Each screen has its own seed (from its position), so they do not scroll in lockstep.
 * Unlit (MeshBasicMaterial): a screen glows by itself; the instance colour is the screen's
 * background. Not cartoon-shaded, so it does not change with the style (no precompile needed).
 */
export function createScreenMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial()
  material.onBeforeCompile = (shader) => {
    shader.uniforms.eraTime = liveTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 eraUv;\nvarying float eraSeed;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        eraUv = uv;
        #ifdef USE_INSTANCING
          eraSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        #else
          eraSeed = 0.0;
        #endif`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float eraTime;\nvarying vec2 eraUv;\nvarying float eraSeed;')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          const float ROWS = 12.0;
          float rowNow = floor(eraUv.y * ROWS);
          float tick = floor(eraTime * 1.5 + eraSeed * 10.0);
          float id = rowNow - tick; // lines move up one row per tick
          float h = fract(sin(id * 12.9898 + eraSeed * 78.233) * 43758.5453);
          float indent = floor(fract(h * 7.13) * 3.0) * 0.08;
          float len = 0.18 + 0.55 * h;
          float fy = fract(eraUv.y * ROWS);
          float on = step(0.06 + indent, eraUv.x) * step(eraUv.x, 0.06 + indent + len)
            * step(0.3, fy) * step(fy, 0.72) * step(0.12, h);
          vec3 code = mix(vec3(0.49, 0.91, 0.53), vec3(0.47, 0.75, 1.0), step(0.5, fract(h * 3.7)));
          code = mix(code, vec3(1.0, 0.6, 0.45), step(0.85, fract(h * 5.1)));
          diffuseColor.rgb = mix(diffuseColor.rgb, code, on * 0.9);
        }`,
      )
  }
  material.customProgramCacheKey = () => 'era-screen'
  return material
}
