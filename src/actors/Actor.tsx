'use client'

import { RoundedBox } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { createRef, useEffect, useMemo, useRef, type ComponentType, type Ref, type RefObject } from 'react'
import * as THREE from 'three'
import type { ActorDef } from '@/content/schema'
import { useExperience } from '@/experience/store'
import { QUALITY, useQuality } from '@/world/quality'
import { StyledMaterial } from '@/world/toonMaterial'
import { accessories } from './accessories'
import { activities, greet, HOLDING_RATE, type PoseContext, type PropProps } from './activities'
import type { ActivityName, ReactionName } from './catalog'
import { EmojiPop, type EmojiShow } from './EmojiPop'
import { lowerBend, solveTwoBone, upperBasis, type V3 } from './ik'
import {
  clickMemory,
  LOOK,
  lookAngles,
  pickReaction,
  spring,
  stance,
  STANCE,
  stepSpring,
  stepWobble,
  wobble,
  wobbleAtRest,
} from './lifeModel'
import { reactions, reactionWeight } from './reactions'
import { BODY, EYES, resetPose, resolveJoints, type Joints } from './rig'

/** Its element relative to the feet (exhibit layout): hands reach for it by IK. */
export interface ActorTarget {
  centre: V3
  bottom: V3
}

interface Props {
  def: ActorDef
  activity: ActivityName
  /** The visitor is here: turn to them and wave. */
  attentive: boolean
  /** Mouth moves while the speech bubble is typing. */
  talking: boolean
  target?: ActorTarget
}

type Palette = ActorDef['palette']

const EYE = '#17171a'
const SHOE = '#232326'
const GREET_SECONDS = 1.8
/** Hands that hold a heading may stretch this much to reach it (cartoon strain). */
const HOLD_STRETCH = 1.25
/** Palms under a held element: this far either side of its centre. */
const HOLD_SPREAD = 0.22
/** Head height (actor units) the look-at aims from. */
const HEAD_Y = BODY.hipY + BODY.neckY + 0.25

function Mat({ color }: { color: string }) {
  return <StyledMaterial color={color} roughness={0.7} />
}

/*
 * Two-bone limbs (C1). The lower sleeve starts a little ABOVE the joint, inside the upper one:
 * same colour and material, so at rest the overlap is invisible (identical pixels win the depth
 * fight either way) and when the joint bends there is no gap at its outer corner.
 */
const OVERLAP = 0.04

function Leg({
  ref,
  shin,
  foot,
  x,
  palette,
}: {
  ref: Ref<THREE.Group>
  shin: Ref<THREE.Group>
  foot: Ref<THREE.Group>
  x: number
  palette: Palette
}) {
  return (
    <group ref={ref} position={[x, BODY.hipY, 0]}>
      <mesh position={[0, -BODY.thigh / 2, 0]}>
        <boxGeometry args={[0.2, BODY.thigh, 0.24]} />
        <Mat color={palette.pants} />
      </mesh>
      <group ref={shin} position={[0, -BODY.thigh, 0]}>
        <mesh position={[0, (OVERLAP - (BODY.hipY - BODY.thigh - 0.02)) / 2, 0]}>
          <boxGeometry args={[0.2, BODY.hipY - BODY.thigh - 0.02 + OVERLAP, 0.24]} />
          <Mat color={palette.pants} />
        </mesh>
        {/* Ankle at the sole: the shoe turns around it to stay flat. */}
        <group ref={foot} position={[0, -BODY.shin, 0]}>
          <mesh position={[0, 0.04, 0.04]}>
            <boxGeometry args={[0.22, 0.08, 0.32]} />
            <Mat color={SHOE} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function Arm({
  ref,
  fore,
  side,
  palette,
  Hand,
}: {
  ref: Ref<THREE.Group>
  fore: Ref<THREE.Group>
  side: -1 | 1
  palette: Palette
  Hand?: ComponentType<PropProps>
}) {
  // Sleeve from +0.01 (just above the shoulder pivot) to −0.49, hand box −0.48…−0.60, as before.
  const upper = BODY.upperArm + 0.01
  const lower = 0.49 - BODY.upperArm + OVERLAP
  return (
    <group ref={ref} position={[side * BODY.shoulderX, BODY.shoulderY, 0]}>
      <mesh position={[0, 0.01 - upper / 2, 0]}>
        <boxGeometry args={[0.17, upper, 0.18]} />
        <Mat color={palette.shirt} />
      </mesh>
      <group ref={fore} position={[0, -BODY.upperArm, 0]}>
        <mesh position={[0, OVERLAP - lower / 2, 0]}>
          <boxGeometry args={[0.17, lower, 0.18]} />
          <Mat color={palette.shirt} />
        </mesh>
        <mesh position={[0, -0.54 + BODY.upperArm, 0]}>
          <boxGeometry args={[0.15, 0.12, 0.16]} />
          <Mat color={palette.skin} />
        </mesh>
        {Hand && (
          <group position={[0, -BODY.foreArm, 0]}>
            <Hand palette={palette} />
          </group>
        )}
      </group>
    </group>
  )
}

/** Stable per-actor phase so idle loops of different characters are not in sync. */
export function phaseOf(id: string): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997
  return h * 0.173
}

/** Mouse-like pointer (hover exists): the characters may follow the cursor. Phones: camera only. */
let hoverDevice: boolean | null = null
const canHover = () =>
  (hoverDevice ??= typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches)

/* Scratch objects for the per-frame math (one character is updated at a time). */
const _v = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _ray = new THREE.Raycaster()
const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _w = new THREE.Vector3()

/** Angle change wrapped to (−π, π]: a full spin that resets to 0 is not a jolt. */
const turnBy = (now: number, before: number) => Math.atan2(Math.sin(now - before), Math.cos(now - before))

/** Point (in the outer actor space, actor units) → space of `group`'s children, through root and torso. */
function toLocal(p: THREE.Vector3, ...chain: THREE.Object3D[]) {
  for (const g of chain) {
    g.updateMatrix()
    p.applyMatrix4(_m.copy(g.matrix).invert())
  }
  return p
}

/**
 * Place a hand at `target` (outer actor space) by IK, blended over the current pose by `w`.
 * `stretch` > 1 lets the arm lengthen to reach.
 */
function reachArm(j: Joints, right: boolean, target: V3, w: number, stretch = 1) {
  if (w <= 0) return
  const arm = right ? j.armR : j.armL
  const fore = right ? j.foreR : j.foreL
  const side = right ? 1 : -1
  toLocal(_v.set(...target), j.root, j.torso).sub(arm.position)
  // Elbows point out, back and down.
  const s = solveTwoBone([_v.x, _v.y, _v.z], BODY.upperArm, BODY.foreArm, [side * 0.6, -0.4, -1], stretch)
  const [bx, by, bz] = upperBasis(s, 'elbow')
  _m.makeBasis(_x.set(...bx), _y.set(...by), _z.set(...bz))
  _q.setFromRotationMatrix(_m)
  arm.quaternion.slerp(_q, w)
  fore.rotation.set(THREE.MathUtils.lerp(fore.rotation.x, lowerBend(s, 'elbow'), w), fore.rotation.y * (1 - w), fore.rotation.z * (1 - w))
  arm.scale.y = THREE.MathUtils.lerp(1, s.stretch, w)
}

const LEG_REACH = BODY.thigh + BODY.shin
/** Legs (and feet at rest) sit this far either side of the middle. */
const FOOT_X = 0.14
const _e = new THREE.Euler()

/**
 * Soles on their spots (`soles`, outer actor space: x, lift, z): knees bend, shoes stay flat, the
 * feet never slide. Standing (`grounded`), the hips first come down just enough that the
 * straighter leg reaches its foot — that is what makes a weight shift look like one. During a
 * click reaction the body may leave the floor: a leg that cannot reach keeps its own pose (hop).
 * The same solver will put walking feet on stairs (later).
 */
function plantFeet(j: Joints, soles: readonly (readonly [number, number, number])[], grounded: boolean) {
  const legs = [
    [j.legL, j.shinL, j.footL],
    [j.legR, j.shinR, j.footR],
  ] as const
  if (grounded) {
    // Lower the hips until both legs reach (a hair short of straight, so knees never lock).
    let drop = 0
    legs.forEach(([leg], i) => {
      toLocal(_v.set(...soles[i]!), j.root).sub(leg.position)
      const r = LEG_REACH * 0.998
      const needY = -Math.sqrt(Math.max(0, r * r - _v.x * _v.x - _v.z * _v.z))
      drop = Math.max(drop, needY - _v.y)
    })
    if (drop > 0 && drop < 0.1) j.root.position.y -= drop
  }
  // Undo the body's tilt (not its turn: a spinning character's feet turn with it).
  _e.set(j.root.rotation.x, 0, j.root.rotation.z)
  const tilt = _q2.setFromEuler(_e)
  legs.forEach(([leg, shin, foot], i) => {
    toLocal(_v.set(...soles[i]!), j.root).sub(leg.position)
    const w = grounded ? 1 : THREE.MathUtils.clamp((LEG_REACH - _v.length()) / 0.02, 0, 1)
    if (w <= 0) return
    const s = solveTwoBone([_v.x, _v.y, _v.z], BODY.thigh, BODY.shin, [0, 0, 1])
    const [bx, by, bz] = upperBasis(s, 'knee')
    _m.makeBasis(_x.set(...bx), _y.set(...by), _z.set(...bz))
    leg.quaternion.slerp(_q.setFromRotationMatrix(_m), w)
    shin.rotation.set(THREE.MathUtils.lerp(shin.rotation.x, lowerBend(s, 'knee'), w), 0, 0)
    // Flat shoe: undo the tilt, the leg's and the shin's rotation.
    _q.copy(tilt).multiply(leg.quaternion).multiply(shin.quaternion).invert()
    foot.quaternion.slerp(_q, w)
  })
}

interface ReactionPlay {
  name: ReactionName
  start: number
}

/**
 * A blocky character built from boxes — no model files. Everything about its look comes
 * from its content file (palette, accessories, activity, reactions), so new characters are pure data.
 *
 * Every frame: activity pose + weight shift → look at the visitor (or the cursor) → hands by IK,
 * click reaction and feet on the floor (in the order the hands need, see below) → greeting →
 * blink/talk → accessories on springs. The springy extras run only while the visitor is near (or
 * a reaction plays); far characters just do their job and shift their weight.
 */
export function Actor({ def, activity, attentive, talking, target }: Props) {
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const foreL = useRef<THREE.Group>(null)
  const foreR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const shinL = useRef<THREE.Group>(null)
  const shinR = useRef<THREE.Group>(null)
  const footL = useRef<THREE.Group>(null)
  const footR = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)
  const mouth = useRef<THREE.Mesh>(null)

  const { palette } = def
  const act = activities[activity]
  const phase = useMemo(() => phaseOf(def.id), [def.id])
  const side: 1 | -1 = target && target.centre[0] < 0 ? -1 : 1
  const ctx = useMemo<PoseContext>(() => ({ side }), [side])

  // Accessories swing around their pivots: one wrapper group (and spring) each.
  const worn = useMemo(
    () => def.accessories.map((name) => ({ name, def: accessories[name], ref: createRef<THREE.Group>(), w: wobble() })),
    [def.accessories],
  )

  const state = useRef({
    attention: 0,
    greetStart: -Infinity,
    wasAttentive: false,
    nextBlink: 2,
    look: { yaw: spring(), pitch: spring() },
    pointer: new THREE.Vector2(NaN, NaN),
    pointerMovedAt: -Infinity,
    clicks: clickMemory(),
    clicked: false,
    reaction: null as ReactionPlay | null,
    /** Previous frame, for velocities of the accessory mounts. */
    prev: { head: new THREE.Euler(), torso: new THREE.Euler(), y: 0, ready: false },
  })
  const emoji = useMemo<EmojiShow>(() => ({ emoji: null, start: 0 }), [])
  const camLocal = useMemo(() => new THREE.Vector3(), [])

  // A held click cursor must not stay on after the character unmounts.
  const hovered = useRef(false)
  useEffect(
    () => () => {
      if (hovered.current) document.body.style.cursor = ''
    },
    [],
  )

  useFrame(({ clock, camera, pointer }, delta) => {
    const j = resolveJoints({
      root,
      torso,
      head,
      armL,
      armR,
      foreL,
      foreR,
      legL,
      legR,
      shinL,
      shinR,
      footL,
      footR,
      eyes,
      mouth,
    })
    if (!j) return
    const life = QUALITY[useQuality.getState().level].actorLife
    const now = clock.elapsedTime
    const t = now + phase
    const s = state.current
    const dt = Math.min(delta, 0.1)

    resetPose(j)
    act.animate(j, t, ctx)

    // Weight from leg to leg (and, now and then, a small step): hips over the standing leg,
    // the free hip drops, the shoulders stay level. Holding something overhead: half as much,
    // no steps. A click reaction takes over from it.
    const handsUp = act.reach === 'hold'
    const standing = stance(t, !handsUp, FOOT_X)
    const sway = (handsUp ? 0.5 : 1) * standing.weight
    const tilt = sway * STANCE.hipTilt
    // The root turns around the floor point between the feet, which would swing the hips back
    // the other way (hipY · sin tilt): add that back, so the hips really go over the standing leg.
    j.root.position.x += sway * STANCE.hipShift + BODY.hipY * Math.sin(tilt)
    j.root.rotation.z += tilt
    j.torso.rotation.z -= tilt * 0.8

    // Click → next reaction of the cycle (or "annoyed") and its emoji.
    if (s.clicked) {
      s.clicked = false
      const pick = pickReaction(s.clicks, def.reactions.length, now)
      const r = pick === 'annoyed' ? def.annoyed : def.reactions[pick]!
      s.reaction = { name: r.move, start: now }
      emoji.emoji = r.emoji
      emoji.start = now
    }
    let reaction: { k: number; w: number } | null = null
    if (s.reaction) {
      reaction = reactionWeight(s.reaction.name, now - s.reaction.start)
      if (reaction.k >= 1) {
        s.reaction = null
        reaction = null
      }
    }
    const lively = life && (attentive || reaction !== null)

    // Look at the visitor: the camera, or the cursor while it moves nearby (mouse only).
    s.attention += ((attentive ? 1 : 0) - s.attention) * (1 - Math.exp(-dt * 4))
    if (pointer.x !== s.pointer.x || pointer.y !== s.pointer.y) {
      if (!Number.isNaN(s.pointer.x)) s.pointerMovedAt = now
      s.pointer.copy(pointer)
    }
    const handsBusy = act.reach === 'hold'
    if (s.attention > 0.001) {
      j.root.updateWorldMatrix(true, false)
      const cursor = lively && canHover() && now - s.pointerMovedAt < LOOK.cursorMemory
      if (cursor) {
        // The point under the cursor at the head's distance from the camera.
        j.root.localToWorld(camLocal.set(0, HEAD_Y, 0))
        const distance = camLocal.distanceTo(camera.position)
        _ray.setFromCamera(pointer, camera)
        camLocal.copy(_ray.ray.direction).multiplyScalar(distance).add(camera.position)
      } else {
        camLocal.copy(camera.position)
      }
      j.root.worldToLocal(camLocal)
      const want = lookAngles(camLocal.x, camLocal.y - HEAD_Y, camLocal.z)
      if (!life) {
        s.look.yaw.x = want.yaw
        s.look.pitch.x = want.pitch
      } else {
        if (s.attention < 0.02) {
          // Starting to look: from wherever the activity has the head now.
          s.look.yaw.x = j.head.rotation.y + j.torso.rotation.y
          s.look.pitch.x = j.head.rotation.x
          s.look.yaw.v = s.look.pitch.v = 0
        }
        stepSpring(s.look.yaw, want.yaw, LOOK.stiffness, LOOK.damping, dt)
        stepSpring(s.look.pitch, want.pitch, LOOK.stiffness, LOOK.damping, dt)
      }
      const a = s.attention
      const yaw = s.look.yaw.x
      // The torso turns part of the way (not while holding something up).
      const torsoYaw = handsBusy ? 0 : yaw * LOOK.torsoShare
      j.torso.rotation.y = THREE.MathUtils.lerp(j.torso.rotation.y, torsoYaw, a)
      const neck = THREE.MathUtils.clamp(yaw - j.torso.rotation.y, -LOOK.maxNeckYaw, LOOK.maxNeckYaw)
      j.head.rotation.y = THREE.MathUtils.lerp(j.head.rotation.y, neck, a)
      j.head.rotation.x = THREE.MathUtils.lerp(j.head.rotation.x, s.look.pitch.x, a)
      // The eyes get there first: they cover what the head has not turned yet.
      if (life) {
        const leftYaw = want.yaw - (j.head.rotation.y + j.torso.rotation.y)
        const leftPitch = want.pitch - j.head.rotation.x
        j.eyes.position.x = THREE.MathUtils.clamp(leftYaw * LOOK.eyeShift, -LOOK.eyeMaxX, LOOK.eyeMaxX) * a
        j.eyes.position.y = EYES.y - THREE.MathUtils.clamp(leftPitch * LOOK.eyeShift, -LOOK.eyeMaxY, LOOK.eyeMaxY) * a
      }
    }

    // Hands on the element, and the click reaction on top (order matters: held hands stay put
    // when the body jumps, a pointing arm blends smoothly into the reaction).
    const reactionCtx = { handsBusy }
    const holdHands = () => {
      if (!target) return
      const [cx, cy, cz] = target.bottom
      const strain = Math.sin(t * HOLDING_RATE) * 0.012
      const k = 1 / def.scale
      reachArm(j, false, [(cx - HOLD_SPREAD) * k, (cy + strain) * k, cz * k], 1, HOLD_STRETCH)
      reachArm(j, true, [(cx + HOLD_SPREAD) * k, (cy - strain) * k, cz * k], 1, HOLD_STRETCH)
    }
    const pointHand = () => {
      if (!target) return
      // Aim along the line shoulder → element centre, a hair short of full reach (soft elbow).
      const k = 1 / def.scale
      const [cx, cy, cz] = target.centre
      const shoulder = _w.set(side * BODY.shoulderX, BODY.hipY + BODY.shoulderY, 0)
      const end = _v
        .set(cx * k, cy * k, cz * k)
        .sub(shoulder)
        .normalize()
        .multiplyScalar((BODY.upperArm + BODY.foreArm) * 0.97)
        .add(shoulder)
      reachArm(j, side > 0, [end.x, end.y, end.z], 0.85 + Math.sin(t * 2.2) * 0.05)
    }
    // Feet: where the stance puts them; standing unless a reaction may lift the body off. They
    // settle the hips' height, so they go after the reaction and before held hands.
    const feet = () => plantFeet(j, standing.feet, !reaction)
    if (act.reach === 'hold') {
      if (reaction) reactions[s.reaction!.name].animate(j, reaction.k, reaction.w, reactionCtx)
      feet()
      holdHands()
    } else {
      if (act.reach === 'point') pointHand()
      if (reaction) reactions[s.reaction!.name].animate(j, reaction.k, reaction.w, reactionCtx)
      feet()
    }

    // Greeting wave when the visitor arrives (skipped if the activity already waves,
    // and when both hands are busy holding something up).
    if (attentive && !s.wasAttentive) s.greetStart = now
    s.wasAttentive = attentive
    const since = now - s.greetStart
    if (activity !== 'waving' && !handsBusy && since < GREET_SECONDS && !reaction) {
      greet(j, t, Math.sin((since / GREET_SECONDS) * Math.PI))
    }

    // Blink.
    if (now > s.nextBlink) s.nextBlink = now + 2.5 + Math.random() * 3
    if (s.nextBlink - now < 0.12) j.eyes.scale.y *= 0.15

    // Talk.
    j.mouth.scale.y = talking ? 0.6 + Math.abs(Math.sin(t * 16)) * 1.8 : 0.6

    // Accessories on springs: driven by how fast the head / torso turn and the body bobs.
    const p = s.prev
    const headNow = [
      j.root.rotation.x + j.torso.rotation.x + j.head.rotation.x,
      j.root.rotation.y + j.torso.rotation.y + j.head.rotation.y,
      j.root.rotation.z + j.torso.rotation.z + j.head.rotation.z,
    ] as const
    const torsoNow = [
      j.root.rotation.x + j.torso.rotation.x,
      j.root.rotation.y + j.torso.rotation.y,
      j.root.rotation.z + j.torso.rotation.z,
    ] as const
    if (p.ready && dt > 0) {
      const vy = (j.root.position.y - p.y) / dt
      const headW: [number, number, number] = [
        turnBy(headNow[0], p.head.x) / dt,
        turnBy(headNow[1], p.head.y) / dt,
        turnBy(headNow[2], p.head.z) / dt,
      ]
      const torsoW: [number, number, number] = [
        turnBy(torsoNow[0], p.torso.x) / dt,
        turnBy(torsoNow[1], p.torso.y) / dt,
        turnBy(torsoNow[2], p.torso.z) / dt,
      ]
      for (const a of worn) {
        const g = a.ref.current
        if (!g) continue
        if (!lively && wobbleAtRest(a.w)) {
          if (g.rotation.x || g.rotation.y || g.rotation.z) g.rotation.set(0, 0, 0)
          continue
        }
        // Far away: no new pushes, the spring just settles.
        const drive = lively ? (a.def.mount === 'head' ? headW : torsoW) : ([0, 0, 0] as [number, number, number])
        const [rx, ry, rz] = stepWobble(a.w, a.def.wobble, drive, lively ? vy : 0, dt)
        g.rotation.set(rx, ry, rz)
      }
    }
    p.head.set(...headNow)
    p.torso.set(...torsoNow)
    p.y = j.root.position.y
    p.ready = true
  })

  const { Prop, HandL, HandR } = act
  const live = () => useExperience.getState().handedOver
  const wear = (mount: 'head' | 'torso') =>
    worn
      .filter((a) => a.def.mount === mount)
      .map(({ name, def: acc, ref }) => (
        <group key={name} ref={ref as RefObject<THREE.Group>} position={acc.pivot}>
          <group position={[-acc.pivot[0], -acc.pivot[1], -acc.pivot[2]]}>
            <acc.Component palette={palette} name={def.name} />
          </group>
        </group>
      ))

  return (
    <group
      scale={def.scale}
      // Clicks and the hover cursor work only once the 3D world has taken over (rule 18).
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!live()) return
        e.stopPropagation()
        state.current.clicked = true
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (!live()) return
        e.stopPropagation()
        hovered.current = true
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        if (!hovered.current) return
        hovered.current = false
        document.body.style.cursor = ''
      }}
    >
      <group ref={root}>
        <Leg ref={legL} shin={shinL} foot={footL} x={-FOOT_X} palette={palette} />
        <Leg ref={legR} shin={shinR} foot={footR} x={FOOT_X} palette={palette} />

        <group ref={torso} position={[0, BODY.hipY, 0]}>
          <RoundedBox args={[0.6, 0.64, 0.34]} radius={0.06} smoothness={3} position={[0, 0.32, 0]}>
            <Mat color={palette.shirt} />
          </RoundedBox>
          {wear('torso')}

          <Arm ref={armL} fore={foreL} side={-1} palette={palette} Hand={HandL} />
          <Arm ref={armR} fore={foreR} side={1} palette={palette} Hand={HandR} />

          <group ref={head} position={[0, BODY.neckY, 0]}>
            <RoundedBox args={[0.5, 0.5, 0.46]} radius={0.07} smoothness={3} position={[0, 0.25, 0]}>
              <Mat color={palette.skin} />
            </RoundedBox>
            {palette.hair && (
              <>
                <mesh position={[0, 0.47, -0.01]}>
                  <boxGeometry args={[0.52, 0.1, 0.48]} />
                  <Mat color={palette.hair} />
                </mesh>
                <mesh position={[0, 0.32, -0.21]}>
                  <boxGeometry args={[0.52, 0.32, 0.08]} />
                  <Mat color={palette.hair} />
                </mesh>
              </>
            )}
            <group ref={eyes} position={[0, EYES.y, EYES.z]}>
              {[-0.1, 0.1].map((x) => (
                <mesh key={x} position={[x, 0, 0]}>
                  <boxGeometry args={[0.07, 0.09, 0.02]} />
                  <meshBasicMaterial color={EYE} />
                </mesh>
              ))}
            </group>
            <mesh ref={mouth} position={[0, 0.13, 0.234]}>
              <boxGeometry args={[0.1, 0.025, 0.02]} />
              <meshBasicMaterial color={EYE} />
            </mesh>
            {wear('head')}
          </group>
        </group>

        {Prop && <Prop palette={palette} />}
      </group>
      {/* Beside the head: above it are the speech bubble (HTML, on top of everything) or a held heading. */}
      <EmojiPop show={emoji} x={0.6 * side} y={BODY.height - 0.35} first={def.reactions[0]!.emoji} />
    </group>
  )
}
