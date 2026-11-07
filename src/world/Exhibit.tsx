'use client'

import type { ActorDef } from '@/content/schema'
import { useTheme } from '@/theme/store'
import { ElementView } from './ElementView'
import type { ExhibitModel } from './exhibitModel'
import { Helper } from './Helper'
import type { StationLayout } from './layout'
import type { Timing } from './route'

interface Props {
  model: ExhibitModel
  station: StationLayout
  stopIndex: number
  timing: Timing
  actors: Record<string, ActorDef>
  k: number
  /** Hero elements are drawn by <HeroTransit> (they fly in from the 2D page). */
  showElements: boolean
}

/** One stop of the journey: a group of page elements standing in space, plus its helpers. */
export function Exhibit({ model, station, stopIndex, timing, actors, k, showElements }: Props) {
  const { world } = useTheme()
  const office = world.office
  return (
    <group position={station.anchor} rotation-y={station.yaw}>
      {/* soft shadow under floating elements */}
      <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2} scale={[Math.max(model.width * 0.45, 0.6), 0.5, 1]}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial color={world.shadow} transparent opacity={world.shadowOpacity * 0.6} />
      </mesh>

      {/* display stand under floating elements */}
      {model.stand &&
        model.stand.map((x, i) => (
          <group key={i} position={[x, 0, -0.06]}>
            <mesh position={[0, model.elevation / 2, 0]}>
              <boxGeometry args={[0.05, model.elevation, 0.05]} />
              <meshStandardMaterial color={office.frame} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.015, 0]}>
              <boxGeometry args={[0.36, 0.03, 0.36]} />
              <meshStandardMaterial color={office.frame} roughness={0.5} />
            </mesh>
          </group>
        ))}

      {showElements &&
        model.elements.map(({ spec, local }) => (
          <group key={spec.id} position={local}>
            <ElementView spec={spec} k={k} />
          </group>
        ))}

      {model.helpers.map((placed, i) => {
        const actor = actors[placed.helper.actor]
        return actor ? <Helper key={i} placed={placed} actor={actor} stopIndex={stopIndex} timing={timing} /> : null
      })}
    </group>
  )
}
