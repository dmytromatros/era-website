'use client'

import { lazy, Suspense, useEffect, useMemo } from 'react'
import type { Page } from '@/content/schema'
import { onElementAction } from '@/experience/elementActions'
import { abortLetter, letterShowDone, openLetter, useLetter } from '@/experience/letter/letterState'
import { useExperience } from '@/experience/store'
import { useArcade } from '../arcade/arcadeState'
import { cutsceneNow } from '../cutscene/cutsceneModel'
import { useMonitor } from '../monitor/monitorState'
import { photoBusy } from '../photo/photoState'
import { useLetterShow } from './letterShow'

// Its own chunk (the paper plane): fetched when the visitor opens the sheet.
const LetterFlight = lazy(() => import('./LetterFlight').then((m) => ({ default: m.LetterFlight })))

/** Longest the 3D show may take to take the sheet over before it is given up (ms). */
const TAKEOVER_LIMIT = 4000

/** Can the sheet open now? Only in 3D, on the rail, nothing else on screen. */
function worldFree(): boolean {
  const x = useExperience.getState()
  if (x.mode !== '3d' || !x.handedOver || x.portal.phase !== 'idle' || x.arrival) return false
  if (cutsceneNow.phase !== 'idle' && cutsceneNow.phase !== 'done') return false
  return useArcade.getState().phase === 'idle' && useMonitor.getState().phase === 'idle' && !photoBusy()
}

/**
 * The letter in 3D (E9) on a page whose CTA has a form: a click on its card (`data-action="letter"`)
 * opens the sheet; while the sheet is open and while the show plays, <LetterFlight> is mounted.
 * Leaving 3D or the page mid-way ends it.
 */
export function LazyLetter({ page }: { page: Page }) {
  const inside = useExperience((s) => s.handedOver)
  const phase = useLetter((s) => s.phase)
  const returning = useLetterShow((s) => s.returning)
  const texts = useMemo(() => {
    for (const b of page.blocks) if (b.type === 'cta' && b.form) return b.form
    return undefined
  }, [page])

  useEffect(() => {
    if (!texts || !inside) return
    return onElementAction('letter', () => {
      if (!worldFree()) return
      void import('./LetterFlight')
      openLetter()
    })
  }, [texts, inside])

  useEffect(() => {
    if (!inside) abortLetter()
  }, [inside])
  useEffect(() => () => abortLetter(), [])
  // The 3D sheet never took over (no chunk, no frame): end it, the letter was still sent.
  useEffect(() => {
    if (phase !== 'flying') return
    const t = window.setTimeout(() => {
      if (!document.documentElement.hasAttribute('data-letter-3d')) letterShowDone()
    }, TAKEOVER_LIMIT)
    return () => window.clearTimeout(t)
  }, [phase])

  if (!texts || !inside || (phase !== 'writing' && phase !== 'flying' && !returning)) return null
  return (
    <Suspense fallback={null}>
      <LetterFlight texts={texts} />
    </Suspense>
  )
}
