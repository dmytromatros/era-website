'use client'

import { lazy, Suspense } from 'react'
import type { ArcadeTexts } from '@/content/schema'
import { useExperience } from '@/experience/store'
import type { WorldLayout } from '../layout'
import type { Office } from '../officeModel'
import type { Timing } from '../route'

// Its own chunk, fetched only once the visitor is inside the 3D world — never on the 2D landing.
const Arcade = lazy(() => import('./Arcade').then((m) => ({ default: m.Arcade })))

/** The arcade machine's screen (E3), while the visitor is inside 3D and there are texts for it. */
export function LazyArcade({
  office,
  layout,
  timing,
  texts,
  accent,
}: {
  office: Office
  layout: WorldLayout
  timing: Timing
  texts?: ArcadeTexts
  accent: string
}) {
  const inside = useExperience((s) => s.handedOver)
  const cabinet = office.arcade[0]
  if (!inside || !cabinet || !texts) return null
  return (
    <Suspense fallback={null}>
      <Arcade cabinet={cabinet} texts={texts} accent={accent} layout={layout} office={office} timing={timing} />
    </Suspense>
  )
}
