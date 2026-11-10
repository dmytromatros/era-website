'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Theme } from '@/theme/tokens'
import { useTheme } from '@/theme/store'
import { warmPrograms } from '../precompile'
import { useStylePreset } from '../style'
import { applyToon } from '../toonMaterial'
import { cameraBody, crackFrame } from './crack'
import { useQualitySettings } from '../quality'
import { forearmOf, sleeveOf, handsAt, walkHandsAt, type HandPose, type Wrist } from './handsModel'
import { walkNow } from './walkModel'
import { live } from '@/experience/store'

type Colors = Theme['world']['hero']

const noRaycast = () => null

/**
 * One blocky hand + forearm as ONE geometry (colours in the vertices): palm, four fingers, a
 * thumb, the cuff and the sleeve. Wrist at the origin, fingers up (+y), palm facing −z (away
 * from the visitor — we see the backs of our hands), the forearm running back towards the
 * shoulder, below and behind the camera. `side` −1 = left hand, 1 = right.
 */
export function handGeometry(side: -1 | 1, colors: Colors, wrist: Wrist = 'bent'): THREE.BufferGeometry {
  const skin = new THREE.Color(colors.skin)
  const parts: THREE.BufferGeometry[] = []
  const add = (g: THREE.BufferGeometry, color: THREE.Color) => {
    const n = g.getAttribute('position').count
    const c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    parts.push(g)
  }

  add(new THREE.BoxGeometry(0.088, 0.085, 0.032).translate(0, 0.0425, 0), skin)
  // Fingers from the thumb side outwards: index, middle, ring, little.
  const lengths = [0.066, 0.074, 0.07, 0.056]
  lengths.forEach((len, i) => {
    const x = -side * (0.0315 - i * 0.021)
    add(new THREE.BoxGeometry(0.019, len, 0.028).translate(x, 0.086 + len / 2, 0.001), skin)
  })
  add(new THREE.BoxGeometry(0.024, 0.056, 0.028).rotateZ(side * 0.55).translate(-side * 0.053, 0.03, -0.006), skin)

  // Forearm: back from the bent wrist (handsAt turns it towards the shoulder).
  const along = new THREE.Vector3(...forearmOf(wrist)).normalize()
  const back = new THREE.Vector3(0, 0, 1).addScaledVector(along, -along.z).normalize()
  const across = new THREE.Vector3().crossVectors(along, back)
  const basis = new THREE.Matrix4().makeBasis(across, along, back)
  const onArm = (g: THREE.BufferGeometry, from: number, len: number) =>
    g.translate(0, len / 2, 0).applyMatrix4(basis).translate(...along.clone().multiplyScalar(from).toArray())
  add(onArm(new THREE.BoxGeometry(0.104, 0.045, 0.08), -0.004, 0.045), new THREE.Color(colors.cuff))
  const sleeve = sleeveOf(wrist) - 0.04
  add(onArm(new THREE.BoxGeometry(0.096, sleeve, 0.074), 0.04, sleeve), new THREE.Color(colors.sleeve))

  const merged = mergeGeometries(parts)!
  for (const g of parts) g.dispose()
  merged.computeBoundingSphere()
  return merged
}

const place = (mesh: THREE.Mesh | null, pose: HandPose) => {
  if (!mesh) return
  mesh.position.set(...pose.position)
  mesh.quaternion.set(...pose.quaternion)
}

/**
 * The visitor's own hands (wow-plan D1): they rise from below the frame and lean on the film
 * harder as the visitor scrolls (`live.progress`); when it gives way (the crack, breakModel.ts)
 * they lose their support and fall out of the frame (handsModel.ts). Fixed to the camera. Two
 * draw calls while they are in view, none before or after (not visible). Their shader program
 * is compiled on mount, so the first entrance does not hitch.
 */
export function Hands() {
  const { world } = useTheme()
  const preset = useStylePreset()
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const { walkHands } = useQualitySettings()
  const group = useRef<THREE.Group>(null)
  const left = useRef<THREE.Mesh>(null)
  const right = useRef<THREE.Mesh>(null)

  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), [])
  useLayoutEffect(() => applyToon(material, preset), [material, preset])
  useEffect(() => () => material.dispose(), [material])

  // Two shapes, one material: a bent wrist to lean on the film, a straight one to walk (D2).
  const geometry = useMemo(
    () => ({
      left: handGeometry(-1, world.hero),
      right: handGeometry(1, world.hero),
      walkLeft: handGeometry(-1, world.hero, 'straight'),
      walkRight: handGeometry(1, world.hero, 'straight'),
    }),
    [world.hero],
  )
  useEffect(() => () => Object.values(geometry).forEach((g) => g.dispose()), [geometry])

  // Compile the hands' program ahead (they are hidden until the visitor scrolls).
  useEffect(() => {
    let cancelled = false
    const proxies = new THREE.Scene()
    proxies.add(new THREE.Mesh(geometry.right, material))
    const timer = setTimeout(() => void warmPrograms(gl, scene, camera, proxies, () => cancelled), 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [gl, scene, camera, geometry, material, preset])

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const aspect = size.width / size.height
    const { e, crack, since } = crackFrame(clock.elapsedTime, aspect)
    const view = { aspect, fov: camera.fov }
    let pose = handsAt(e, live.tear, view, crack)
    // Arrived mid-page (no crack to play): no entrance hands.
    let visible = pose.visible && since !== Infinity
    let walking = false
    // Otherwise, walking (D2): they swing with the steps, peeking in at the bottom of the frame.
    if (!visible && walkHands && walkNow.walk.moving > 0.02) {
      pose = walkHandsAt(walkNow.walk, view)
      visible = pose.visible
      walking = true
    }
    g.visible = visible
    if (!visible) return
    // Hang on the body: the camera on its rail without the crack's kick (CameraRig wrote it
    // this frame — it is mounted before us), so a nod or a glance brings the hands into view.
    g.matrix.copy(cameraBody)
    g.matrixWorldNeedsUpdate = true
    if (left.current) left.current.geometry = walking ? geometry.walkLeft : geometry.left
    if (right.current) right.current.geometry = walking ? geometry.walkRight : geometry.right
    place(left.current, pose.left)
    place(right.current, pose.right)
  })

  return (
    <group ref={group} matrixAutoUpdate={false} visible={false}>
      <mesh ref={left} geometry={geometry.left} material={material} raycast={noRaycast} />
      <mesh ref={right} geometry={geometry.right} material={material} raycast={noRaycast} />
    </group>
  )
}
