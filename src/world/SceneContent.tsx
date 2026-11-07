'use client'

import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { Door3D } from '@/blocks/door/Door3D'
import type { SceneData } from '@/experience/store'
import { useExperience } from '@/experience/store'
import { CameraRig } from './CameraRig'
import { Decor } from './Decor'
import { buildExhibit, type ExhibitModel } from './exhibitModel'
import { Exhibit } from './Exhibit'
import { HeroTransit, type TransitItem } from './HeroTransit'
import { ENTRANCE_GEOMETRY, layoutRoute, type ExhibitSize } from './layout'
import { Membrane } from './Membrane'
import { buildOffice } from './officeModel'
import { Office } from './Office'
import { planTiming, routePlan } from './route'

const VISIBLE_HEIGHT =
  2 * ENTRANCE_GEOMETRY.heroDistance * Math.tan(THREE.MathUtils.degToRad(ENTRANCE_GEOMETRY.fov / 2))
const DOOR_SIZE: ExhibitSize = { width: 2.4, height: 3.6 }

/** Everything that belongs to one page. Re-mounted (via `key`) when the route changes. */
export function SceneContent({ scene }: { scene: SceneData }) {
  const { page, locale, actors } = scene
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
      models.map((m) => (m ? { width: m.width, height: m.height } : DOOR_SIZE)),
      size.width / size.height,
    )
    // Hero elements fly from the 2D page to their spots in the hero exhibits.
    const transit: TransitItem[] = plan.stops.flatMap((stop, i) => {
      const model = models[i]
      if (stop.blockIndex !== 0 || !model) return []
      const { anchor, yaw } = layout.stations[i]!
      return model.elements.map(({ spec, local }) => ({ spec, target: { local, anchor, yaw } }))
    })
    return { models, layout, transit, office: buildOffice(layout) }
  }, [measured, plan, page, k, size])

  if (!world) return <Membrane />

  return (
    <>
      <CameraRig layout={world.layout} timing={timing} />
      <Membrane />
      <Office data={world.office} />
      {/* Floating shapes are off inside the office (perPoint 0); raise it to bring them back. */}
      <Decor rail={world.layout.rail} clearance={world.layout.corridorHalfWidth} perPoint={0} />
      <HeroTransit items={world.transit} k={k} viewport={size} sceneKey={scene.key} />
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
              actors={actors}
              k={k}
              showElements={stop.blockIndex !== 0}
            />
          )
        }
        return block.type === 'door' ? (
          <Door3D key={i} block={block} locale={locale} station={station} index={i} timing={timing} />
        ) : null
      })}
    </>
  )
}
