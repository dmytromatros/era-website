'use client'

import { lazy, Suspense } from 'react'
import { useExperience } from '@/experience/store'
import type { WorldLayout } from '../layout'
import type { Office } from '../officeModel'
import type { FloorInput } from './Crowd'

// Its own chunk, fetched only once the visitor is inside the 3D world — never on the 2D landing.
const Crowd = lazy(() => import('./Crowd').then((m) => ({ default: m.Crowd })))

/** The office's people (E2a), while the visitor is inside 3D (back on the 2D landing: gone). */
export function LazyCrowd(props: { office: Office; layout: WorldLayout; floor: FloorInput }) {
  const inside = useExperience((s) => s.handedOver)
  if (!inside) return null
  return (
    <Suspense fallback={null}>
      <Crowd {...props} />
    </Suspense>
  )
}
