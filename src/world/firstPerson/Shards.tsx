'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useTheme } from '@/theme/store'
import { warmPrograms } from '../precompile'
import { useQualitySettings } from '../quality'
import { entranceBreak } from './breakModel'
import { crackFrame } from './crack'
import { SHARDS, burstOrigin, rand, shardAt } from './shardsModel'

const MAX = 40
const noRaycast = () => null

const vertexShader = /* glsl */ `
  attribute float aSeed;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vSeed;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uBg;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vSeed;
  void main() {
    // A piece of the page: its colour, lit a little by how it faces you, and the film's
    // soap-bubble rainbow sliding over it as it spins.
    vec3 n = normalize(vNormal);
    float facing = abs(dot(n, vView));
    vec3 sheen = 0.6 + 0.4 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + facing * 1.6 + vSeed));
    vec3 color = mix(uBg * (0.82 + 0.18 * facing), sheen, 0.25 + 0.45 * pow(1.0 - facing, 2.0));
    color += pow(facing, 24.0) * 0.5;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

/** One thin triangular sliver; instances vary it by scale and spin. */
function shardGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(-0.5, -0.35), new THREE.Vector2(0.55, -0.2), new THREE.Vector2(-0.1, 0.6)])
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false })
  g.translate(0, 0, -0.02)
  // Per-shard rainbow phase.
  const seeds = new Float32Array(MAX)
  for (let i = 0; i < MAX; i++) seeds[i] = rand(i, 11)
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
  return g
}

/**
 * Shards of the film (wow-plan D1): when it gives way, pieces of the page fly out of the hole at
 * the visitor and fall away (shardsModel.ts). ONE instanced mesh, drawn only during the
 * SHARDS.life seconds after the crack (otherwise not visible: 0 draw calls); its program is
 * compiled on mount. Count per quality level (`shards`).
 */
export function Shards() {
  const { ui } = useTheme()
  const { shards: count } = useQualitySettings()
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const mesh = useRef<THREE.InstancedMesh>(null)

  const geometry = useMemo(() => shardGeometry(), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uBg: { value: new THREE.Color() } },
        side: THREE.DoubleSide,
      }),
    [],
  )
  useEffect(() => {
    ;(material.uniforms.uBg!.value as THREE.Color).set(ui.bg)
  }, [material, ui.bg])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  // Compile the program ahead (the shards only appear at the crack).
  useEffect(() => {
    let cancelled = false
    const proxies = new THREE.Scene()
    proxies.add(new THREE.InstancedMesh(geometry, material, 1))
    const timer = setTimeout(() => void warmPrograms(gl, scene, camera, proxies, () => cancelled), 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [gl, scene, camera, geometry, material])

  const tmp = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const { since } = crackFrame(clock.elapsedTime, size.width / size.height)
    const live = since !== null && since !== Infinity && since < SHARDS.life && count > 0
    m.visible = live
    if (!live) return
    const origin = burstOrigin(entranceBreak.uv, size.width / size.height)
    for (let i = 0; i < count; i++) {
      const s = shardAt(i, since, origin)
      if (s) {
        tmp.position.set(...s.position)
        tmp.rotation.set(...s.rotation)
        tmp.scale.setScalar(Math.max(s.scale, 1e-4))
      } else tmp.scale.setScalar(1e-4)
      tmp.updateMatrix()
      m.setMatrixAt(i, tmp.matrix)
    }
    m.count = count
    m.instanceMatrix.needsUpdate = true
  })

  return (
    // frustumCulled off: the instances are far from (0, 0, 0) — rule 37.
    <instancedMesh ref={mesh} args={[geometry, material, MAX]} frustumCulled={false} visible={false} raycast={noRaycast} />
  )
}
