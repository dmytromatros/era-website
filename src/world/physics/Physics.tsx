'use client'

/**
 * Balls and box stacks you can push (docs/wow-plan.md, C2). The simulation lives in a worker
 * (physics.worker.ts, Rapier); this component draws the props and talks to it.
 *
 * Cost, by design (CLAUDE.md section 0):
 * - Rapier (≈ 1.7 MB compressed) loads only when the camera is about a stop away from the first
 *   prop (or on the first click) — never on the 2D landing.
 * - The worker runs only while something can move: a prop awake, the camera near one, or a click.
 *   Props start asleep; a still page sends nothing.
 * - One instanced draw call per kind: balls, boxes, their soft shadows, dust puffs (only while
 *   one is in the air). Matrices are rewritten only when something moved.
 */
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { emitActorHit } from '@/actors/hits'
import { live, useExperience } from '@/experience/store'
import { useTheme } from '@/theme/store'
import { QUALITY, useQuality } from '../quality'
import type { Timing } from '../route'
import { timeline } from '../timeline'
import { StyledMaterial } from '../toonMaterial'
import { POSE_FLOATS, type ActorCollider, type FromWorker, type ToWorker } from './protocol'
import type { PropBody, StaticShape } from './propsModel'

/** Live numbers for the X-ray panel. */
export const physicsStats = { state: 'off' as 'off' | 'loading' | 'on', bodies: 0, awake: 0, ms: 0, impacts: 0, hits: 0 }

/* ------------------------------------------------------------------ geometry */

const BALL_COLORS = ['#ffffff', '#ff5d73', '#ffffff', '#ffc93c', '#ffffff', '#3fa7ff'].map((c) => new THREE.Color(c))

/** A beach ball: six coloured segments, white caps — so you can see it roll. Radius 1. */
function ballGeometry(): THREE.BufferGeometry {
  // (an icosahedron is already non-indexed: one colour per triangle works as is)
  const g = new THREE.IcosahedronGeometry(1, 3)
  const pos = g.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 3) {
    c.set(0, 0, 0)
    for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(pos, i + k))
    c.divideScalar(3)
    const seg = Math.floor(((Math.atan2(c.z, c.x) + Math.PI) / (Math.PI * 2)) * 6) % 6
    const col = Math.abs(c.normalize().y) > 0.88 ? BALL_COLORS[0]! : BALL_COLORS[seg]!
    for (let k = 0; k < 3; k++) col.toArray(colors, (i + k) * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

/** A cardboard box with a strip of tape over the top (vertex colours × the box's tone). Unit cube. */
function boxGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 3, 2, 3).toNonIndexed()
  const pos = g.getAttribute('position')
  const nrm = g.getAttribute('normal')
  const colors = new Float32Array(pos.count * 3)
  const tape = new THREE.Color(0.78, 0.74, 0.66)
  const plain = new THREE.Color(1, 1, 1)
  for (let i = 0; i < pos.count; i += 3) {
    let cx = 0
    let cy = 0
    for (let k = 0; k < 3; k++) {
      cx += pos.getX(i + k) / 3
      cy += pos.getY(i + k) / 3
    }
    const top = nrm.getY(i) > 0.5
    const side = Math.abs(nrm.getZ(i)) > 0.5
    const col = Math.abs(cx) < 0.17 && (top || (side && cy > 0)) ? tape : plain
    for (let k = 0; k < 3; k++) col.toArray(colors, (i + k) * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

const BOX_TONES = ['#c99b62', '#d8ae74', '#b98a55'].map((c) => new THREE.Color(c))
const PUFFS = 16
const PUFF_LIFE = 0.45

/* ------------------------------------------------------------------ squash */

/** Squash on impact: a spring on how flat the ball is (0 = round). */
interface Squash {
  x: number
  v: number
}

/* ------------------------------------------------------------------ component */

interface Props {
  bodies: PropBody[]
  statics: StaticShape[]
  actors: ActorCollider[]
  /** Hit keys of `actors` (same order). */
  actorKeys: string[]
  /** From this rail index on, the worker starts loading. */
  wakeRail: number
  timing: Timing
  ceilingY: number
}

const _m = new THREE.Matrix4()
const _s = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _v = new THREE.Vector3()
const _sc = new THREE.Vector3()

export function Physics({ bodies, statics, actors, actorKeys, wakeRail, timing, ceilingY }: Props) {
  const { world: themeWorld } = useTheme()
  const ballGeo = useMemo(() => ballGeometry(), [])
  const boxGeo = useMemo(() => boxGeometry(), [])
  const shadowGeo = useMemo(() => new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), [])
  const puffGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), [])
  useEffect(
    () => () => {
      for (const g of [ballGeo, boxGeo, shadowGeo, puffGeo]) g.dispose()
    },
    [ballGeo, boxGeo, shadowGeo, puffGeo],
  )

  const balls = useMemo(() => bodies.flatMap((b, i) => (b.kind === 'ball' ? [i] : [])), [bodies])
  const boxes = useMemo(() => bodies.flatMap((b, i) => (b.kind === 'box' ? [i] : [])), [bodies])
  const ballMesh = useRef<THREE.InstancedMesh>(null)
  const boxMesh = useRef<THREE.InstancedMesh>(null)
  const shadowMesh = useRef<THREE.InstancedMesh>(null)
  const puffMesh = useRef<THREE.InstancedMesh>(null)

  const sim = useRef({
    worker: null as Worker | null,
    ready: false,
    inFlight: false,
    buffer: null as Float32Array | null,
    /** Last pose received (prev + current per body), and the blend between them. */
    pose: null as Float32Array | null,
    alpha: 1,
    awake: 0,
    sinceSent: 0,
    pushes: [] as { body: number; dv: [number, number, number]; point: [number, number, number] }[],
    dirty: true,
    squash: bodies.map((): Squash => ({ x: 0, v: 0 })),
    puffs: Array.from({ length: PUFFS }, () => ({ at: new THREE.Vector3(), start: -Infinity, size: 0 })),
    nextPuff: 0,
    hz: 0,
  })

  // Rest pose until the worker reports (the props stand there from the start).
  const restPose = useMemo(() => {
    const buf = new Float32Array(bodies.length * POSE_FLOATS)
    bodies.forEach((b, i) => {
      _q.setFromAxisAngle(_v.set(0, 1, 0), b.yaw)
      for (const o of [0, 7]) {
        buf.set(b.pos, i * POSE_FLOATS + o)
        buf.set([_q.x, _q.y, _q.z, _q.w], i * POSE_FLOATS + o + 3)
      }
    })
    return buf
  }, [bodies])

  const start = () => {
    const s = sim.current
    if (s.worker || !bodies.length) return
    physicsStats.state = 'loading'
    physicsStats.bodies = bodies.length
    const w = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' })
    s.worker = w
    s.hz = QUALITY[useQuality.getState().level].physicsHz
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data
      if (m.type === 'ready') {
        s.ready = true
        s.buffer = m.buffer
        s.pose = m.buffer.slice()
        physicsStats.state = 'on'
        return
      }
      s.inFlight = false
      s.buffer = m.buffer
      s.pose ??= new Float32Array(m.buffer.length)
      s.pose.set(m.buffer)
      s.alpha = m.alpha
      s.awake = m.awake
      s.dirty = true
      physicsStats.awake = m.awake
      physicsStats.ms = m.ms
      for (let i = 0; i < m.impacts.length; i += 4) impact(m.impacts[i]!, m.impacts[i + 1]!, m.impacts[i + 2]!, m.impacts[i + 3]!)
      for (const a of m.hits) {
        physicsStats.hits++
        emitActorHit(actorKeys[a]!)
      }
    }
    const init: ToWorker = { type: 'init', statics, bodies, actors, ceilingY, hz: s.hz }
    w.postMessage(init)
  }

  /** Dust puff at an impact, and a squash for the ball that made it. */
  const impact = (x: number, y: number, z: number, strength: number) => {
    const s = sim.current
    physicsStats.impacts++
    const p = s.puffs[s.nextPuff++ % PUFFS]!
    p.at.set(x, Math.max(0.03, y), z)
    p.start = performance.now() / 1000
    p.size = 0.07 + strength * 0.12
    // the ball closest to the impact gets squashed
    let best = -1
    let bestD = 0.5
    const pose = s.pose ?? restPose
    for (const i of balls) {
      const o = i * POSE_FLOATS + 7
      const d = Math.hypot(pose[o]! - x, pose[o + 1]! - (y + bodies[i]!.half[1]), pose[o + 2]! - z)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best >= 0) s.squash[best]!.v -= 6 * (0.4 + strength)
  }

  useEffect(
    () => () => {
      sim.current.worker?.terminate()
      sim.current.worker = null
      physicsStats.state = 'off'
      physicsStats.bodies = 0
      physicsStats.awake = 0
    },
    [],
  )

  // Instance colours, once: box tones; white for balls and puffs. Not for looks only — the same
  // attributes as the boxes / the office give the same shader program (no extra compiles).
  useEffect(() => {
    const white = new THREE.Color(1, 1, 1)
    const b = boxMesh.current
    if (b) {
      boxes.forEach((bi, k) => b.setColorAt(k, BOX_TONES[bodies[bi]!.tone % BOX_TONES.length]!))
      if (b.instanceColor) b.instanceColor.needsUpdate = true
    }
    const ball = ballMesh.current
    if (ball) {
      balls.forEach((_, k) => ball.setColorAt(k, white))
      if (ball.instanceColor) ball.instanceColor.needsUpdate = true
    }
    const puff = puffMesh.current
    if (puff) {
      for (let k = 0; k < PUFFS * 3; k++) puff.setColorAt(k, white.set('#f4f1ea'))
      if (puff.instanceColor) puff.instanceColor.needsUpdate = true
    }
  }, [boxes, balls, bodies])

  // `?debug=1`: where the props are on screen and what the physics is doing (for checks).
  const debugCamera = useRef<THREE.Camera | null>(null)
  useEffect(() => {
    if (typeof location === 'undefined' || !new URLSearchParams(location.search).has('debug')) return
    const w = window as unknown as { __eraPhysics?: unknown }
    w.__eraPhysics = {
      stats: physicsStats,
      screen: () => {
        const cam = debugCamera.current
        const pose = sim.current.pose ?? restPose
        if (!cam) return []
        return bodies.map((b, i) => {
          const o = i * POSE_FLOATS + 7
          const p = new THREE.Vector3(pose[o]!, pose[o + 1]!, pose[o + 2]!).project(cam)
          return { kind: b.kind, x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, inView: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1 }
        })
      },
    }
    return () => void delete w.__eraPhysics
  }, [bodies, restPose])

  useFrame(({ camera }, delta) => {
    const s = sim.current
    const now = performance.now() / 1000
    debugCamera.current = camera

    // Load once inside 3D, when the camera nears the first prop (never on the 2D landing).
    if (
      !s.worker &&
      useExperience.getState().handedOver &&
      (timeline(live.progress, timing.segments).railIndex >= wakeRail || s.pushes.length)
    ) {
      start()
    }

    // Quality changed: the worker steps at the new rate.
    const hz = QUALITY[useQuality.getState().level].physicsHz
    if (s.worker && s.ready && hz !== s.hz) {
      s.hz = hz
      s.worker.postMessage({ type: 'hz', hz } satisfies ToWorker)
    }

    // Step only while something can move.
    s.sinceSent += Math.min(delta, 0.25)
    const pose = s.pose ?? restPose
    if (s.worker && s.ready && !s.inFlight && s.buffer) {
      let near = false
      for (let i = 0; i < bodies.length && !near; i++) {
        const o = i * POSE_FLOATS + 7
        near = Math.hypot(pose[o]! - camera.position.x, pose[o + 2]! - camera.position.z) < 2.6
      }
      if (s.awake > 0 || s.pushes.length || near) {
        const msg: ToWorker = {
          type: 'step',
          dt: s.sinceSent,
          camera: [camera.position.x, camera.position.y, camera.position.z],
          pushes: s.pushes,
          buffer: s.buffer,
        }
        s.worker.postMessage(msg, [s.buffer.buffer])
        s.buffer = null
        s.inFlight = true
        s.pushes = []
        s.sinceSent = 0
      } else {
        s.sinceSent = 0
      }
    }

    // Squash springs (bouncy, ≈ 0.3 s).
    let squashing = false
    for (const q of s.squash) {
      if (Math.abs(q.x) < 1e-4 && Math.abs(q.v) < 1e-3) continue
      squashing = true
      const dt = Math.min(delta, 0.05)
      q.v += (-260 * q.x - 14 * q.v) * dt
      q.x += q.v * dt
      q.x = Math.max(-0.35, Math.min(0.3, q.x))
    }

    // Matrices: only when something moved.
    if (s.dirty || squashing) {
      s.dirty = false
      const a = s.alpha
      const write = (mesh: THREE.InstancedMesh | null, list: number[], ball: boolean, shadowOffset: number) => {
        if (!mesh) return
        list.forEach((bi, k) => {
          const b = bodies[bi]!
          const o = bi * POSE_FLOATS
          _p.set(
            pose[o]! + (pose[o + 7]! - pose[o]!) * a,
            pose[o + 1]! + (pose[o + 8]! - pose[o + 1]!) * a,
            pose[o + 2]! + (pose[o + 9]! - pose[o + 2]!) * a,
          )
          _q.set(pose[o + 3]!, pose[o + 4]!, pose[o + 5]!, pose[o + 6]!)
          _q2.set(pose[o + 10]!, pose[o + 11]!, pose[o + 12]!, pose[o + 13]!)
          _q.slerp(_q2, a)
          if (ball) {
            // squash in world space (flat against the floor), volume kept
            const sq = s.squash[bi]!.x
            const sy = 1 + sq
            const sxz = 1 / Math.sqrt(Math.max(0.2, sy))
            _m.makeRotationFromQuaternion(_q).scale(_v.set(b.half[0], b.half[0], b.half[0]))
            _s.makeScale(sxz, sy, sxz)
            _m.premultiply(_s)
            // keep the bottom on the floor while squashed
            _m.setPosition(_p.x, _p.y - b.half[0] * (1 - sy), _p.z)
          } else {
            _m.compose(_p, _q, _v.set(b.half[0] * 2, b.half[1] * 2, b.half[2] * 2))
          }
          mesh.setMatrixAt(k, _m)
          // soft shadow under it: smaller and fainter the higher it flies
          const sh = shadowMesh.current
          if (sh) {
            const h = Math.max(0, _p.y - b.half[1])
            const r = Math.max(b.half[0], b.half[2]) * 1.25 * (1 - Math.min(0.6, h / 2.5))
            _m.compose(_v.set(_p.x, 0.006, _p.z), _q2.identity(), _sc.setScalar(r))
            sh.setMatrixAt(shadowOffset + k, _m)
          }
        })
        mesh.instanceMatrix.needsUpdate = true
        // Clicks hit-test against this sphere first: keep it around where the props are now.
        mesh.computeBoundingSphere()
      }
      write(ballMesh.current, balls, true, 0)
      write(boxMesh.current, boxes, false, balls.length)
      if (shadowMesh.current) shadowMesh.current.instanceMatrix.needsUpdate = true
    }

    // Dust puffs (drawn only while one is in the air).
    const pm = puffMesh.current
    if (pm) {
      let n = 0
      for (const p of s.puffs) {
        const age = now - p.start
        if (age < 0 || age > PUFF_LIFE) continue
        const k = age / PUFF_LIFE
        const size = p.size * Math.sin(Math.min(1, k * 2.2) * Math.PI * 0.5) * (1 - k * k)
        for (let j = 0; j < 3; j++) {
          const ang = j * 2.1 + p.start * 7
          _m.compose(
            _v.set(p.at.x + Math.cos(ang) * k * 0.25, p.at.y + k * 0.12, p.at.z + Math.sin(ang) * k * 0.25),
            _q.identity(),
            _sc.setScalar(size * (1 - j * 0.2)),
          )
          if (n < PUFFS * 3) pm.setMatrixAt(n++, _m)
        }
      }
      pm.count = n
      pm.visible = n > 0
      if (n) pm.instanceMatrix.needsUpdate = true
    }
  })

  /** Click / tap: push away from the camera through the point hit (off-centre → it spins). */
  const push = (e: ThreeEvent<MouseEvent>, list: number[], ball: boolean) => {
    if (!useExperience.getState().handedOver || e.instanceId === undefined) return
    e.stopPropagation()
    const body = list[e.instanceId]
    if (body === undefined) return
    const dir = _v.copy(e.point).sub(e.camera.position)
    const h = Math.hypot(dir.x, dir.z) || 1
    const speed = ball ? 4.2 : 2.8
    sim.current.pushes.push({
      body,
      dv: [(dir.x / h) * speed, ball ? 2.6 : 1.3, (dir.z / h) * speed],
      point: [e.point.x, e.point.y, e.point.z],
    })
    if (!sim.current.worker) start()
  }
  const hover = (on: boolean) => {
    if (on && !useExperience.getState().handedOver) return
    document.body.style.cursor = on ? 'pointer' : ''
  }

  if (!bodies.length) return null
  return (
    <group>
      {balls.length > 0 && (
        <instancedMesh
          ref={ballMesh}
          args={[ballGeo, undefined, balls.length]}
          // the mesh's own bounds would be the geometry at the origin: never cull these few
          frustumCulled={false}
          onClick={(e) => push(e, balls, true)}
          onPointerOver={() => hover(true)}
          onPointerOut={() => hover(false)}
        >
          <StyledMaterial vertexColors roughness={0.35} />
        </instancedMesh>
      )}
      {boxes.length > 0 && (
        <instancedMesh
          ref={boxMesh}
          args={[boxGeo, undefined, boxes.length]}
          frustumCulled={false}
          onClick={(e) => push(e, boxes, false)}
          onPointerOver={() => hover(true)}
          onPointerOut={() => hover(false)}
        >
          <StyledMaterial vertexColors roughness={0.85} />
        </instancedMesh>
      )}
      <instancedMesh ref={shadowMesh} args={[shadowGeo, undefined, bodies.length]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial color={themeWorld.shadow} transparent opacity={themeWorld.shadowOpacity * 0.9} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={puffMesh} args={[puffGeo, undefined, PUFFS * 3]} visible={false} frustumCulled={false} raycast={() => null}>
        <StyledMaterial roughness={1} />
      </instancedMesh>
    </group>
  )
}
