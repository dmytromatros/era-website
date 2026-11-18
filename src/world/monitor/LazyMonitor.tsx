'use client'

import { lazy, Suspense } from 'react'
import type { MonitorTexts } from '@/content/schema'
import { useExperience } from '@/experience/store'
import type { WorldLayout } from '../layout'
import type { Office } from '../officeModel'
import type { Timing } from '../route'

// Its own chunk, fetched only once the visitor is inside the 3D world — never on the 2D landing.
const Monitor = lazy(() => import('./Monitor').then((m) => ({ default: m.Monitor })))

/** The monitor's screen (E5), while the visitor is inside 3D and there are texts for it. */
export function LazyMonitor({
  office,
  layout,
  timing,
  texts,
}: {
  office: Office
  layout: WorldLayout
  timing: Timing
  texts?: MonitorTexts
}) {
  const inside = useExperience((s) => s.handedOver)
  const desk = office.monitor[0]
  if (!inside || !desk || !texts) return null
  return (
    <Suspense fallback={null}>
      <Monitor desk={desk} texts={texts} layout={layout} office={office} timing={timing} />
    </Suspense>
  )
}
