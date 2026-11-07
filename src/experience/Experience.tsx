'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { live, selectReady, useExperience } from './store'

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
      live.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1)
      live.pointerUv.x = e.clientX / window.innerWidth
      live.pointerUv.y = 1 - e.clientY / window.innerHeight
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  return mode === '3d' ? <Scene /> : null
}
