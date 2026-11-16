'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { BODY, EYES } from '@/actors/rig'
import { useTheme } from '@/theme/store'
import type { WorldLayout } from '../layout'
import type { Office } from '../officeModel'
import { useQualitySettings } from '../quality'
import { useStylePreset } from '../style'
import { applyToon } from '../toonMaterial'
import { callAttention, cameraStill } from './attention'
import { burstTime, CROWD, crowdSpots, JOLT, MEET, meetTime, newCrowd, poke, stepCrowd } from './crowdModel'
import { useExperience } from '@/experience/store'
import { onSpinningChair, poseOf } from './crowdPose'
import { chairKey, chairTurns } from '../physics/chairSpin'
import { crowdColliders, MAX_CROWD_COLLIDERS } from '../physics/protocol'
import { floorOptions, pickFloorGroups } from './floorModel'
import { buildNavGrid } from './navGrid'
import type { PropSpot, StopExhibit } from '../physics/propsModel'

/**
 * The office's own people (E2a): typing at desks, chatting at the coffee corner, walking between
 * them (crowdModel.ts, crowdPose.ts). Built for many people at almost no cost:
 *
 * - every body part of every person is one unit box in ONE instanced mesh (toon-lit, colours
 *   per instance), eyes and mouths in a second, soft shadows in a third, the coffee steam in a
 *   fourth — 4 draw calls for the whole crowd, however many people;
 * - the same shader programs as the office's own instanced meshes (no new program);
 * - a person off camera is not posed (rule 35): their boxes are collapsed once and skipped;
 * - simpler than a character (no IK, springs, accessories or badges). Built for people away from
 *   the camera; since some stand on the route's floor (floorModel.ts), a few metres from it, they
 *   got the characters' rounded torso and head (two more instanced meshes, +2 draw calls, ~4k
 *   triangles for 20), click reactions, and solid capsules for the props (physics/protocol.ts
 *   `crowdColliders`; balls flew through them before).
 * - E2b: the meeting chart's bars (extra lit instances after the people's) and the sleeper's
 *   "Zzz" (extra dark instances): no extra draw calls.
 */
const EYE = '#17171a'
const SHOE = '#232326'
const FOOT_X = 0.14
const OVERLAP = 0.04
const MAX_PEOPLE = 20
const PUFFS = 12
/** E2b: bars on a meeting board; "Zzz" boxes for the (one) sleeper — 3 letters × 3 strokes. */
const BARS = 3
const ZZZ = 9
const BAR_COLOR = { accentA: '#3b6cf6', accentB: '#2bb673', accentC: '#ff6b5b' } as const
/** The corridor sofa (E2b, floorModel.ts), in its own frame (front +z, seat along x): seat, back, two arms. */
const COUCH: { at: [number, number, number]; size: [number, number, number] }[] = [
  { at: [0, 0.22, 0], size: [2.1, 0.44, 0.86] },
  { at: [0, 0.64, -0.35], size: [2.1, 0.5, 0.16] },
  { at: [-0.96, 0.4, 0], size: [0.18, 0.56, 0.86] },
  { at: [0.96, 0.4, 0], size: [0.18, 0.56, 0.86] },
]

type Part = { node: THREE.Object3D; color: 'skin' | 'shirt' | 'pants' | 'hair' | 'shoe' }

interface Skeleton {
  root: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  foreL: THREE.Group
  foreR: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  shinL: THREE.Group
  shinR: THREE.Group
  footL: THREE.Group
  footR: THREE.Group
  lit: Part[]
  dark: THREE.Object3D[]
  /** The phone (in the right hand, shown only while pacing on it). */
  phone: THREE.Object3D
  /** Rounded torso and head, like the characters' (their own instanced meshes, unscaled). */
  torsoBox: THREE.Object3D
  headBox: THREE.Object3D
}

/** The same proportions as a character (src/actors/Actor.tsx), as boxes to copy matrices from. */
function skeleton(): Skeleton {
  const lit: Part[] = []
  const dark: THREE.Object3D[] = []
  const boxAt = (parent: THREE.Object3D, pos: [number, number, number], size: [number, number, number], color: Part['color'] | 'eye') => {
    const n = new THREE.Object3D()
    n.position.set(...pos)
    n.scale.set(...size)
    parent.add(n)
    if (color === 'eye') dark.push(n)
    else lit.push({ node: n, color })
  }
  const group = (parent: THREE.Object3D, pos: [number, number, number]) => {
    const g = new THREE.Group()
    g.position.set(...pos)
    parent.add(g)
    return g
  }
  const root = new THREE.Group()
  const leg = (x: number) => {
    const l = group(root, [x, BODY.hipY, 0])
    boxAt(l, [0, -BODY.thigh / 2, 0], [0.2, BODY.thigh, 0.24], 'pants')
    const shin = group(l, [0, -BODY.thigh, 0])
    const h = BODY.hipY - BODY.thigh - 0.02 + OVERLAP
    boxAt(shin, [0, (OVERLAP - (BODY.hipY - BODY.thigh - 0.02)) / 2, 0], [0.2, h, 0.24], 'pants')
    const foot = group(shin, [0, -BODY.shin, 0])
    boxAt(foot, [0, 0.04, 0.04], [0.22, 0.08, 0.32], 'shoe')
    return [l, shin, foot] as const
  }
  const [legL, shinL, footL] = leg(-FOOT_X)
  const [legR, shinR, footR] = leg(FOOT_X)
  const torso = group(root, [0, BODY.hipY, 0])
  // Rounded like the characters' (the geometry has the size: no scale).
  const torsoBox = new THREE.Object3D()
  torsoBox.position.set(0, 0.32, 0)
  torso.add(torsoBox)
  const arm = (side: -1 | 1) => {
    const upper = BODY.upperArm + 0.01
    const lower = 0.49 - BODY.upperArm + OVERLAP
    const a = group(torso, [side * BODY.shoulderX, BODY.shoulderY, 0])
    boxAt(a, [0, 0.01 - upper / 2, 0], [0.17, upper, 0.18], 'shirt')
    const f = group(a, [0, -BODY.upperArm, 0])
    boxAt(f, [0, OVERLAP - lower / 2, 0], [0.17, lower, 0.18], 'shirt')
    boxAt(f, [0, -0.54 + BODY.upperArm, 0], [0.15, 0.12, 0.16], 'skin')
    return [a, f] as const
  }
  const [armL, foreL] = arm(-1)
  const [armR, foreR] = arm(1)
  // A phone against the right palm, on the side towards the head when held to the ear.
  boxAt(foreR, [-0.08, -0.29, 0.03], [0.035, 0.17, 0.09], 'eye')
  const phone = dark[dark.length - 1]!
  const head = group(torso, [0, BODY.neckY, 0])
  const headBox = new THREE.Object3D()
  headBox.position.set(0, 0.25, 0)
  head.add(headBox)
  // Hair clearly bigger than the head (≥ 3 cm each side): the full characters' rounded heads
  // stand off a 1 cm overhang, the crowd's square ones do not — seen from 10–20 m the two
  // surfaces fought for depth and the hair flickered (Dima 2026-11-16: "the hair glitches").
  boxAt(head, [0, 0.48, -0.01], [0.56, 0.1, 0.52], 'hair')
  boxAt(head, [0, 0.33, -0.235], [0.56, 0.32, 0.08], 'hair')
  for (const x of [-0.1, 0.1]) boxAt(head, [x, EYES.y, EYES.z], [0.07, 0.09, 0.02], 'eye')
  boxAt(head, [0, 0.13, 0.234], [0.1, 0.025, 0.02], 'eye')
  return { root, torso, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR, footL, footR, lit, dark, phone, torsoBox, headBox }
}

const BOX = new THREE.BoxGeometry(1, 1, 1)
// The characters' torso and head are drei RoundedBoxes (Actor.tsx): the same sizes and radii here,
// 1 segment per corner (108 triangles each; 2 segments looked the same from a few metres and cost
// ~12k triangles for 20 people instead of ~4k).
const TORSO = new RoundedBoxGeometry(0.6, 0.64, 0.34, 1, 0.06)
const HEAD = new RoundedBoxGeometry(0.5, 0.5, 0.46, 1, 0.07)
const SHADOW = new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2)
const PUFF = new THREE.IcosahedronGeometry(0.5, 1)
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
const noRaycast = () => null
/** Tasks in which a person stands or walks (a capsule for the props). */
const STANDING = new Set(['chat', 'pace', 'present', 'meet', 'walk'])

/** Who is where is dealt anew on every page load (Dima: "different every time"). */
const PAGE_SEED = Math.floor(Math.random() * 2 ** 31)

/** What the people on the route's floor keep clear of (SceneContent hands the props' own input). */
export interface FloorInput {
  exhibits: StopExhibit[]
  props: PropSpot[]
  skip: number[]
  aspect: number
}

export function Crowd({ office, layout, floor }: { office: Office; layout: WorldLayout; floor: FloorInput }) {
  const { crowd: count } = useQualitySettings()
  const { world } = useTheme()
  const preset = useStylePreset()
  const clock = useThree((s) => s.clock)

  // One deal per page view (and per office: a resize rebuilds the office).
  const model = useMemo(() => {
    const grid = buildNavGrid(office)
    // Another page's office (another layout) gets another deal.
    const seed = (PAGE_SEED ^ Math.round(office.bounds.minX * 97 + office.bounds.maxZ * 13)) >>> 0
    const groups = pickFloorGroups(floorOptions(layout, floor.exhibits, floor.props, floor.skip), seed)
    const spots = crowdSpots(office, layout, grid, groups)
    // The meeting boards' centres (gags start when the camera sees them).
    const boards = office.meeting.map((m): [number, number, number] => {
      const n = m.bars.length
      const x = m.bars.reduce((s, b) => s + b.base[0], 0) / n
      const z = m.bars.reduce((s, b) => s + b.base[2], 0) / n
      return [x, m.bars[0]!.base[1] + 0.35, z]
    })
    return { grid, crowd: newCrowd(spots, MAX_PEOPLE, seed, clock.elapsedTime, office.coffee.map((c) => c.steam), boards) }
  }, [office, layout, clock, floor])
  const people = Math.min(count, model.crowd.people.length)
  const skeletons = useMemo(() => model.crowd.people.map(() => skeleton()), [model])
  const litPer = skeletons[0]?.lit.length ?? 0
  const darkPer = skeletons[0]?.dark.length ?? 0
  // Extra instances after the people's: the meeting bars (lit), the sleeper's Zzz (dark).
  const barsAt = people * litPer
  const zzzAt = people * darkPer
  const couch = useMemo(() => model.crowd.spots.find((s) => s.couch) ?? null, [model])
  const couchAt = barsAt + office.meeting.length * BARS
  const litCount = couchAt + (couch ? COUCH.length : 0)
  const darkCount = zzzAt + ZZZ

  const materials = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
      eye: new THREE.MeshBasicMaterial({ color: EYE }),
      shadow: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
      steam: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    }),
    [],
  )
  useLayoutEffect(() => applyToon(materials.body, preset), [materials, preset])
  useLayoutEffect(() => {
    materials.shadow.color.set(world.shadow)
    materials.shadow.opacity = world.shadowOpacity
  }, [materials, world])
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  const body = useRef<THREE.InstancedMesh>(null)
  const torsos = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const eyes = useRef<THREE.InstancedMesh>(null)
  const shadows = useRef<THREE.InstancedMesh>(null)
  const steam = useRef<THREE.InstancedMesh>(null)

  // Until the first frame poses them, nothing shows (an instance starts as a unit box at 0,0,0).
  useLayoutEffect(() => {
    for (const mesh of [body.current, eyes.current, shadows.current, steam.current, torsos.current, heads.current]) {
      if (!mesh) continue
      for (let k = 0; k < mesh.count; k++) mesh.setMatrixAt(k, ZERO)
      mesh.instanceMatrix.needsUpdate = true
    }
    if (steam.current) steam.current.visible = false
  }, [people, litPer, darkPer, office, litCount, darkCount])

  // The office's people as solids for the props (balls bounce off them): the sofa once, the
  // standing / walking people every frame (below). Cleared when the crowd goes.
  useEffect(() => {
    crowdColliders.boxes = couch
      ? [{ shape: 'box', pos: [couch.at[0], 0.42, couch.at[2]], half: [COUCH[0]!.size[0] / 2, 0.42, COUCH[0]!.size[2] / 2], yaw: couch.yaw }]
      : []
    crowdColliders.version++
    return () => {
      crowdColliders.people = []
      crowdColliders.boxes = []
      crowdColliders.version++
    }
  }, [couch])

  // The corridor sofa never moves: placed once (after the clean-up above).
  useLayoutEffect(() => {
    const mesh = body.current
    if (!mesh || !couch) return
    const o = new THREE.Object3D()
    const c = Math.cos(couch.yaw)
    const s = Math.sin(couch.yaw)
    COUCH.forEach((part, k) => {
      const [x, y, z] = part.at
      o.position.set(couch.at[0] + x * c + z * s, y, couch.at[2] - x * s + z * c)
      o.rotation.set(0, couch.yaw, 0)
      o.scale.set(...part.size)
      o.updateMatrix()
      mesh.setMatrixAt(couchAt + k, o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [couch, couchAt, litCount, people, litPer, darkPer, office, darkCount])

  // Colours: once per deal.
  useLayoutEffect(() => {
    const mesh = body.current
    if (!mesh) return
    const c = new THREE.Color()
    model.crowd.people.slice(0, people).forEach((p, i) => {
      skeletons[i]!.lit.forEach((part, k) => {
        const hex = part.color === 'shoe' ? SHOE : p.look[part.color]
        mesh.setColorAt(i * litPer + k, c.set(hex))
      })
    })
    model.crowd.people.slice(0, people).forEach((p, i) => {
      torsos.current?.setColorAt(i, c.set(p.look.shirt))
      heads.current?.setColorAt(i, c.set(p.look.skin))
    })
    for (const m of [torsos.current, heads.current]) if (m?.instanceColor) m.instanceColor.needsUpdate = true
    office.meeting.forEach((m, k) => m.bars.forEach((bar, j) => mesh.setColorAt(barsAt + k * BARS + j, c.set(BAR_COLOR[bar.color]))))
    if (couch) COUCH.forEach((_, k) => mesh.setColorAt(couchAt + k, c.set(world.office.fabricB)))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [model, skeletons, people, litPer, office, barsAt, couch, couchAt, world])

  const frustum = useMemo(() => new THREE.Frustum(), [])
  const projView = useMemo(() => new THREE.Matrix4(), [])
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(), 1.3), [])
  const shown = useRef<boolean[]>([])
  const tmp = useMemo(() => new THREE.Object3D(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  // A "Z" of three strokes, turned to face the camera (E2b).
  const zee = useMemo(() => {
    const g = new THREE.Object3D()
    const stroke = (y: number, rz: number, len: number) => {
      const o = new THREE.Object3D()
      o.position.set(0, y, 0)
      o.rotation.z = rz
      o.scale.set(len, 0.2, 0.05)
      g.add(o)
      return o
    }
    return { g, strokes: [stroke(0.5, 0, 1), stroke(0, Math.PI / 4, 1.3), stroke(-0.5, 0, 1)] }
  }, [])
  const headAt = useMemo(() => new THREE.Vector3(), [])
  // Hit test for clicks: each person in view as two spheres (chest, head).
  const pickPeople = useMemo(() => {
    const hit = new THREE.Vector3()
    const ball = new THREE.Sphere()
    return function (this: THREE.InstancedMesh, raycaster: THREE.Raycaster, out: THREE.Intersection[]) {
      for (let i = 0; i < skeletons.length && i < shown.current.length; i++) {
        if (!shown.current[i]) continue
        const sk = skeletons[i]!
        let best: number | null = null
        for (const [node, r] of [
          [sk.torsoBox, 0.42],
          [sk.headBox, 0.32],
        ] as const) {
          node.getWorldPosition(ball.center)
          ball.radius = r
          if (raycaster.ray.intersectSphere(ball, hit)) {
            const d = raycaster.ray.origin.distanceTo(hit)
            if (best === null || d < best) best = d
          }
        }
        if (best !== null) out.push({ distance: best, point: raycaster.ray.at(best, new THREE.Vector3()), object: this, instanceId: i })
      }
    }
  }, [skeletons])
  const extrasShown = useRef({ bars: [] as boolean[], zzz: false })

  // `?debug=1`: who is where, doing what, and where their heads are on screen (for checks).
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useEffect(() => {
    if (typeof location === 'undefined' || !new URLSearchParams(location.search).has('debug')) return
    const w = window as unknown as { __eraCrowd?: unknown }
    const v = new THREE.Vector3()
    w.__eraCrowd = {
      people: () =>
        model.crowd.people.slice(0, people).map((p, i) => {
          const pose = poseOf(model.crowd, i, clock.elapsedTime)
          v.set(pose.at[0], pose.at[1] + 1.5 + pose.lift, pose.at[2]).project(camera)
          return {
            task: p.task,
            kind: model.crowd.spots[p.spot]!.kind,
            shown: shown.current[i] === true,
            head: [Math.round(((v.x + 1) / 2) * size.width), Math.round(((1 - v.y) / 2) * size.height)],
          }
        }),
      bursts: () => office.coffee.map((_, k) => burstTime(model.crowd, k, clock.elapsedTime)),
    }
    return () => {
      delete w.__eraCrowd
    }
  }, [model, people, camera, size, clock, office])

  useFrame(({ camera }) => {
    const now = clock.elapsedTime
    const { crowd, grid } = model
    // Gags play where the camera looks (and may call its attention).
    camera.getWorldDirection(look)
    const n = Math.hypot(look.x, look.z) || 1
    const call = stepCrowd(crowd, now, grid, {
      eye: [camera.position.x, camera.position.y, camera.position.z],
      dir: [look.x / n, look.z / n],
      still: cameraStill.still,
    })
    if (call) callAttention(call)
    const b = body.current
    const e = eyes.current
    const s = shadows.current
    const to = torsos.current
    const he = heads.current
    if (!b || !e || !s || !to || !he) return
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projView)
    let changed = false
    let seen = 0
    const solids = crowdColliders.people
    solids.length = 0
    for (let i = 0; i < people; i++) {
      const sk = skeletons[i]!
      let pose = poseOf(crowd, i, now)
      // Sitting on a seat someone set spinning: turn with it (and enjoy it).
      const person = crowd.people[i]!
      const seat = crowd.spots[person.spot]!
      if (chairTurns.size && person.task === 'type' && seat.kind === 'desk') {
        const turning = chairTurns.get(chairKey(seat.at))
        if (turning) pose = onSpinningChair(pose, seat.at, turning.angle, turning.speed)
      }
      // Standing or walking: a solid for the props (seated ones are behind desks and glass).
      if (STANDING.has(person.task) && solids.length < MAX_CROWD_COLLIDERS * 3) solids.push(pose.at[0], pose.at[1], pose.at[2])
      sphere.center.set(pose.at[0], pose.at[1] + 0.9, pose.at[2])
      const visible = frustum.intersectsSphere(sphere)
      if (!visible) {
        // Off camera: collapse once, then nothing (rule 35).
        if (shown.current[i] !== false) {
          for (let k = 0; k < litPer; k++) b.setMatrixAt(i * litPer + k, ZERO)
          for (let k = 0; k < darkPer; k++) e.setMatrixAt(i * darkPer + k, ZERO)
          s.setMatrixAt(i, ZERO)
          to.setMatrixAt(i, ZERO)
          he.setMatrixAt(i, ZERO)
          shown.current[i] = false
          changed = true
        }
        continue
      }
      shown.current[i] = true
      changed = true
      seen++
      sk.root.position.set(pose.at[0], pose.at[1] + pose.lift, pose.at[2])
      // Yaw first, then the tip back for lying down (E2b).
      sk.root.rotation.order = 'YXZ'
      sk.root.rotation.set(pose.lieX, pose.yaw, 0)
      sk.torso.rotation.set(pose.torsoX, 0, pose.torsoZ)
      sk.head.rotation.set(pose.headX, pose.headY, 0)
      sk.armL.rotation.set(pose.armLX, 0, pose.armLZ)
      sk.armR.rotation.set(pose.armRX, pose.armRY, pose.armRZ)
      sk.foreL.rotation.set(pose.foreL, 0, 0)
      sk.foreR.rotation.set(pose.foreR, 0, 0)
      sk.legL.rotation.set(pose.legL, 0, 0)
      sk.legR.rotation.set(pose.legR, 0, 0)
      sk.shinL.rotation.set(pose.shinL, 0, 0)
      sk.shinR.rotation.set(pose.shinR, 0, 0)
      // Shoes stay flat.
      sk.footL.rotation.set(-(pose.legL + pose.shinL), 0, 0)
      sk.footR.rotation.set(-(pose.legR + pose.shinR), 0, 0)
      sk.root.updateMatrixWorld(true)
      sk.lit.forEach((part, k) => b.setMatrixAt(i * litPer + k, part.node.matrixWorld))
      to.setMatrixAt(i, sk.torsoBox.matrixWorld)
      he.setMatrixAt(i, sk.headBox.matrixWorld)
      const onPhone = crowd.people[i]!.task === 'pace'
      sk.dark.forEach((node, k) => e.setMatrixAt(i * darkPer + k, node === sk.phone && !onPhone ? ZERO : node.matrixWorld))
      // A soft shadow on the floor, smaller while they are in the air (none lying on a sofa).
      const air = Math.max(0, pose.lift)
      tmp.position.set(pose.at[0], pose.at[1] + 0.006, pose.at[2])
      tmp.rotation.set(0, 0, 0)
      tmp.scale.setScalar(pose.lieX !== 0 ? 0 : 1 - air * 1.5)
      tmp.updateMatrix()
      s.setMatrixAt(i, tmp.matrix)
      // The sleeper's Zzz: three letters rising from the head, one after another (not while
      // they jerk awake).
      if (person.task === 'sleep') {
        sk.head.getWorldPosition(headAt)
        const awake = now - person.bonkAt >= 0 && now - person.bonkAt < JOLT.total
        for (let z = 0; z < 3; z++) {
          const u = (((now + person.phase) / 2.4 + z / 3) % 1 + 1) % 1
          zee.g.position.set(headAt.x + u * 0.25, headAt.y + 0.45 + u * 0.8, headAt.z)
          zee.g.quaternion.copy(camera.quaternion)
          zee.g.scale.setScalar(awake ? 0 : (0.1 + u * 0.16) * Math.sin(Math.PI * Math.min(u * 1.25, 1)))
          zee.g.updateMatrixWorld(true)
          zee.strokes.forEach((st, k) => e.setMatrixAt(zzzAt + z * 3 + k, st.matrixWorld))
        }
        extrasShown.current.zzz = true
      }
    }
    // Nobody sleeping in view: the Zzz go (once).
    if (extrasShown.current.zzz && !crowd.people.slice(0, people).some((p, i) => p.task === 'sleep' && shown.current[i])) {
      for (let k = 0; k < ZZZ; k++) e.setMatrixAt(zzzAt + k, ZERO)
      extrasShown.current.zzz = false
      changed = true
    }
    // The meeting chart's bars: on the board; in the gag they drop off one by one, tip over on
    // the floor, and are back on the board by the end.
    office.meeting.forEach((m, k) => {
      const centre = crowd.boards[k]!
      sphere.center.set(centre[0], centre[1], centre[2])
      const inView = frustum.intersectsSphere(sphere)
      if (!inView) {
        if (extrasShown.current.bars[k] !== false) {
          for (let j = 0; j < BARS; j++) b.setMatrixAt(barsAt + k * BARS + j, ZERO)
          extrasShown.current.bars[k] = false
          changed = true
        }
        return
      }
      extrasShown.current.bars[k] = true
      changed = true
      seen++
      const u = meetTime(crowd, k, now)
      const fx = Math.sin(m.boardYaw)
      const fz = Math.cos(m.boardYaw)
      m.bars.forEach((bar, j) => {
        const [w, h, d] = bar.size
        let y = bar.base[1] + h / 2
        let out = 0
        let tip = 0
        let grow = 1
        if (u !== null) {
          const v = (u - MEET.tap - j * MEET.dropEach) / MEET.fall
          if (u >= MEET.back - 0.35) {
            grow = Math.min(1, Math.max(0, (u - (MEET.back - 0.35)) / 0.35))
          } else if (v > 0) {
            const k2 = Math.min(v, 1)
            const floorY = d / 2 + 0.01
            y = bar.base[1] + h / 2 + (floorY - (bar.base[1] + h / 2)) * k2 * k2 + (v > 1 ? 0 : 0)
            // A little hop when it lands.
            if (v > 1 && v < 1.4) y += Math.sin(((v - 1) / 0.4) * Math.PI) * 0.06
            out = k2 * (0.15 + h / 2)
            tip = k2 * (Math.PI / 2)
          }
        }
        tmp.position.set(bar.base[0] + fx * out, y, bar.base[2] + fz * out)
        tmp.rotation.order = 'YXZ'
        tmp.rotation.set(tip, m.boardYaw, 0)
        tmp.scale.set(w * grow, h * grow, d * grow)
        tmp.updateMatrix()
        b.setMatrixAt(barsAt + k * BARS + j, tmp.matrix)
      })
    })
    tmp.rotation.order = 'XYZ'
    if (changed) {
      for (const m of [b, e, s, to, he]) m.instanceMatrix.needsUpdate = true
    }
    // Nobody in view: no draw calls at all.
    b.visible = e.visible = s.visible = to.visible = he.visible = seen > 0

    // The coffee machines' steam: a burst of puffs, only while it plays.
    const st = steam.current
    if (!st) return
    let any = false
    office.coffee.forEach((corner, ci) => {
      const u = burstTime(crowd, ci, now)
      for (let k = 0; k < PUFFS; k++) {
        const idx = ci * PUFFS + k
        if (u === null) {
          st.setMatrixAt(idx, ZERO)
          continue
        }
        any = true
        const a = (k / PUFFS) * Math.PI * 2 + k * 0.7
        let size: number
        let out: number
        let up: number
        if (u < CROWD.shakeTime) {
          // Rattling: little puffs at the top of the machine.
          const flick = Math.max(0, Math.sin(u * 30 + k * 2))
          size = k < 4 ? 0.06 + flick * 0.06 : 0
          out = 0.05
          up = flick * 0.05
        } else {
          const v = (u - CROWD.shakeTime) / CROWD.burstTime
          const grow = 1 - (1 - Math.min(v * 3, 1)) ** 3
          size = (0.25 + 0.35 * ((k * 37) % 10) / 10) * grow * (1 - Math.max(0, (v - 0.6) / 0.4))
          out = 0.15 + grow * (0.5 + ((k * 13) % 7) / 10)
          up = grow * (0.35 + ((k * 7) % 5) / 8) + v * 0.4
        }
        tmp.position.set(corner.steam[0] + Math.cos(a) * out, corner.steam[1] + up, corner.steam[2] + Math.sin(a) * out)
        tmp.rotation.set(0, 0, 0)
        tmp.scale.setScalar(Math.max(size, 0))
        tmp.updateMatrix()
        st.setMatrixAt(idx, tmp.matrix)
      }
    })
    if (any) st.instanceMatrix.needsUpdate = true
    // Drawn only while a machine is bursting.
    st.visible = any
  })

  if (!people) return null
  return (
    <group>
      <instancedMesh key={`b${litCount}`} ref={body} args={[BOX, materials.body, litCount]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh
        key={`t${people}`}
        ref={torsos}
        args={[TORSO, materials.body, Math.max(people, 1)]}
        frustumCulled={false}
        // Clickable people (E2a): our own hit test — a sphere round each one's chest and head.
        raycast={pickPeople}
        // Only once the 3D world has taken over (rule 18).
        onClick={(ev) => {
          if (!useExperience.getState().handedOver || ev.instanceId === undefined) return
          ev.stopPropagation()
          poke(model.crowd, ev.instanceId, clock.elapsedTime)
        }}
        onPointerOver={(ev) => {
          if (!useExperience.getState().handedOver) return
          ev.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      />
      <instancedMesh key={`h${people}`} ref={heads} args={[HEAD, materials.body, Math.max(people, 1)]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh key={`e${darkCount}`} ref={eyes} args={[BOX, materials.eye, darkCount]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh key={`s${people}`} ref={shadows} args={[SHADOW, materials.shadow, people]} frustumCulled={false} raycast={noRaycast} />
      {office.coffee.length > 0 && (
        <instancedMesh ref={steam} args={[PUFF, materials.steam, office.coffee.length * PUFFS]} frustumCulled={false} raycast={noRaycast} />
      )}
    </group>
  )
}
