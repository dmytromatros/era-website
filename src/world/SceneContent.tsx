'use client'

import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { phaseOf } from '@/actors/Actor'
import { HOLDING_RATE } from '@/actors/activities'
import { Door3D } from '@/blocks/door/Door3D'
import { DOOR_SPACING, hrefOfSceneKey, portalDoors } from '@/blocks/door/doors'
import type { SceneData } from '@/experience/store'
import { useExperience } from '@/experience/store'
import { CameraRig } from './CameraRig'
import { Decor } from './Decor'
import { BODY } from '@/actors/rig'
import { hitKey } from '@/actors/hits'
import { buildExhibit, toWorld, type ExhibitModel } from './exhibitModel'
import { Exhibit } from './Exhibit'
import { Hands } from './firstPerson/Hands'
import { Shards } from './firstPerson/Shards'
import { CoffeeScene } from './coffee/CoffeeScene'
import { Cutscene } from './cutscene/Cutscene'
import { HeroTransit, type TransitItem } from './HeroTransit'
import type { KineticOptions } from './KineticText'
import { ENTRANCE_GEOMETRY, layoutRoute, type ExhibitSize } from './layout'
import { ArrivalDoor } from './ArrivalDoor'
import { Membrane } from './Membrane'
import { buildOffice, OFFICE } from './officeModel'
import { Physics } from './physics/Physics'
import type { ActorCollider } from './physics/protocol'
import { placeProps, propBodies, staticShapes, type StaticShape, type StopExhibit } from './physics/propsModel'
import { Office } from './Office'
import { officeStyle } from './officeStyle'
import { planTiming, routePlan } from './route'
import { moduleRailRange } from './widgetZone'

const VISIBLE_HEIGHT =
  2 * ENTRANCE_GEOMETRY.heroDistance * Math.tan(THREE.MathUtils.degToRad(ENTRANCE_GEOMETRY.fov / 2))
/** The one element whose letters come alive (B1): the hero heading — a signature moment, not on every text. */
const KINETIC_ELEMENT = 'heading'
/** The portal hall: one door per page, side by side. */
const hallSize = (doors: number): ExhibitSize => ({ width: (doors - 1) * DOOR_SPACING + 2.4, height: 3.6 })

/** Everything that belongs to one page. Re-mounted (via `key`) when the route changes. */
export function SceneContent({ scene }: { scene: SceneData }) {
  const { page, locale, actors } = scene
  // older scene objects (e.g. after a hot reload) may lack nav
  const nav = useMemo(() => scene.nav ?? [], [scene.nav])
  const previews = useMemo(() => scene.previews ?? {}, [scene.previews])
  const currentHref = hrefOfSceneKey(scene.key)
  const arrivedHere = useExperience((s) => s.arrivedVia === scene.key)
  const style = useMemo(() => officeStyle(scene.key, page), [scene.key, page])
  const size = useThree((s) => s.size)
  const measured = useExperience((s) => (s.elements && s.elements.sceneKey === scene.key ? s.elements.blocks : null))

  // World units per CSS pixel: an element seen from `heroDistance` looks as big as in 2D.
  const k = VISIBLE_HEIGHT / size.height
  const plan = useMemo(() => routePlan(page), [page])
  const timing = useMemo(() => planTiming(plan), [plan])

  const world = useMemo(() => {
    if (!measured) return null
    const models: (ExhibitModel | null)[] = plan.stops.map((stop) => {
      if (!stop.exhibit) return null
      const block = page.blocks[stop.blockIndex]!
      const helpers = 'helpers' in block ? block.helpers : []
      return buildExhibit(measured[stop.blockIndex] ?? [], stop.exhibit.elements, helpers, k)
    })
    const layout = layoutRoute(
      plan,
      models.map((m, i) => {
        if (m) return { width: m.width, height: m.height }
        const block = page.blocks[plan.stops[i]!.blockIndex]!
        return hallSize(block.type === 'door' ? Math.max(portalDoors(block, nav, currentHref).length, 1) : 1)
      }),
      size.width / size.height,
    )
    // Hero elements fly from the 2D page to their spots in the hero exhibits.
    const hero = page.blocks[0]
    const heldBy = hero && 'helpers' in hero ? hero.helpers.find((h) => h.target === KINETIC_ELEMENT && h.pose === 'holding') : undefined
    const heroZone = moduleRailRange(plan, timing, 0)
    const kinetic: KineticOptions | undefined =
      hero?.type === 'hero' && heroZone
        ? {
            zone: heroZone,
            segments: timing.segments,
            holder: heldBy ? { phase: phaseOf(heldBy.actor), rate: HOLDING_RATE } : null,
          }
        : undefined
    const transit: TransitItem[] = plan.stops.flatMap((stop, i) => {
      const model = models[i]
      if (stop.blockIndex !== 0 || !model) return []
      const { anchor, yaw } = layout.stations[i]!
      return model.elements.map(({ spec, local }) => ({
        spec,
        target: { local, anchor, yaw },
        kinetic: spec.id === KINETIC_ELEMENT ? kinetic : undefined,
      }))
    })
    const office = buildOffice(layout, style.seed)

    // ---- props you can push (C2): beside the exhibits, plus the static world they hit ----
    const exhibits: StopExhibit[] = models.map((m, i) => {
      const st = layout.stations[i]!
      return {
        width: m?.width ?? 0,
        elevation: m?.elevation ?? 0,
        helpers: m ? m.helpers.map((h) => toWorld(h.local, st.anchor, st.yaw)) : [],
      }
    })
    const skip = plan.stops.flatMap((stop, i) => (i === 0 || page.blocks[stop.blockIndex]!.type === 'door' ? [i] : []))
    const spots = placeProps(layout, office, exhibits, style.seed, skip, size.width / size.height)
    const bodies = propBodies(spots, style.seed)
    const exhibitShapes: StaticShape[] = models.flatMap((m, i) => {
      if (!m) return []
      const { anchor, yaw } = layout.stations[i]!
      const slabs = m.elements
        .filter((e) => e.spec.box)
        .map((e): StaticShape => ({
          shape: 'box',
          pos: toWorld(e.local, anchor, yaw),
          half: [(e.spec.width * k) / 2, (e.spec.height * k) / 2, 0.04],
          yaw,
        }))
      const legs = (m.stand ?? []).map(
        (x): StaticShape => ({ shape: 'box', pos: toWorld([x, m.elevation / 2, -0.06], anchor, yaw), half: [0.03, m.elevation / 2, 0.03], yaw }),
      )
      return [...slabs, ...legs]
    })
    const actorColliders: ActorCollider[] = []
    const actorKeys: string[] = []
    models.forEach((m, i) => {
      m?.helpers.forEach((h, hi) => {
        const st = layout.stations[i]!
        const scale = actors[h.helper.actor]?.scale ?? 1
        actorColliders.push({ at: toWorld(h.local, st.anchor, st.yaw), radius: 0.32 * scale, height: BODY.height * scale })
        actorKeys.push(hitKey(i, hi))
      })
    })
    const physics = {
      bodies,
      statics: staticShapes(office, spots, exhibitShapes),
      actors: actorColliders,
      actorKeys,
      // Rapier loads about two rail points before the first stop with a prop.
      wakeRail: spots.length ? Math.min(...spots.map((sp) => timing.stopRail[sp.station]!)) - 2.5 : Infinity,
    }
    return { models, layout, transit, office, physics }
  }, [measured, plan, timing, page, k, size, nav, currentHref, style.seed, actors])

  if (!world) return <Membrane />

  return (
    <>
      <CameraRig layout={world.layout} timing={timing} sceneKey={scene.key} />
      {/* After the camera rig: the visitor's hands follow the camera placed this frame (D1). */}
      <Hands />
      <Shards />
      {/* The entrance as one cutscene (fall → look at the hands → walk-in → coffee), once per page view. */}
      <Cutscene timing={timing} welcome={!!scene.welcome} />
      {/* The coffee welcome (D3): at the end of the entrance, started by the cutscene. */}
      {scene.welcome && (
        <CoffeeScene
          welcome={scene.welcome}
          viewpoint={world.layout.rail[1]!}
          focus={world.layout.look[1]!}
          floorY={world.layout.zoneFrames[0]?.level ?? 0}
          timing={timing}
        />
      )}
      {arrivedHere && world.layout.stations[0] && (
        <ArrivalDoor viewpoint={world.layout.stations[0].viewpoint} focus={world.layout.stations[0].focus} />
      )}
      <Membrane />
      <Office data={world.office} accent={style.accent} />
      {/* Floating shapes are off inside the office (perPoint 0); raise it to bring them back. */}
      <Decor rail={world.layout.rail} clearance={world.layout.corridorHalfWidth} perPoint={0} />
      <HeroTransit items={world.transit} k={k} viewport={size} sceneKey={scene.key} />
      {/* Re-mounted when the layout changes (resize): a fresh physics world for the new layout. */}
      <Physics key={`${size.width}x${size.height}`} {...world.physics} timing={timing} ceilingY={OFFICE.ceilingY} />
      {plan.stops.map((stop, i) => {
        const station = world.layout.stations[i]!
        const model = world.models[i]
        const block = page.blocks[stop.blockIndex]!
        if (model) {
          return (
            <Exhibit
              key={i}
              model={model}
              station={station}
              stopIndex={i}
              timing={timing}
              zone={moduleRailRange(plan, timing, stop.blockIndex)!}
              actors={actors}
              k={k}
              showElements={stop.blockIndex !== 0}
            />
          )
        }
        return block.type === 'door' ? (
          <Door3D
            key={i}
            block={block}
            locale={locale}
            station={station}
            index={i}
            timing={timing}
            nav={nav}
            currentHref={currentHref}
            previews={previews}
          />
        ) : null
      })}
    </>
  )
}
