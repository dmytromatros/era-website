'use client'

/**
 * Passing between pages without leaving 3D.
 *
 * 1. `portalTo` — the camera dives into a door and the portal cover grows over the screen;
 *    once covered, the route changes with an `arrival` note for the next page.
 * 2. The next page (PageView) sees the note: keeps its 2D hero hidden, waits until its office is
 *    built, scrolls just past the entrance (or back to where the visitor was) and hands over at
 *    once — then `reveal()` fades the cover and the visitor steps out of an arrival door.
 *
 * Direct visits and reloads still start in 2D.
 */
import { isInternal } from '@/lib/href'
import { live, useExperience } from './store'

export const PORTAL_TIMING = {
  /** Camera dive + cover growing, before the route changes. */
  dive: 650,
  /** Cover fading away in the next office. */
  reveal: 750,
  /** Give up waiting for the next office after this and reveal anyway. */
  timeout: 5000,
}

/** Scene key for a pathname: `/en` → `en/`, `/en/contacts` → `en/contacts` (see page.tsx). */
export function sceneKeyOf(pathname: string): string {
  const [locale = '', ...rest] = pathname.split('/').filter(Boolean)
  return `${locale}/${rest.join('/')}`
}

/** Go to another page through a portal. `href` must already be localised. */
export function portalTo(
  href: string,
  opts: { target?: [number, number, number]; origin?: { x: number; y: number } } = {},
) {
  const s = useExperience.getState()
  if (s.portal.phase !== 'idle') return
  if (!isInternal(href)) {
    window.location.href = href
    return
  }
  if (sceneKeyOf(href) === s.scene?.key) return
  s.setPortal('diving', {
    target: opts.target ?? null,
    origin: opts.origin ?? { x: live.pointerUv.x, y: 1 - live.pointerUv.y },
  })
  s.ripple()
  window.setTimeout(() => {
    const st = useExperience.getState()
    st.setArrival({ kind: 'portal', scrollY: null })
    st.setPortal('covered')
    document.documentElement.setAttribute('data-arrival', '')
    st.navigate?.(href, { scroll: false })
  }, PORTAL_TIMING.dive)
}

/** Fade the cover away (called by the arriving page once its office is on screen). */
export function reveal() {
  const s = useExperience.getState()
  if (s.portal.phase === 'idle') return
  s.setPortal('revealing')
  window.setTimeout(() => {
    if (useExperience.getState().portal.phase === 'revealing') useExperience.getState().setPortal('idle')
  }, PORTAL_TIMING.reveal)
}
