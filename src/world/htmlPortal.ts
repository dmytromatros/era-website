import type { RefObject } from 'react'

/**
 * Where drei <Html> overlays (name tags, bubbles, buttons) are mounted. It must be a fixed
 * layer: by default drei uses the event source (document.body) and labels would scroll away.
 * Set by <Scene>, which renders before any <Html> mounts.
 */
const ref: { current: HTMLElement | null } = { current: null }

export const htmlPortal = ref as RefObject<HTMLElement>

export function setHtmlPortal(el: HTMLElement | null) {
  ref.current = el
}
