'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/theme/store'
import type { WidgetName } from './catalog'
import { widgets } from './registry'
import s from './WidgetCanvas.module.css'

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A widget in the 2D card: a <canvas> as wide as the card's text column and as tall as the
 * widget says. `data-widget` lets the 3D card put the same drawing on the same spot.
 *
 * Draws only while it is on screen in 2D mode — in 3D mode the 2D page is invisible and the
 * 3D card draws its own copy (world/WidgetPlane.tsx).
 */
export function WidgetCanvas({ name }: { name: WidgetName }) {
  const widget = widgets[name]
  const canvas = useRef<HTMLCanvasElement>(null)
  const ui = useTheme().ui
  const uiRef = useRef(ui)
  useEffect(() => {
    uiRef.current = ui
  }, [ui])
  // The widget's own state object (mutated in place by draw/click).
  const [state] = useState(() => widget.init())

  useEffect(() => {
    const el = canvas.current!
    const ctx = el.getContext('2d')!
    let frame = 0
    let onScreen = false
    const still = reducedMotion()

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      el.width = Math.round(el.clientWidth * dpr)
      el.height = Math.round(widget.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const paint = () => {
      ctx.clearRect(0, 0, el.clientWidth, widget.height)
      const t = still ? widget.stillTime : performance.now() / 1000
      widget.draw({ ctx, t, w: el.clientWidth, h: widget.height, state, ui: uiRef.current })
    }
    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!onScreen || document.documentElement.dataset.experience === '3d') return
      paint()
    }

    size()
    const resize = new ResizeObserver(size)
    resize.observe(el)
    const seen = new IntersectionObserver(([entry]) => {
      onScreen = entry!.isIntersecting
    })
    seen.observe(el)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      seen.disconnect()
    }
  }, [widget, state])

  const point = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top, r.width] as const
  }

  return (
    <div className={s.widget} data-widget={name} style={{ height: widget.height }}>
      <canvas
        ref={canvas}
        className={s.canvas}
        aria-hidden
        onClick={(e) => {
          const [x, y, w] = point(e)
          widget.click?.(state, x, y, w, widget.height, performance.now() / 1000)
        }}
        onMouseMove={(e) => {
          const [x, y, w] = point(e)
          e.currentTarget.style.cursor = widget.hit?.(x, y, w, widget.height) ? 'pointer' : ''
        }}
      />
    </div>
  )
}
