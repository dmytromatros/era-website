'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { useExperience } from '@/experience/store'
import { scrollLocked } from '@/experience/scrollLock'
import { cutsceneNow } from './cutscene/cutsceneModel'
import type { Timing } from './route'
import { SETTLE, settleAnchors, settleDuration, settleEase, settleTarget } from './settleModel'
import { scrollToUnits, totalUnits } from './timeline'

/** Keys that scroll the page. */
const KEYS = new Set([' ', 'Spacebar', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'])

/**
 * The magnet (settleModel.ts): when the visitor lets go almost on a stop, the page glides the
 * last bit onto it; anywhere else it stays where they let go. Like the cutscene, it only moves the page — the 3D world
 * follows the scroll as always (rule 1). Only the visitor's own scrolling (wheel, trackpad and
 * its inertia, touch, keys, the scrollbar) starts it; a page moved by code (a portal arrival,
 * Back, a test script going to a rail point) is left where it is. Any scroll of theirs during
 * the glide takes over at once. Costs nothing between glides: a few passive listeners.
 */
export function Settle({ timing }: { timing: Timing }) {
  const anchors = useMemo(() => settleAnchors(timing), [timing])
  const s = useRef({
    /** Last input from the visitor / last scroll of theirs (performance.now(), ms). */
    inputAt: -Infinity,
    activeAt: -Infinity,
    /** A finger on the screen / a mouse button held (dragging the scrollbar). */
    touching: false,
    holding: false,
    /** The visitor moved the page since the last settle. */
    moved: false,
    lastY: 0,
    /** The glide in flight (scroll units, real time in ms), and the scroll it last set (px). */
    glide: null as null | { from: number; to: number; start: number; ms: number },
    setY: NaN,
  })

  useEffect(() => {
    const st = s.current
    st.lastY = window.scrollY
    const input = () => {
      st.inputAt = performance.now()
    }
    // A finger or a mouse button down mid-glide: stop it here; it may pull again once they let go.
    // (A wheel or a key needs no such stop: what they scroll moves the page off the glide,
    // and onScroll sees that. A trackpad's inertia tail that does not move the page cannot.)
    const grab = () => {
      if (!st.glide) return
      st.moved = true
      st.glide = null
    }
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) input()
    }
    const onTouchStart = () => {
      st.touching = true
      input()
      grab()
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) st.touching = false
      st.inputAt = performance.now()
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      st.holding = true
      input()
      grab()
    }
    const onUp = () => {
      st.holding = false
    }
    // A button let go outside the window never reports its pointerup.
    const onBlur = () => {
      st.holding = st.touching = false
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (KEYS.has(e.key)) input()
    }
    const onScroll = () => {
      const y = window.scrollY
      const dy = y - st.lastY
      st.lastY = y
      if (dy === 0) return
      // Our own glide: not the visitor.
      if (st.glide && Math.abs(y - st.setY) <= 2) return
      const now = performance.now()
      const theirs =
        st.touching || st.holding || now - st.inputAt < SETTLE.inputMs || now - st.activeAt < SETTLE.idleMs
      if (!theirs) return
      st.glide = null
      st.moved = true
      st.activeAt = now
    }
    const opts = { passive: true } as const
    window.addEventListener('wheel', onWheel, opts)
    window.addEventListener('touchstart', onTouchStart, opts)
    window.addEventListener('touchend', onTouchEnd, opts)
    window.addEventListener('touchcancel', onTouchEnd, opts)
    window.addEventListener('pointerdown', onDown, opts)
    window.addEventListener('pointerup', onUp, opts)
    window.addEventListener('pointercancel', onUp, opts)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    window.addEventListener('scroll', onScroll, opts)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  useFrame(() => {
    const st = s.current
    const x = useExperience.getState()
    const cutscene = cutsceneNow.phase !== 'idle' && cutsceneNow.phase !== 'done'
    // The cutscene, a portal or an arrival own the page; back in 2D there is nothing to settle.
    if (!x.handedOver || x.portal.phase !== 'idle' || x.arrival || cutscene || scrollLocked()) {
      st.glide = null
      st.moved = false
      return
    }
    const max = document.documentElement.scrollHeight - window.innerHeight
    if (max <= 0) return
    const total = totalUnits(timing.segments)
    const now = performance.now()

    if (st.glide) {
      const g = st.glide
      const t = (now - g.start) / g.ms
      const y = ((g.from + (g.to - g.from) * settleEase(t)) / total) * max
      st.setY = y
      if (Math.abs(window.scrollY - y) > 0.5) window.scrollTo(0, y)
      if (t >= 1) st.glide = null
      return
    }

    if (!st.moved || st.touching || st.holding || now - st.activeAt < SETTLE.idleMs) return
    st.moved = false
    const units = scrollToUnits(window.scrollY, max, timing.segments)
    const to = settleTarget(units, anchors)
    if (to === null) return
    st.glide = { from: units, to, start: now, ms: settleDuration(to - units) * 1000 }
  })
  return null
}
