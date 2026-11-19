/**
 * Holding the page still for a cutscene (Dima, 2026-11-10: the fall into the 3D world and the
 * coffee must not be skippable — "a skills demo, so that's fine"). While locked, the visitor
 * cannot scroll — wheel, trackpad (its inertia too), touch, keys — but the scene itself may still
 * move the page (window.scrollTo works). Clicks keep working: the coffee's buttons, the header.
 *
 * Several owners may hold it (E3): the entrance `cutscene`, the `arcade` (the visitor is inside the
 * machine), the `monitor` (E5: the camera flies into it, back to the top of the page) and the
 * `photo` (E7: the countdown, ~2 s). Each lets go of its own hold only, so the cutscene letting go every frame does not
 * free the arcade's. The cinema bars (`html[data-cutscene]`) are the cutscene's alone; the page
 * stops scrolling under `html[data-scroll-lock]`.
 *
 * A safety net for the cutscene: its hold lets go after `SAFETY_MS` whatever happens (the arcade
 * needs none: Esc, its button and Back always fly out); `unlockScroll` on leaving the page.
 */
const KEYS = new Set([' ', 'Spacebar', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'])
export const SAFETY_MS = 60_000

export type LockOwner = 'cutscene' | 'arcade' | 'monitor' | 'photo'

const holds = new Set<LockOwner>()
let safety = 0

const stop = (e: Event) => {
  if (e.cancelable) e.preventDefault()
}
const keys = (e: KeyboardEvent) => {
  // Space / Enter on a focused button must still press it.
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.isContentEditable || t.tagName === 'INPUT')) return
  if (KEYS.has(e.key)) e.preventDefault()
}

export const scrollLocked = () => holds.size > 0

export function lockScroll(owner: LockOwner = 'cutscene') {
  if (holds.has(owner) || typeof document === 'undefined') return
  const first = holds.size === 0
  holds.add(owner)
  const html = document.documentElement
  if (owner === 'cutscene') {
    html.setAttribute('data-cutscene', '')
    safety = window.setTimeout(() => unlockScroll('cutscene'), SAFETY_MS)
  }
  if (!first) return
  html.setAttribute('data-scroll-lock', '')
  window.addEventListener('wheel', stop, { passive: false })
  window.addEventListener('touchmove', stop, { passive: false })
  window.addEventListener('keydown', keys)
}

export function unlockScroll(owner: LockOwner = 'cutscene') {
  if (!holds.delete(owner)) return
  const html = document.documentElement
  if (owner === 'cutscene') {
    html.removeAttribute('data-cutscene')
    window.clearTimeout(safety)
  }
  if (holds.size) return
  html.removeAttribute('data-scroll-lock')
  window.removeEventListener('wheel', stop)
  window.removeEventListener('touchmove', stop)
  window.removeEventListener('keydown', keys)
}
