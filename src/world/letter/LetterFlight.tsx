'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { LetterForm } from '@/content/schema'
import { actionTarget } from '@/experience/elementActions'
import { letterShowDone, useLetter } from '@/experience/letter/letterState'
import { useExperience } from '@/experience/store'
import { warmPrograms } from '../precompile'
import { useQualitySettings } from '../quality'
import { useStylePreset } from '../style'
import { applyToon } from '../toonMaterial'
import { cueThrower, letterCam, thrower, useLetterShow } from './letterShow'
import { bezier, creasesOf, eased, foldAt, foldPoint, SHOW, type Vec3 } from './planeModel'

const noRaycast = () => null
const COLS = 20
const ROWS = 28
/** The sheet's width when it is in the helper's hands (m): big enough to read the folds. */
const HELD_WIDTH = 0.46
/** How far in front of the camera the sheet starts when there is no card to start from (m). */
const START_DISTANCE = 1.2

const v = (a: THREE.Vector3): Vec3 => [a.x, a.y, a.z]
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]

interface Card {
  object: THREE.Object3D
  center: THREE.Vector3
  normal: THREE.Vector3
  quaternion: THREE.Quaternion
  width: number
  height: number
  eye: Vec3
  look: Vec3
}

interface Run {
  start: number
  /** Where the sheet starts (world: on the card, just off it), its width there and turn. */
  from: Vec3
  fromWidth: number
  fromQ: THREE.Quaternion
  hands: Vec3
  /** Above and in front of the helper's face: the sheet comes in from there (never through him). */
  approach: Vec3
  /** Unit, from the helper towards the camera side (his front) — the plane leaves that way. */
  front: Vec3
  cued: Set<string>
  /** The flight, worked out at the wind-up (the camera is back on the rail then). */
  path: { p0: Vec3; p1: Vec3; p2: Vec3; p3: Vec3; aimQ: THREE.Quaternion; eye: Vec3; look: Vec3 } | null
}

/**
 * The letter's 3D show (wow-plan E9), mounted while the visitor writes on the stand (its program
 * is compiled then) and while it plays: the camera up to the stand; the written sheet peels off
 * it to the helper, who folds it into a paper plane (a 20 × 28 grid folded on the CPU,
 * planeModel.foldPoint) and throws it; it loops across the office and away into the distance,
 * the camera turning its head after it (Dima 2026-11-19: no window gag, no chase — "just turn the
 * head towards the plane"). One mesh. The timing: planeModel.SHOW, on the scene clock.
 */
export function LetterFlight({ texts }: { texts: LetterForm }) {
  const preset = useStylePreset()
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const { letterFold } = useQualitySettings()
  const sheetMesh = useRef<THREE.Mesh>(null)
  const run = useRef<Run | null>(null)

  // The paper: lit like the office (toon), and lit from within at first, so the moment it takes
  // the form's place on the card it looks like it; both sides printed (it is paper).
  const blank = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 4
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fffdf6'
    ctx.fillRect(0, 0, 4, 4)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const paper = useMemo(
    () => new THREE.MeshStandardMaterial({ map: blank, emissiveMap: blank, emissive: new THREE.Color('#ffffff'), side: THREE.DoubleSide, roughness: 0.9 }),
    [blank],
  )
  useLayoutEffect(() => applyToon(paper, preset), [paper, preset])

  // The grid of the sheet, built to the written sheet's proportions; the flat (x, y) kept.
  const sheet = useLetter((s) => s.sheet)
  const ratio = sheet ? sheet.rect.height / sheet.rect.width : 1.3
  const grid = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, ratio, COLS, ROWS)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const flat = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      flat[i * 2] = pos.getX(i)
      flat[i * 2 + 1] = pos.getY(i)
    }
    return { g, flat, creases: creasesOf(ratio) }
  }, [ratio])
  const texture = useMemo(() => {
    if (!sheet) return null
    const t = new THREE.CanvasTexture(sheet.picture)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [sheet])
  useEffect(() => {
    paper.map = texture ?? blank
    paper.emissiveMap = texture ?? blank
  }, [paper, texture, blank])

  useEffect(() => () => grid.g.dispose(), [grid])
  useEffect(() => () => texture?.dispose(), [texture])

  // The writing: the camera up to the card; the card's rect on the screen once there; the card
  // hidden while the form lies on it (the form is the card then — no double edge).
  const dive = useRef<{ start: number; card: Card | null; rectAt: number } | null>(null)
  const showCard = () => {
    const c = dive.current?.card
    if (c) c.object.visible = true
  }

  useEffect(
    () => () => {
      paper.dispose()
      blank.dispose()
      showCard()
      letterCam.weight = 0
      document.documentElement.removeAttribute('data-letter-3d')
      useLetterShow.setState({ line: null, cardRect: null, returning: false })
    },
    [paper, blank],
  )

  // Compile the paper's program while the visitor writes.
  useEffect(() => {
    let cancelled = false
    const proxies = new THREE.Scene()
    proxies.add(new THREE.Mesh(grid.g, paper))
    const timer = setTimeout(() => void warmPrograms(gl, scene, camera, proxies, () => cancelled), 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, [])

  // `?debug=1` → window.__eraLetter: the show's state, the camera it borrows.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return
    const w = window as unknown as Record<string, unknown>
    w.__eraLetter = { run: () => run.current, cam: () => ({ ...letterCam }), state: () => ({ ...useLetter.getState(), show: useLetterShow.getState() }) }
    return () => {
      delete w.__eraLetter
    }
  }, [])

  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), m: new THREE.Matrix4(), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() }), [])

  /** Orientation of the plane flying along `vel` (its nose is +y, its up +z), banked. */
  const flying = (vel: THREE.Vector3, bank: number, out: THREE.Quaternion) => {
    const y = tmp.a.copy(vel).normalize()
    const up = tmp.b.set(0, 1, 0)
    const x = tmp.c.crossVectors(y, up)
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0)
    x.normalize()
    const z = up.crossVectors(x, y).normalize()
    tmp.m.makeBasis(x, y, z)
    out.setFromRotationMatrix(tmp.m)
    if (bank) out.multiply(tmp.q.setFromAxisAngle(y.set(0, 1, 0), bank))
    return out
  }

  /** The letter card on its stand (its 3D object, elementActions) and where to see it from. */
  const findCard = (): Card | null => {
    const target = actionTarget<{ object: THREE.Object3D; width: number; height: number }>('letter')
    if (!target || !target.width) return null
    const obj = target.object
    obj.updateWorldMatrix(true, false)
    const quaternion = obj.getWorldQuaternion(new THREE.Quaternion())
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion)
    // Its front face (the slab is 5 cm deep, ElementView), where it rests (its parent's origin:
    // the card itself may still be lifted by a hover easing out — none while writing).
    const center = (obj.parent ?? obj).getWorldPosition(new THREE.Vector3()).addScaledVector(normal, 0.025)
    const { width, height } = target
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const aspect = size.width / size.height
    // The card fills most of the frame, a little above the middle (room for Cancel below).
    const dist = Math.max(height / (0.72 * 2 * tan), width / (0.8 * 2 * tan * aspect))
    const look = center.clone().addScaledVector(new THREE.Vector3(0, 1, 0), -height * 0.06)
    const eye = look.clone().addScaledVector(normal, dist)
    return { object: obj, center, normal, quaternion, width, height, eye: v(eye), look: v(look) }
  }

  useFrame(({ clock }, delta) => {
    const mesh = sheetMesh.current
    if (!mesh) return
    const st = useLetter.getState()
    const now = clock.elapsedTime
    const dt = Math.min(delta, 0.1)

    // ---- writing: the camera flies up to the stand; the form goes onto the card ----
    if (st.phase === 'writing') {
      mesh.visible = false
      if (!dive.current) {
        const card = findCard()
        dive.current = { start: now, card, rectAt: -1 }
        useLetterShow.setState({ returning: true, cardRect: null })
        if (card) {
          letterCam.eye = card.eye
          letterCam.look = card.look
        }
      }
      const d = dive.current
      if (d.card) {
        letterCam.weight = Math.max(letterCam.weight, eased(now - d.start, [0, SHOW.dive]))
        // Arrived (the rig drew the last step a frame ago): where the card is on the screen.
        if (d.rectAt < 0 && now - d.start > SHOW.dive + 0.08) {
          d.rectAt = now
          const c = d.card
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion)
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion)
          const pts = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => c.center.clone().addScaledVector(right, (sx * c.width) / 2).addScaledVector(up, (sy * c.height) / 2).project(camera)))
          const xs = pts.map((p) => ((p.x + 1) / 2) * size.width)
          const ys = pts.map((p) => ((1 - p.y) / 2) * size.height)
          const x = Math.min(...xs)
          const y = Math.min(...ys)
          useLetterShow.setState({ cardRect: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y } })
        }
        // The form is on the screen (a couple of frames later): the 3D card under it goes.
        if (d.rectAt >= 0 && now - d.rectAt > 0.06) d.card.object.visible = false
      } else if (d.rectAt < 0) {
        // No card object (should not happen): the form in the middle of the screen, no flight.
        d.rectAt = now
        const w = Math.min(460, size.width - 32)
        useLetterShow.setState({ cardRect: { x: (size.width - w) / 2, y: Math.max(16, size.height * 0.12), width: w, height: w } })
      }
      return
    }

    // ---- closed without sending: the card back, the camera back to the rail ----
    if (st.phase !== 'flying' || !st.sheet || !texture) {
      mesh.visible = false
      showCard()
      dive.current = null
      if (letterCam.weight > 0) letterCam.weight = Math.max(0, letterCam.weight - dt / SHOW.undive)
      if (letterCam.weight === 0 && useLetterShow.getState().returning) useLetterShow.setState({ returning: false, cardRect: null })
      return
    }

    // ---- the first frame of the show: the sheet takes the form's place on the card ----
    if (!run.current) {
      const card = dive.current?.card ?? findCard()
      const r = st.sheet.rect
      let from: Vec3
      let fromWidth: number
      let fromQ: THREE.Quaternion
      if (card) {
        from = v(card.center.clone().addScaledVector(card.normal, 0.01))
        fromWidth = card.width
        fromQ = card.quaternion.clone()
      } else {
        const k = (2 * START_DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / size.height
        from = v(new THREE.Vector3((r.x + r.width / 2 - size.width / 2) * k, -(r.y + r.height / 2 - size.height / 2) * k, -START_DISTANCE).applyMatrix4(camera.matrixWorld))
        fromWidth = r.width * k
        fromQ = camera.quaternion.clone()
      }
      // A fresh sheet on the stand behind it.
      showCard()
      // The helper's hands: well in front of his chest (the sheet is 46 cm wide, his face is 23 cm
      // forward of his spine), and the way in: over and in front of him, not through his head.
      const anchor = thrower.anchor
      let hands: Vec3
      let approach: Vec3
      let front: Vec3
      if (anchor) {
        anchor.updateWorldMatrix(true, false)
        const s = thrower.scale
        hands = v(new THREE.Vector3(0, 1.08 * s, 0.6).applyMatrix4(anchor.matrixWorld))
        approach = v(new THREE.Vector3(0, 1.95 * s, 1.1).applyMatrix4(anchor.matrixWorld))
        front = v(new THREE.Vector3(0, 0, 1).transformDirection(anchor.matrixWorld).setY(0).normalize())
      } else {
        hands = v(new THREE.Vector3(0, -0.2, -3).applyMatrix4(camera.matrixWorld))
        approach = add(hands, [0, 0.9, 0])
        front = v(camera.getWorldDirection(new THREE.Vector3()).negate().setY(0).normalize())
      }
      run.current = { start: now, from, fromWidth, fromQ, hands, approach, front, cued: new Set(), path: null }
      // The swap: this frame draws the 3D sheet where the form was; the ripple hides the seam.
      document.documentElement.setAttribute('data-letter-3d', '')
      useExperience.getState().ripple?.()
    }
    const R = run.current
    const t = now - R.start
    const once = (key: string, at: number, fn: () => void) => {
      if (t >= at && !R.cued.has(key)) {
        R.cued.add(key)
        fn()
      }
    }
    mesh.visible = true
    const pos = new THREE.Vector3()
    let scale = HELD_WIDTH
    const camPos = camera.position

    // The camera: back from the card to the rail while the sheet goes to the hands.
    let camW = t < SHOW.toHands[1] ? 1 - eased(t, SHOW.toHands) : 0
    if (t < SHOW.toHands[1] && dive.current?.card) {
      letterCam.eye = dive.current.card.eye
      letterCam.look = dive.current.card.look
    }

    // ---- off the stand, to the hands: it peels off, arcs over, shrinks to paper size ----
    if (t < SHOW.toHands[1]) {
      const k = eased(t, SHOW.toHands)
      pos.set(...bezier(R.from, add(R.from, [0, 0.45, 0]), R.approach, R.hands, k))
      scale = THREE.MathUtils.lerp(R.fromWidth, HELD_WIDTH, k)
      mesh.position.copy(pos)
      mesh.lookAt(camPos)
      tmp.q.copy(mesh.quaternion)
      mesh.quaternion.slerpQuaternions(R.fromQ, tmp.q, k)
      // Peeling: tips back about its top edge first, then flutters.
      mesh.rotateX(-Math.sin(Math.min(k * 2, 1) * Math.PI) * 0.6)
      mesh.rotateZ(Math.sin(k * Math.PI) * 0.35)
      // From lit-from-within (the flat form) to lit by the office.
      paper.emissiveIntensity = 1 - 0.65 * k
      paper.color.setScalar(k)
    } else if (t < SHOW.windup[0]) {
      // ---- folding in the hands ----
      once('fold', SHOW.fold[0], () => cueThrower('fold'))
      pos.set(R.hands[0], R.hands[1] + Math.sin(t * 9) * 0.01, R.hands[2])
      mesh.position.copy(pos)
      mesh.lookAt(camPos)
      paper.emissiveIntensity = 0.35
      paper.color.setScalar(1)
    }

    // The fold itself (corners, sides, in half, wings out); flat before it.
    const attr = grid.g.getAttribute('position') as THREE.BufferAttribute
    if (t < SHOW.fold[1] + 0.05 || !R.cued.has('folded')) {
      const f = foldAt(t, letterFold)
      for (let i = 0; i < attr.count; i++) {
        const p = foldPoint(grid.flat[i * 2]!, grid.flat[i * 2 + 1]!, grid.creases, f)
        attr.setXYZ(i, p[0], p[1], p[2])
      }
      attr.needsUpdate = true
      grid.g.computeVertexNormals()
      if (t >= SHOW.fold[1] + 0.05) R.cued.add('folded')
    }

    if (t >= SHOW.windup[0]) {
      // The way: from the hands up over to one side, a loop, and away into the depth of the
      // office — worked out from the camera on the rail (it is back there by now).
      if (!R.path) {
        const fwd = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
        // Out over the side the helper is not on (the open side of the frame) — first up and
        // sideways in front of him (towards his front, never back through him), then away.
        const side = R.hands[0] * right.x + R.hands[2] * right.z < camPos.x * right.x + camPos.z * right.z ? 1 : -1
        const p0 = add(add(R.hands, [0, 0.4, 0]), R.front, 0.25)
        const p3 = add(add(v(camPos), v(fwd), 30), [0, 3.5, 0])
        const p1 = add(add(add(p0, v(right), side * 5), R.front, 1.2), [0, 3.2, 0])
        const p2 = add(add(add(p3, v(right), -side * 7), v(fwd), -9), [0, -1.5, 0])
        const aimQ = flying(new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), 0, new THREE.Quaternion())
        R.path = { p0, p1, p2, p3, aimQ, eye: v(camPos), look: v(camPos.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 8)) }
        letterCam.eye = R.path.eye
        letterCam.look = R.path.look
      }
      const P = R.path
      if (t < SHOW.away[0]) {
        // ---- the wind-up: back and up, the nose turning to where it goes ----
        once('throw', SHOW.windup[0], () => cueThrower('throw'))
        const k = eased(t, SHOW.windup)
        pos.set(...bezier(R.hands, add(R.hands, [0, 0.3, 0]), P.p0, P.p0, k))
        mesh.position.copy(pos)
        mesh.lookAt(camPos)
        mesh.quaternion.slerp(P.aimQ, k)
      } else {
        // ---- away: a loop across the office into the distance, getting smaller ----
        const k = eased(t, SHOW.away)
        pos.set(...bezier(P.p0, P.p1, P.p2, P.p3, k))
        const ahead = new THREE.Vector3(...bezier(P.p0, P.p1, P.p2, P.p3, Math.min(k + 0.02, 1))).sub(pos)
        if (ahead.lengthSq() > 1e-8) flying(ahead, Math.sin(k * Math.PI * 2) * 0.55, mesh.quaternion)
        mesh.position.copy(pos)
        scale = HELD_WIDTH * (1 - 0.45 * k)
        if (t >= SHOW.away[1]) mesh.visible = false
      }
      // ---- the camera stays put and turns its head after the plane, smoothly, then back ----
      const turn = eased(t, SHOW.look) * (1 - eased(t, SHOW.lookBack))
      if (turn > 0) {
        const target = t < SHOW.away[1] ? v(pos) : P.look
        // A head turning: follows, does not snap (and never jerks with the plane's wiggles).
        const e = 1 - Math.exp(-dt * 3.2)
        letterCam.eye = P.eye
        letterCam.look = [letterCam.look[0] + (target[0] - letterCam.look[0]) * e, letterCam.look[1] + (target[1] - letterCam.look[1]) * e, letterCam.look[2] + (target[2] - letterCam.look[2]) * e]
        camW = turn
      }
      once('delivered', SHOW.delivered, () => {
        useLetterShow.setState({ line: texts.delivered })
        cueThrower('jump', '🎉')
      })
    }
    letterCam.weight = camW
    mesh.scale.setScalar(scale)

    if (t >= SHOW.end) {
      mesh.visible = false
      run.current = null
      dive.current = null
      letterCam.weight = 0
      useLetterShow.setState({ cardRect: null, returning: false })
      document.documentElement.removeAttribute('data-letter-3d')
      letterShowDone()
      window.setTimeout(() => useLetterShow.setState({ line: null }), SHOW.lineAfter * 1000)
    }
  })

  return <mesh ref={sheetMesh} geometry={grid.g} material={paper} visible={false} frustumCulled={false} raycast={noRaycast} />
}
