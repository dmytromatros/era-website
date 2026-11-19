'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { sceneKeyOf } from './portal'
import { PortalOverlay } from './PortalOverlay'
import { live, selectReady, useExperience } from './store'
import { canvasHeight } from './viewport'

// three.js only downloads when the 3D layer is actually used.
const Scene = dynamic(() => import('@/world/Scene').then((m) => m.Scene), { ssr: false })

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

/** Decides 2D vs 3D once, mirrors experience state onto <html>, and hosts the canvas. */
export function Experience() {
  const mode = useExperience((s) => s.mode)

  useEffect(() => {
    const capable = supportsWebGL2()
    const forced2d = new URLSearchParams(window.location.search).get('mode') === '2d'
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const { setCapable, setMode } = useExperience.getState()
    setCapable(capable)
    setMode(capable && !forced2d && !reducedMotion ? '3d' : '2d')
  }, [])

  // CSS reacts to these attributes (hero becomes fixed, 2D blocks hide, swap on handover).
  useEffect(() => {
    const html = document.documentElement
    const apply = () => {
      const s = useExperience.getState()
      html.dataset.experience = s.mode
      html.toggleAttribute('data-ready', selectReady(s))
      html.toggleAttribute('data-handover', s.handedOver)
    }
    apply()
    return useExperience.subscribe(apply)
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      live.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      // The canvas's height, not the window's: on a phone it is the large viewport (viewport.ts).
      const h = canvasHeight()
      live.pointer.y = -((e.clientY / h) * 2 - 1)
      live.pointerUv.x = e.clientX / window.innerWidth
      live.pointerUv.y = 1 - e.clientY / h
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // Back / Forward: if the visitor was inside 3D on that page, return there (covered, no 2D flash).
  useEffect(() => {
    const onPop = () => {
      const s = useExperience.getState()
      if (s.mode !== '3d') return
      // Back / Forward within the same page (the arcade's history entry, E3): nothing to cover.
      if (sceneKeyOf(window.location.pathname) === s.scene?.key) return
      const y = live.positions[sceneKeyOf(window.location.pathname)]
      if (y === undefined || y < 4) return
      document.documentElement.setAttribute('data-arrival', '')
      s.setArrival({ kind: 'back', scrollY: y })
      s.setPortal('covered', { target: null, origin: { x: 0.5, y: 0.5 } })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return (
    <>
      {mode === '3d' && <Scene />}
      <PortalOverlay />
    </>
  )
}
