'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { lockScroll, unlockScroll } from '@/experience/scrollLock'
import { coffeeStatus } from '../coffee/coffeeModel'
import { entranceBreak } from '../firstPerson/breakModel'
import type { Timing } from '../route'
import { entranceUnits, scrollToUnits, totalUnits } from '../timeline'
import { cutsceneNow, newCutscene, stepCutscene } from './cutsceneModel'

/**
 * Plays the entrance cutscene (cutsceneModel.ts): locks the visitor's scroll and moves the page
 * itself — holding it at the crack, then walking the camera through the rest of the entrance —
 * and gives the scroll back after the coffee. The 3D world still follows the scroll as always
 * (rule 1): the cutscene only decides where the page is.
 */
export function Cutscene({ timing, welcome }: { timing: Timing; welcome: boolean }) {
  const state = useMemo(() => newCutscene(), [])
  const hint = useRef<(() => void) | null>(null)
  // Leaving the page (or a hot reload) never leaves the scroll locked, nor the hint up.
  useEffect(
    () => () => {
      unlockScroll()
      hint.current?.()
      cutsceneNow.phase = 'idle'
    },
    [],
  )

  useFrame(({ clock }) => {
    const root = document.documentElement
    const max = root.scrollHeight - window.innerHeight
    const out = stepCutscene(state, {
      now: clock.elapsedTime,
      crackAt: entranceBreak.at,
      crackUnits: entranceUnits(entranceBreak.e0),
      units: scrollToUnits(window.scrollY, max, timing.segments),
      welcome,
      coffee: coffeeStatus.phase,
      coffeeSince: coffeeStatus.since,
    })
    // Over: "scroll to continue" until the visitor really scrolls (not the scene's last nudge).
    if (state.phase === 'done' && cutsceneNow.phase !== 'done' && !hint.current) {
      const html = document.documentElement
      const from = window.scrollY
      html.setAttribute('data-cutscene-hint', '')
      const onScroll = () => {
        if (Math.abs(window.scrollY - from) > 40) hint.current?.()
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      hint.current = () => {
        html.removeAttribute('data-cutscene-hint')
        window.removeEventListener('scroll', onScroll)
      }
    }
    cutsceneNow.phase = state.phase
    if (out.lock) lockScroll()
    else unlockScroll()
    if (out.scroll !== null && max > 0) {
      const y = (out.scroll / totalUnits(timing.segments)) * max
      if (Math.abs(window.scrollY - y) > 0.5) window.scrollTo(0, y)
    }
  })
  return null
}
