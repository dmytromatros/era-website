'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { live, useExperience } from '@/experience/store'
import { useTheme, useThemeStore } from '@/theme/store'
import { dayFrame } from './daylight/dayFrame'
import {
  baseLook,
  CLOCK_EVERY_MS,
  DAY_FADE,
  hourOf,
  lookAt,
  parseTime,
  timeAt,
  toonSunOf,
  type DayLook,
} from './daylight/daylightModel'
import { useQualitySettings } from './quality'
import { entranceAt } from './timeline'
import { toonSun } from './toonMaterial'

/** `?time=morning|day|sunset|evening` or an hour (`?time=18.25`) — fixed for the visit. */
const forcedHour = typeof location === 'undefined' ? null : parseTime(new URLSearchParams(location.search).get('time'))

const c = new THREE.Color()

/**
 * Background, fog and lights — from the current theme, and the time of day of the visitor's
 * clock over it (E6, daylight/daylightModel.ts): sun, sky light, air, and — through `dayFrame` —
 * windows, ceiling lamps and the floor. The time fades in with the film tear like the style
 * (DAY_FADE), so the 2D → 3D swap frame is untouched; the dark theme ("night office") keeps
 * its own light. Only colours, intensities and the light direction change: no shader compiles.
 */
export function Atmosphere() {
  const { world } = useTheme()
  const themeName = useThemeStore((s) => s.name)
  const { daylight } = useQualitySettings()
  const base = useMemo(() => baseLook(world), [world])

  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const background = useRef<THREE.Color>(null)
  const fog = useRef<THREE.Fog>(null)

  const state = useRef({
    // the clock is read on the first frame (and every CLOCK_EVERY_MS after)
    hour: forcedHour ?? 12,
    readAt: -Infinity,
    look: null as DayLook | null,
    lookOf: null as DayLook | null,
    lookHour: NaN,
    mix: -1,
    // the look as colours, so the frame only lerps
    to: {
      sun: new THREE.Color(),
      hemiSky: new THREE.Color(),
      hemiGround: new THREE.Color(),
      air: new THREE.Color(),
      sunPos: new THREE.Vector3(),
    },
    baseSunPos: new THREE.Vector3(),
  })

  useFrame(() => {
    const s = state.current
    const now = performance.now()
    if (forcedHour === null && now - s.readAt > CLOCK_EVERY_MS) {
      s.readAt = now
      s.hour = hourOf(new Date())
    }
    // A new look only when the clock or the theme moved (a few times a minute at most).
    let changed = false
    if (s.lookOf !== base || s.lookHour !== s.hour) {
      const look = lookAt(s.hour, base)
      s.look = look
      s.lookOf = base
      s.lookHour = s.hour
      s.to.sun.set(look.sun)
      s.to.hemiSky.set(look.hemiSky)
      s.to.hemiGround.set(look.hemiGround)
      s.to.air.set(look.air)
      s.to.sunPos.set(...look.sunPos)
      s.baseSunPos.set(...base.sunPos)
      dayFrame.window.set(look.window)
      dayFrame.lamp.set(look.lamp)
      dayFrame.floor.set(look.floor)
      changed = true
    }
    // 0 until the handover and at the top, grows with the film tear (live.progress is already
    // smoothed, rule 1), like the style in Effects.tsx. The dark theme keeps its own light.
    const entrance = Math.min(Math.max(entranceAt(live.progress), 0), 1)
    const on = daylight && themeName === 'light' && useExperience.getState().handedOver
    const mix = on ? THREE.MathUtils.smoothstep(entrance, DAY_FADE.from, DAY_FADE.to) : 0
    if (mix !== s.mix) changed = true
    if (!changed) return
    s.mix = mix
    const look = s.look!
    const l = sun.current
    const h = hemi.current
    if (l) {
      l.color.set(base.sun).lerp(s.to.sun, mix)
      l.intensity = THREE.MathUtils.lerp(base.sunIntensity, look.sunIntensity, mix)
      l.position.copy(s.baseSunPos).lerp(s.to.sunPos, mix)
      // Cartoon bands are relative to the sun's strength (toonMaterial.tsx).
      toonSun.value = toonSunOf('#' + l.color.getHexString(), l.intensity, base)
    }
    if (h) {
      h.color.set(base.hemiSky).lerp(s.to.hemiSky, mix)
      h.groundColor.set(base.hemiGround).lerp(s.to.hemiGround, mix)
      h.intensity = THREE.MathUtils.lerp(base.hemiIntensity, look.hemiIntensity, mix)
    }
    c.set(base.air).lerp(s.to.air, mix)
    background.current?.copy(c)
    fog.current?.color.copy(c)
    dayFrame.mix = mix
    dayFrame.version++
  })

  // Debugging (`?debug=1`): window.__eraDaylight.state() — the clock hour, its time, the mix.
  useEffect(() => {
    if (typeof location === 'undefined' || !new URLSearchParams(location.search).has('debug')) return
    const w = window as unknown as { __eraDaylight?: unknown }
    w.__eraDaylight = {
      state: () => {
        const s = state.current
        return { hour: s.hour, time: timeAt(s.hour), forced: forcedHour !== null, mix: s.mix, look: s.look }
      },
    }
    return () => {
      delete w.__eraDaylight
    }
  }, [])

  return (
    <>
      <color ref={background} attach="background" args={[world.background]} />
      <fog ref={fog} attach="fog" args={[world.background, world.fogNear, world.fogFar]} />
      <hemisphereLight ref={hemi} args={[world.hemiSky, world.hemiGround, world.hemiIntensity]} />
      <directionalLight ref={sun} position={[6, 12, 8]} color={world.sun} intensity={world.sunIntensity} />
    </>
  )
}
