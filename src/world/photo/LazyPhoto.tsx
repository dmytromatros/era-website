'use client'

import { lazy, Suspense, useEffect, useMemo } from 'react'
import type { PhotoTexts } from '@/content/schema'
import { useExperience } from '@/experience/store'
import { cancelPhoto, photoBlocked, startPhoto, usePhoto } from './photoState'

// Its own chunk (the hand, the phone, the polaroid), fetched on the button's hover / focus or click.
const Photo = lazy(() => import('./Photo').then((m) => ({ default: m.Photo })))

/** Longest the hand's chunk may take before the moment is given up (the scroll is held meanwhile). */
const LOADING_LIMIT_MS = 10_000

/**
 * The photo moment (E7) while it plays: only in 3D, only after the button. Leaving 3D (or this
 * page) mid-countdown ends it with no picture; so does a chunk that never comes.
 */
export function LazyPhoto({ texts, site, page, accent }: { texts?: PhotoTexts; site: string; page: string; accent: string }) {
  const inside = useExperience((s) => s.handedOver)
  const phase = usePhoto((s) => s.phase)
  const polaroid = useMemo(() => (texts ? { caption: texts.caption, site, page, accent } : null), [texts, site, page, accent])

  useEffect(() => {
    if (phase !== 'idle' && !inside) cancelPhoto()
  }, [phase, inside])
  useEffect(() => {
    if (phase !== 'loading') return
    const t = window.setTimeout(cancelPhoto, LOADING_LIMIT_MS)
    return () => window.clearTimeout(t)
  }, [phase])
  // Leaving the page mid-countdown.
  useEffect(() => () => cancelPhoto(), [])

  // `?debug=1` → window.__eraPhoto: state(), take() (the button), why a photo cannot be taken.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return
    const w = window as unknown as Record<string, unknown>
    w.__eraPhoto = { state: () => ({ ...usePhoto.getState(), blocked: photoBlocked() }), take: startPhoto }
    return () => {
      delete w.__eraPhoto
    }
  }, [])

  if (!inside || phase === 'idle' || !polaroid) return null
  return (
    <Suspense fallback={null}>
      <Photo texts={polaroid} />
    </Suspense>
  )
}
