'use client'

import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { StyledMaterial } from '../toonMaterial'

/**
 * A coffee cup with steam (wow-plan D3) — in Mila's hand, then in the visitor's. The cup is ONE
 * geometry with its colours in the vertices (drawn with the same toon program as the visitor's
 * hands — no new program); the steam is one plane with a small shader (two wavy, cartoon wisps,
 * alpha-tested so it writes depth and the background blur leaves it alone, rule 31). Two draw
 * calls in all. Feet of the cup at the origin, up = +y.
 */
const CUP = { radius: 0.055, height: 0.11 }

function colored(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex)
  const n = g.getAttribute('position').count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  // mergeGeometries needs the same attributes everywhere.
  g.deleteAttribute('uv')
  return g
}

function buildCup(): THREE.BufferGeometry {
  const { radius: r, height: h } = CUP
  const parts = [
    colored(new THREE.CylinderGeometry(r, r * 0.86, h, 12).translate(0, h / 2, 0), '#f6f1ea'),
    // A coral band (the studio's mug) and the coffee inside.
    colored(new THREE.CylinderGeometry(r * 1.02, r * 0.97, h * 0.3, 12).translate(0, h * 0.45, 0), '#e86f8a'),
    colored(new THREE.CylinderGeometry(r * 0.88, r * 0.88, 0.006, 12).translate(0, h - 0.008, 0), '#5b3a26'),
    colored(new THREE.TorusGeometry(0.03, 0.009, 6, 10, Math.PI).rotateZ(-Math.PI / 2).translate(r, h * 0.55, 0), '#f6f1ea'),
  ].map((g) => (g.index ? g.toNonIndexed() : g))
  const merged = mergeGeometries(parts)!
  parts.forEach((g) => g.dispose())
  merged.computeVertexNormals()
  return merged
}

let cupGeometry: THREE.BufferGeometry | null = null
const cup = () => (cupGeometry ??= buildCup())

const steamVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const steamFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    // Two wisps rising and curling; thinner and gone towards the top.
    float y = vUv.y;
    float x = vUv.x * 2.0 - 1.0;
    float a = 0.0;
    for (int i = 0; i < 2; i++) {
      float k = float(i);
      float c = (k - 0.5) * 0.5 + sin(y * 7.0 - uTime * 2.6 + k * 2.1) * 0.28 * y;
      float w = mix(0.2, 0.06, y);
      a = max(a, 1.0 - smoothstep(w * 0.6, w, abs(x - c)));
    }
    a *= smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.55, 1.0, y + sin(uTime * 1.7) * 0.05));
    if (a < 0.5) discard;
    gl_FragColor = vec4(vec3(1.0), 1.0);
    #include <colorspace_fragment>
  }
`
/** One steam material for every cup (one program, one time). */
export const steamMaterial = new THREE.ShaderMaterial({
  vertexShader: steamVertex,
  fragmentShader: steamFragment,
  uniforms: { uTime: { value: 0 } },
  side: THREE.DoubleSide,
})
let steamPlane: THREE.PlaneGeometry | null = null
const steam = () => (steamPlane ??= new THREE.PlaneGeometry(0.12, 0.24).translate(0, CUP.height + 0.13, 0))

export function CoffeeCup() {
  useFrame(({ clock }) => {
    steamMaterial.uniforms.uTime!.value = clock.elapsedTime
  })
  return (
    <group>
      <mesh geometry={cup()} raycast={noRaycast}>
        <StyledMaterial vertexColors roughness={0.8} />
      </mesh>
      <mesh geometry={steam()} material={steamMaterial} raycast={noRaycast} />
    </group>
  )
}

const noRaycast = () => null

/** Geometry and material of the cup for the visitor's hand (Hands draws it with its own material). */
export const cupParts = () => ({ geometry: cup(), steam: steam(), steamMaterial })
