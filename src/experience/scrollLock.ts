/**
 * Holding the page still for a cutscene (Dima, 2026-11-10: the fall into the 3D world and the
 * coffee must not be skippable — "a skills demo, so that's fine"). While locked, the visitor
 * cannot scroll — wheel, trackpad (its inertia too), touch, keys — but the scene itself may still
 * move the page (window.scrollTo works). Clicks keep working: the coffee's buttons, the header.
 *
 * A safety net: whatever happens, the lock lets go after `SAFETY_MS`; `unlockScroll` on leaving
 * the page (the cutscene component's cleanup).
 */
const KEYS = new Set([' ', 'Spacebar', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'])
export const SAFETY_MS = 60_000

let locked = false
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

export const scrollLocked = () => locked

export function lockScroll() {
  if (locked || typeof document === 'undefined') return
  locked = true
  document.documentElement.setAttribute('data-cutscene', '')
  window.addEventListener('wheel', stop, { passive: false })
  window.addEventListener('touchmove', stop, { passive: false })
  window.addEventListener('keydown', keys)
  safety = window.setTimeout(unlockScroll, SAFETY_MS)
}

export function unlockScroll() {
  if (!locked) return
  locked = false
  document.documentElement.removeAttribute('data-cutscene')
  window.removeEventListener('wheel', stop)
  window.removeEventListener('touchmove', stop)
  window.removeEventListener('keydown', keys)
  window.clearTimeout(safety)
}
