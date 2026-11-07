'use client'

import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { Door3D } from '@/blocks/door/Door3D'
import type { SceneData } from '@/experience/store'
import { useExperience } from '@/experience/store'
import { CameraRig } from './CameraRig'
import { buildExhibit, type ExhibitModel } from './exhibitModel'
import { Exhibit } from './Exhibit'
import { HeroTransit, type TransitItem } from './HeroTransit'
import { ENTRANCE_GEOMETRY, layoutWorld, type StationInput } from './layout'
import { Membrane } from './Membrane'
import { pageStops } from './stops'

const VISIBLE_HEIGHT =
  2 * ENTRANCE_GEOMETRY.heroDistance * Math.tan(THREE.MathUtils.degToRad(ENTRANCE_GEOMETRY.fov / 2))
const DOOR_SIZE: StationInput = { width: 2.4, height: 3.6, align: 'center' }

/** Everything that belongs to one page. Re-mounted (via `key`) when the route changes. */
export function SceneContent({ scene }: { scene: SceneData }) {
  const { page, locale, actors } = scene
  const size = useThree((s) => s.size)
  const measured = useExperience((s) => (s.elements && s.elements.sceneKey === scene.key ? s.elements.blocks : null))

  // World units per CSS pixel: an element seen from `heroDistance` looks as big as in 2D.
  const k = VISIBLE_HEIGHT / size.height
  const stops = useMemo(() => pageStops(page), [page])

  const world = useMemo(() => {
    if (!measured) return null
    const models: (ExhibitModel | null)[] = stops.map((stop) => {
      if (!stop.exhibit) return null
      const block = page.blocks[stop.blockIndex]!
      const helpers = 'helpers' in block ? block.helpers : []
      return buildExhibit(measured[stop.blockIndex] ?? [], stop.exhibit.elements, helpers, k)
    })
    const layout = layoutWorld(
      models.map((m) => (m ? { width: m.width, height: m.height, align: 'side' } : DOOR_SIZE)),
      size.width / size.height,
    )
    // Hero elements fly from the 2D page to their spots in the hero exhibits.
    const transit: TransitItem[] = stops.flatMap((stop, i) => {
      const model = models[i]
      if (stop.blockIndex !== 0 || !model) return []
      const { anchor, yaw } = layout.stations[i]!
      return model.elements.map(({ spec, local }) => ({ spec, target: { local, anchor, yaw } }))
    })
    return { models, layout, transit }
  }, [measured, stops, page, k, size])

  if (!world) return <Membrane />

  return (
    <>
      <CameraRig layout={world.layout} stops={stops} />
      <Membrane />
      <HeroTransit items={world.transit} k={k} viewport={size} sceneKey={scene.key} />
      {stops.map((stop, i) => {
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
              stops={stops}
              actors={actors}
              k={k}
              showElements={stop.blockIndex !== 0}
            />
          )
        }
        return block.type === 'door' ? (
          <Door3D key={i} block={block} locale={locale} station={station} index={i} stops={stops} />
        ) : null
      })}
    </>
  )
}
