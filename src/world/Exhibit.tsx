'use client'

import type { ActorDef } from '@/content/schema'
import { useTheme } from '@/theme/store'
import { ElementView } from './ElementView'
import type { ExhibitModel } from './exhibitModel'
import { Helper } from './Helper'
import type { StationLayout } from './layout'
import type { StopTiming } from './timeline'

interface Props {
  model: ExhibitModel
  station: StationLayout
  stopIndex: number
  stops: StopTiming[]
  actors: Record<string, ActorDef>
  k: number
  /** Hero elements are drawn by <HeroTransit> (they fly in from the 2D page). */
  showElements: boolean
}

/** One stop of the journey: a group of page elements standing in space, plus its helpers. */
export function Exhibit({ model, station, stopIndex, stops, actors, k, showElements }: Props) {
  const { world } = useTheme()
  return (
    <group position={station.anchor} rotation-y={station.yaw}>
      {/* soft shadow under floating elements */}
      <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2} scale={[Math.max(model.width * 0.45, 0.6), 0.5, 1]}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial color={world.shadow} transparent opacity={world.shadowOpacity * 0.6} />
      </mesh>

      {showElements &&
        model.elements.map(({ spec, local }) => (
          <group key={spec.id} position={local}>
            <ElementView spec={spec} k={k} />
          </group>
        ))}

      {model.helpers.map((placed, i) => {
        const actor = actors[placed.helper.actor]
        return actor ? <Helper key={i} placed={placed} actor={actor} stopIndex={stopIndex} stops={stops} /> : null
      })}
    </group>
  )
}
