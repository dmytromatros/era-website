'use client'

import { useEffect, useState } from 'react'
import { metrics } from './Metrics'

/**
 * `?debug=1`: a small panel with what a frame costs (Metrics.tsx) and the quality level.
 * A developer tool for measuring each wow-plan task before / after; the visitor-facing
 * version is the X-ray mode (B4).
 */
export function DebugStats() {
  const [on] = useState(() => typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'))
  const [text, setText] = useState('')

  useEffect(() => {
    if (!on) return
    const id = setInterval(() => {
      const m = metrics
      setText(
        `${m.fps.toFixed(0)} fps · ${m.calls} calls · ${(m.triangles / 1000).toFixed(1)}k tris · ` +
          `${m.geometries} geo · ${m.textures} tex · ${m.level}`,
      )
    }, 500)
    return () => clearInterval(id)
  }, [on])

  if (!on) return null
  return (
    <div
      data-debug-stats
      style={{
        position: 'fixed',
        right: 8,
        bottom: 8,
        zIndex: 50,
        padding: '4px 8px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.7)',
        color: '#fff',
        font: '12px/1.4 ui-monospace, monospace',
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  )
}
