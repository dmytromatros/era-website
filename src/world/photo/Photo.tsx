'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useTheme } from '@/theme/store'
import { cameraBody } from '../firstPerson/crack'
import { warmPrograms } from '../precompile'
import { useQualitySettings } from '../quality'
import { useStylePreset } from '../style'
import { applyToon } from '../toonMaterial'
import { composePolaroid, type PolaroidTexts } from './polaroid'
import { photoAt, photoCue, photoFileName, photoSize } from './photoModel'
import { PHONE, phonePose } from './phoneModel'
import { photoCapture, photoDone, photoReady, photoShot, setPicture, usePhoto } from './photoState'

const noRaycast = () => null

type Colors = { skin: string; sleeve: string; cuff: string }

/**
 * The phone and the hand holding it as ONE geometry (colours in the vertices), in the phone's own
 * space (centre of the body, screen towards +z). The fingers hook over its top edge from behind,
 * the thumb rests on the wide right bezel (never over the screen: the screen's hole would cut
 * it), the forearm runs from the wrist along `toShoulder` out of the frame.
 */
function phoneGeometry(colors: Colors, toShoulder: THREE.Vector3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const add = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex)
    const n = g.getAttribute('position').count
    const a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(a, 3))
    parts.push(g)
  }
  const { width, height, depth } = PHONE
  add(new THREE.BoxGeometry(width, height, depth), '#1d2026')
  // Side buttons on the top edge, a camera bump at the back-left (seen as the phone swings up).
  add(new THREE.BoxGeometry(0.02, 0.003, 0.004).translate(-0.035, height / 2 + 0.0015, 0), '#3a3f48')
  add(new THREE.BoxGeometry(0.03, 0.03, 0.004).translate(-0.05, 0.012, -depth / 2 - 0.002), '#2b2f37')
  // Palm behind the right end; two fingertips peeking over the top edge from behind (the rest of
  // the fingers are hidden by the phone); the thumb on the front bezel.
  add(new THREE.BoxGeometry(0.08, 0.086, 0.028).translate(0.05, -0.024, -depth / 2 - 0.015), colors.skin)
  for (const [x, peek] of [
    [0.046, 0.009],
    [0.064, 0.007],
  ] as const) {
    add(new THREE.BoxGeometry(0.016, 0.03, 0.013).translate(x, height / 2 + peek - 0.015, -depth / 2 - 0.0075), colors.skin)
  }
  add(new THREE.BoxGeometry(0.016, 0.04, 0.014).rotateZ(0.2).translate(0.07, -0.006, depth / 2 + 0.007), colors.skin)

  // Cuff and sleeve along the forearm, from the wrist under the palm.
  const along = toShoulder.clone().normalize()
  const side = new THREE.Vector3(1, 0, 0).addScaledVector(along, -along.x).normalize()
  const back = new THREE.Vector3().crossVectors(side, along)
  const basis = new THREE.Matrix4().makeBasis(side, along, back)
  const wrist = new THREE.Vector3(0.05, -0.064, -depth / 2 - 0.015)
  const onArm = (g: THREE.BufferGeometry, from: number, len: number) =>
    g
      .translate(0, len / 2, 0)
      .applyMatrix4(basis)
      .translate(wrist.x + along.x * from, wrist.y + along.y * from, wrist.z + along.z * from)
  add(onArm(new THREE.BoxGeometry(0.092, 0.045, 0.074), -0.006, 0.045), colors.cuff)
  add(onArm(new THREE.BoxGeometry(0.086, 0.62, 0.068), 0.038, 0.62), colors.sleeve)

  const merged = mergeGeometries(parts)!
  for (const g of parts) g.dispose()
  merged.computeBoundingSphere()
  return merged
}

/** The camera app on the phone's screen (a see-through overlay): thirds, corner marks, the shutter, the countdown. */
function drawScreen(ctx: CanvasRenderingContext2D, count: number) {
  const { width: w, height: h } = ctx.canvas
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (const f of [1 / 3, 2 / 3]) {
    ctx.moveTo(w * f, 0)
    ctx.lineTo(w * f, h)
    ctx.moveTo(0, h * f)
    ctx.lineTo(w, h * f)
  }
  ctx.stroke()
  // Focus corners in the middle.
  ctx.strokeStyle = '#ffd43b'
  ctx.lineWidth = 3
  const cx = w / 2,
    cy = h / 2,
    a = h * 0.22,
    b = h * 0.09
  ctx.beginPath()
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    ctx.moveTo(cx + sx * a, cy + sy * a - sy * b)
    ctx.lineTo(cx + sx * a, cy + sy * a)
    ctx.lineTo(cx + sx * a - sx * b, cy + sy * a)
  }
  ctx.stroke()
  // The shutter at the right edge, a red dot top left.
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.arc(w - h * 0.16, h / 2, h * 0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(w - h * 0.16, h / 2, h * 0.135, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#ff4d4d'
  ctx.beginPath()
  ctx.arc(h * 0.1, h * 0.12, h * 0.035, 0, Math.PI * 2)
  ctx.fill()
  if (count > 0) {
    ctx.font = `800 ${Math.round(h * 0.42)}px ${getComputedStyle(document.body).fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.strokeText(String(count), cx, cy)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(String(count), cx, cy)
  }
}

/**
 * The photo moment (E7), mounted only while it plays (its own chunk, photoState.preloadPhoto):
 * the hand raising the phone, the cue for everyone in the frame to pose, the shutter — the frame
 * is read back by <FramePacer> right after it is drawn without the phone — and the polaroid.
 *
 * Cost while it plays (~3 s): the hand + phone (1 draw call, the hands' own toon program), the
 * screen's stencil mask (1, no colour) and the camera app over it (1, a 256 × 128 canvas redrawn
 * at each number). Nothing at all before or after: not mounted.
 */
export function Photo({ texts }: { texts: PolaroidTexts }) {
  const { world } = useTheme()
  const preset = useStylePreset()
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const { photoHand } = useQualitySettings()
  const group = useRef<THREE.Group>(null)
  const phone = useRef<THREE.Group>(null)
  const s = useRef({ start: -1, cued: false, shot: false, count: -1 })

  const aspect = size.width / size.height
  const fov = camera.fov

  // The forearm runs to the shoulder from where the phone is held up (fixed for this screen).
  const geometry = useMemo(() => {
    const held = phonePose(1, 0, { aspect, fov })
    const q = new THREE.Quaternion(...held.quaternion)
    const wrist = new THREE.Vector3(0.05, -0.064, -PHONE.depth / 2 - 0.015).applyQuaternion(q).add(new THREE.Vector3(...held.position))
    const toShoulder = new THREE.Vector3(...PHONE.shoulder).sub(wrist).applyQuaternion(q.clone().invert())
    return phoneGeometry(world.hero, toShoulder)
  }, [world.hero, aspect, fov])
  useEffect(() => () => geometry.dispose(), [geometry])

  // Hand and phone: the hands' own (toon) material — no new program — but drawn only where the
  // screen's mask is not: the screen is a window onto the office.
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.KeepStencilOp,
      }),
    [],
  )
  useLayoutEffect(() => applyToon(material, preset), [material, preset])
  const mask = useMemo(() => {
    const { x0, x1, y0, y1 } = PHONE.screen
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, PHONE.depth / 2 + 0.0004)
    const mat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
    })
    return { geo, mat }
  }, [])
  const app = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 126
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const { x0, x1, y0, y1 } = PHONE.screen
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, PHONE.depth / 2 + 0.0008)
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })
    return { ctx: canvas.getContext('2d')!, texture, geo, mat }
  }, [])
  useEffect(
    () => () => {
      material.dispose()
      mask.geo.dispose()
      mask.mat.dispose()
      app.geo.dispose()
      app.mat.dispose()
      app.texture.dispose()
    },
    [material, mask, app],
  )

  // Compile what is new before the hand comes up (the scroll is already held meanwhile), then go.
  useEffect(() => {
    // Without the hand (`low`): nothing to compile, go at once.
    if (!photoHand) {
      photoReady()
      return
    }
    let cancelled = false
    drawScreen(app.ctx, 0)
    app.texture.needsUpdate = true
    const proxies = new THREE.Scene()
    proxies.add(new THREE.Mesh(geometry, material), new THREE.Mesh(app.geo, app.mat))
    const timer = setTimeout(
      () =>
        void warmPrograms(gl, scene, camera, proxies, () => cancelled).then(() => {
          if (!cancelled) photoReady()
        }),
      0,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount: later changes need no warming
  }, [])

  // The frame read back (FramePacer, right after drawing it): shrink, frame it, hand it over.
  useEffect(() => {
    photoCapture.take = (source) => {
      const { w, h } = photoSize(source.width, source.height)
      const shot = document.createElement('canvas')
      shot.width = w
      shot.height = h
      shot.getContext('2d')!.drawImage(source, 0, 0, w, h)
      const date = new Date()
      void composePolaroid(shot, texts, date).then((blob) => {
        if (!blob) return
        setPicture({ url: URL.createObjectURL(blob), blob, name: photoFileName(texts.site, texts.page, date), width: w, height: h })
      })
    }
    return () => {
      photoCapture.take = null
      photoCapture.want = false
    }
  }, [texts])

  useFrame(({ clock }) => {
    const g = group.current
    const p = phone.current
    if (!g || !p) return
    const st = usePhoto.getState()
    if (st.phase !== 'shooting') {
      g.visible = false
      s.current = { start: -1, cued: false, shot: false, count: -1 }
      return
    }
    // On the scene clock, like the poses it cues (a stalled frame delays both alike).
    if (s.current.start < 0) s.current.start = clock.elapsedTime
    const f = photoAt(clock.elapsedTime - s.current.start)
    if (f.count !== s.current.count) {
      s.current.count = f.count
      usePhoto.setState({ count: f.count })
      drawScreen(app.ctx, f.count)
      app.texture.needsUpdate = true
    }
    // The countdown starts: everyone in the frame now turns to the lens and poses.
    if (f.posing && !s.current.cued) {
      s.current.cued = true
      photoCue.id++
      photoCue.at = clock.elapsedTime
    }
    if (f.done) {
      g.visible = false
      photoDone()
      return
    }
    // The shutter: this frame is drawn without the phone and read back.
    if (f.shutter && !s.current.shot) {
      s.current.shot = true
      g.visible = false
      photoCapture.want = true
      photoShot()
      return
    }
    g.visible = photoHand
    if (!photoHand) return
    // Hangs on the body, like the hands (CameraRig wrote it this frame).
    g.matrix.copy(cameraBody)
    g.matrixWorldNeedsUpdate = true
    const pose = phonePose(f.up, f.jolt, { aspect, fov: camera.fov })
    p.position.set(...pose.position)
    p.quaternion.set(...pose.quaternion)
  })

  return (
    <group ref={group} matrixAutoUpdate={false} visible={false}>
      <group ref={phone}>
        {/* The mask first (opaque pass, lowest order): marks the screen in the stencil. */}
        <mesh geometry={mask.geo} material={mask.mat} renderOrder={-10} raycast={noRaycast} />
        <mesh geometry={geometry} material={material} raycast={noRaycast} />
        <mesh geometry={app.geo} material={app.mat} raycast={noRaycast} />
      </group>
    </group>
  )
}
