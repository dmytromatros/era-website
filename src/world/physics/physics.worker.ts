/// <reference lib="webworker" />
/**
 * The physics of C2 in its own thread (docs/wow-plan.md: heavy work off the main thread): a Rapier
 * world with the props (balls, boxes), the static office near them, the characters as capsules.
 * The page sends a 'step' only while something can move (a prop is awake, the camera is near one,
 * or a click arrived) — otherwise this thread sleeps. Fixed steps (60 or 30 a second), so the
 * motion is the same on every device; the page interpolates between the last two poses.
 */
import RAPIER from '@dimforge/rapier3d-compat'
import { POSE_FLOATS, type ActorCollider, type FromWorker, type ToWorker } from './protocol'
import type { PropBody, StaticShape } from './propsModel'

/** The camera's "body": props inside this radius are moved aside (no hard hit at flight speed). */
const PUSH_RADIUS = 0.85
const PUSH_SPEED = 2.6
/** Contact force (N) from which an impact counts as hard (puff of dust, squash). */
const IMPACT_FORCE = 18
/** A character reacts to a prop arriving faster than this (m/s), at most once per this many seconds. */
const HIT_SPEED = 1.4
const HIT_COOLDOWN = 1.5
const MAX_STEPS = 4

const scope = self as unknown as DedicatedWorkerGlobalScope
const post = (m: FromWorker, transfer: Transferable[] = []) => scope.postMessage(m, transfer)

let world: RAPIER.World | null = null
let queue: RAPIER.EventQueue | null = null
let step = 1 / 60
let acc = 0
let simTime = 0
const bodies: { rb: RAPIER.RigidBody; def: PropBody; lastImpact: number }[] = []
const bodyByCollider = new Map<number, number>()
const actorByCollider = new Map<number, number>()
const lastHit: number[] = []
let prev = new Float32Array(0)

const yawQuat = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })

function addStatic(w: RAPIER.World, s: StaticShape) {
  const desc =
    s.shape === 'box'
      ? RAPIER.ColliderDesc.cuboid(s.half[0], s.half[1], s.half[2])
      : s.shape === 'cyl'
        ? RAPIER.ColliderDesc.cylinder(s.half[1], s.half[0])
        : RAPIER.ColliderDesc.ball(s.half[0])
  desc.setTranslation(s.pos[0], s.pos[1], s.pos[2]).setRotation(yawQuat(s.yaw)).setFriction(0.7).setRestitution(0.3)
  w.createCollider(desc)
}

function addActor(w: RAPIER.World, a: ActorCollider, i: number) {
  const half = Math.max(0.01, a.height / 2 - a.radius)
  const desc = RAPIER.ColliderDesc.capsule(half, a.radius)
    .setTranslation(a.at[0], a.at[1] + a.height / 2, a.at[2])
    .setRestitution(0.5)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
  actorByCollider.set(w.createCollider(desc).handle, i)
  lastHit[i] = -Infinity
}

function addBody(w: RAPIER.World, def: PropBody, i: number) {
  const rb = w.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(def.pos[0], def.pos[1], def.pos[2])
      .setRotation(yawQuat(def.yaw))
      .setLinearDamping(def.kind === 'ball' ? 0.15 : 0.3)
      .setAngularDamping(def.kind === 'ball' ? 0.6 : 0.9)
      .setCcdEnabled(def.kind === 'ball')
      // start asleep: a resting stack costs nothing until something touches it
      .setSleeping(true),
  )
  const desc =
    def.kind === 'ball'
      ? RAPIER.ColliderDesc.ball(def.half[0]).setRestitution(0.72).setFriction(0.5).setDensity(12)
      : RAPIER.ColliderDesc.cuboid(def.half[0], def.half[1], def.half[2]).setRestitution(0.15).setFriction(0.75).setDensity(8)
  desc.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(IMPACT_FORCE)
  bodyByCollider.set(w.createCollider(desc, rb).handle, i)
  bodies.push({ rb, def, lastImpact: -Infinity })
}

function writePose(target: Float32Array, offset: number, rb: RAPIER.RigidBody) {
  const t = rb.translation()
  const q = rb.rotation()
  target[offset] = t.x
  target[offset + 1] = t.y
  target[offset + 2] = t.z
  target[offset + 3] = q.x
  target[offset + 4] = q.y
  target[offset + 5] = q.z
  target[offset + 6] = q.w
}

/** Props near the camera's feet-to-eye column slide out of its way. */
function pushAside(camera: [number, number, number]) {
  for (const b of bodies) {
    const t = b.rb.translation()
    if (t.y > camera[1] || t.y < camera[1] - 2.2) continue
    const dx = t.x - camera[0]
    const dz = t.z - camera[2]
    const d = Math.hypot(dx, dz)
    if (d > PUSH_RADIUS + b.def.half[0]) continue
    const nx = d > 1e-3 ? dx / d : 1
    const nz = d > 1e-3 ? dz / d : 0
    const v = b.rb.linvel()
    const away = v.x * nx + v.z * nz
    if (away >= PUSH_SPEED) continue
    const add = PUSH_SPEED - away
    b.rb.setLinvel({ x: v.x + nx * add, y: Math.max(v.y, b.def.kind === 'ball' ? 0.9 : 0.35), z: v.z + nz * add }, true)
  }
}

function stepWorld(dt: number, camera: [number, number, number], impacts: number[], hits: number[]) {
  const w = world!
  const q = queue!
  acc += Math.min(dt, 0.25)
  let n = 0
  while (acc >= step && n < MAX_STEPS) {
    bodies.forEach((b, i) => writePose(prev, i * 7, b.rb))
    pushAside(camera)
    w.step(q)
    simTime += step
    q.drainCollisionEvents((h1, h2, started) => {
      if (!started) return
      const actor = actorByCollider.get(h1) ?? actorByCollider.get(h2)
      const body = bodyByCollider.get(h1) ?? bodyByCollider.get(h2)
      if (actor === undefined || body === undefined) return
      const v = bodies[body]!.rb.linvel()
      if (Math.hypot(v.x, v.y, v.z) < HIT_SPEED || simTime - lastHit[actor]! < HIT_COOLDOWN) return
      lastHit[actor] = simTime
      hits.push(actor)
    })
    q.drainContactForceEvents((e) => {
      const i = bodyByCollider.get(e.collider1()) ?? bodyByCollider.get(e.collider2())
      if (i === undefined) return
      const b = bodies[i]!
      if (simTime - b.lastImpact < 0.25) return
      b.lastImpact = simTime
      const t = b.rb.translation()
      const strength = Math.min(1, (e.maxForceMagnitude() - IMPACT_FORCE) / (IMPACT_FORCE * 5))
      impacts.push(t.x, t.y - b.def.half[1], t.z, Math.max(0.1, strength))
    })
    acc -= step
    n++
  }
  if (n === MAX_STEPS) acc = 0 // far behind (slow device): drop the backlog instead of spiralling
}

scope.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data
  if (m.type === 'init') {
    await RAPIER.init()
    const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    step = 1 / m.hz
    w.timestep = step
    // floor and ceiling
    w.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0).setFriction(0.8))
    w.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, m.ceilingY + 0.5, 0))
    for (const s of m.statics) addStatic(w, s)
    m.actors.forEach((a, i) => addActor(w, a, i))
    m.bodies.forEach((b, i) => addBody(w, b, i))
    world = w
    queue = new RAPIER.EventQueue(true)
    // Settle: the first steps create every contact pair, which wakes every body. Do them now,
    // then put everything to sleep — the first click wakes only what it touches.
    for (let i = 0; i < 4; i++) w.step(queue)
    for (const b of bodies) b.rb.sleep()
    prev = new Float32Array(bodies.length * 7)
    const buffer = new Float32Array(bodies.length * POSE_FLOATS)
    bodies.forEach((b, i) => {
      writePose(buffer, i * POSE_FLOATS, b.rb)
      writePose(buffer, i * POSE_FLOATS + 7, b.rb)
    })
    post({ type: 'ready', buffer }, [buffer.buffer])
    return
  }
  if (m.type === 'hz') {
    step = 1 / m.hz
    if (world) world.timestep = step
    return
  }
  if (!world) return
  const started = performance.now()
  for (const p of m.pushes) {
    const b = bodies[p.body]
    if (!b) continue
    const mass = b.rb.mass()
    b.rb.applyImpulseAtPoint(
      { x: p.dv[0] * mass, y: p.dv[1] * mass, z: p.dv[2] * mass },
      { x: p.point[0], y: p.point[1], z: p.point[2] },
      true,
    )
  }
  const impacts: number[] = []
  const hits: number[] = []
  stepWorld(m.dt, m.camera, impacts, hits)
  const buffer = m.buffer.length === bodies.length * POSE_FLOATS ? m.buffer : new Float32Array(bodies.length * POSE_FLOATS)
  bodies.forEach((b, i) => {
    buffer.set(prev.subarray(i * 7, i * 7 + 7), i * POSE_FLOATS)
    writePose(buffer, i * POSE_FLOATS + 7, b.rb)
  })
  let awake = 0
  for (const b of bodies) if (!b.rb.isSleeping()) awake++
  post(
    { type: 'state', buffer, alpha: acc / step, awake, ms: performance.now() - started, impacts, hits },
    [buffer.buffer],
  )
}
