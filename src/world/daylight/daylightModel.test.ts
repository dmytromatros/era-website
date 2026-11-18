import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { themes } from '@/theme/tokens'
import {
  baseLook,
  blendLook,
  hourOf,
  lightLuma,
  looksOf,
  lampOff,
  OUTDOOR,
  lookAt,
  parseTime,
  phaseAt,
  SCHEDULE,
  TIME_HOUR,
  TIMES,
  timeAt,
  toonSunOf,
  type DayLook,
} from './daylightModel'

const base = baseLook(themes.light.world)
const warmth = (hex: string) => {
  const c = new THREE.Color(hex)
  return c.r / Math.max(c.b, 1e-3)
}
/** Largest change of any number in the look (colours per channel, linear). */
function distance(a: DayLook, b: DayLook): number {
  const ca = new THREE.Color()
  const cb = new THREE.Color()
  let d = 0
  for (const k of Object.keys(a) as (keyof DayLook)[]) {
    const x = a[k]
    const y = b[k]
    if (typeof x === 'number') d = Math.max(d, Math.abs(x - (y as number)))
    else if (typeof x === 'string') {
      ca.set(x)
      cb.set(y as string)
      d = Math.max(d, Math.abs(ca.r - cb.r), Math.abs(ca.g - cb.g), Math.abs(ca.b - cb.b))
    } else {
      // the light's direction, not its position in metres
      const u = new THREE.Vector3(...(x as [number, number, number])).normalize()
      const v = new THREE.Vector3(...(y as [number, number, number])).normalize()
      d = Math.max(d, u.angleTo(v))
    }
  }
  return d
}

describe('time of day from the clock (E6)', () => {
  it('reads the local clock as a fractional hour', () => {
    expect(hourOf(new Date(2026, 10, 18, 13, 30))).toBeCloseTo(13.5)
    expect(hourOf(new Date(2026, 10, 18, 0, 0))).toBe(0)
  })

  it('picks morning, day, sunset and evening at the expected hours', () => {
    expect(timeAt(3)).toBe('evening')
    expect(timeAt(7.75)).toBe('morning')
    expect(timeAt(12)).toBe('day')
    expect(timeAt(15)).toBe('day')
    expect(timeAt(19)).toBe('sunset')
    expect(timeAt(22)).toBe('evening')
    expect(timeAt(23.99)).toBe('evening')
    for (const name of TIMES) expect(timeAt(TIME_HOUR[name])).toBe(name)
  })

  it('holds each time fully on its plateau and blends between neighbours', () => {
    expect(phaseAt(13)).toEqual({ from: 'day', to: 'day', t: 0 })
    expect(phaseAt(2)).toEqual({ from: 'evening', to: 'evening', t: 0 })
    const mid = phaseAt(9.5) // morning (8.5) → day (10.5)
    expect(mid.from).toBe('morning')
    expect(mid.to).toBe('day')
    expect(mid.t).toBeCloseTo(0.5)
  })

  it('never jumps: a minute of clock changes the light only a little, across midnight too', () => {
    let worst = 0
    let prev = lookAt(0, base)
    for (let m = 1; m <= 24 * 60; m++) {
      const next = lookAt(m / 60, base)
      worst = Math.max(worst, distance(prev, next))
      prev = next
    }
    // the steepest blend (sunset → evening, 1.5 h) moves ≈ 0.01 a minute; 8-bit colours round
    expect(worst).toBeLessThan(0.03)
    expect(distance(lookAt(0, base), lookAt(24, base))).toBe(0)
  })

  it('the schedule runs forward through the day', () => {
    for (let i = 1; i < SCHEDULE.length; i++) expect(SCHEDULE[i]![0]).toBeGreaterThan(SCHEDULE[i - 1]![0])
  })
})

describe('the light of each time (E6)', () => {
  const LOOKS = { morning: looksOf('morning', base), sunset: looksOf('sunset', base), evening: looksOf('evening', base) }

  it('day is the theme as it always was — but with the lamps off', () => {
    expect({ ...lookAt(13, base), lamp: base.lamp }).toEqual(base)
    expect(lookAt(13, base).lamp).toBe(lampOff(base.lamp))
    expect(base.sun).toBe(themes.light.world.sun)
    expect(base.sunIntensity).toBe(themes.light.world.sunIntensity)
    expect(base.window).toBe(themes.light.world.office.window)
    expect(base.lamp).toBe(themes.light.world.office.light)
    expect(base.air).toBe(themes.light.world.background)
    expect(base.floor).toBe('#ffffff')
  })

  it('only the outdoors changes: the air, the floor and the sky light stay the theme’s (Dima 2026-11-18)', () => {
    for (const look of Object.values(LOOKS)) {
      expect(look.air).toBe(base.air)
      expect(look.floor).toBe(base.floor)
      expect(look.hemiSky).toBe(base.hemiSky)
    }
    expect(LOOKS.morning.hemiIntensity).toBe(base.hemiIntensity)
    expect(LOOKS.sunset.hemiIntensity).toBe(base.hemiIntensity)
  })

  it('the lamps: off by day and in the morning, coming on at sunset, on in the evening — never tinted', () => {
    expect(LOOKS.morning.lamp).toBe(lampOff(base.lamp))
    expect(LOOKS.evening.lamp).toBe(base.lamp)
    expect(OUTDOOR.sunset.lampsOn).toBeGreaterThan(0)
    expect(OUTDOOR.sunset.lampsOn).toBeLessThan(1)
    expect(lightLuma(lampOff(base.lamp))).toBeLessThan(lightLuma(base.lamp))
    // off is the same hue, only greyer: no warm cast
    expect(warmth(lampOff(base.lamp))).toBeLessThan(1.1)
  })

  it('sunset is warmer and lower than day, evening dark outside', () => {
    const { sunset, evening, morning } = LOOKS
    expect(warmth(sunset.sun)).toBeGreaterThan(warmth(base.sun) * 2)
    expect(warmth(sunset.window)).toBeGreaterThan(warmth(base.window) * 2)
    expect(sunset.sunPos[1]).toBeLessThan(base.sunPos[1])
    expect(morning.sunPos[1]).toBeLessThan(base.sunPos[1])
    expect(lightLuma(evening.window)).toBeLessThan(0.05)
    expect(lightLuma(evening.lamp)).toBeGreaterThan(lightLuma(evening.window) * 10)
    expect(evening.hemiIntensity).toBeLessThan(base.hemiIntensity)
  })

  it('evening still lights the office enough to read a card', () => {
    // the darkest look: sky light + the lamps' light, in the units the shader adds them
    const e = LOOKS.evening
    const light = e.hemiIntensity * lightLuma(e.hemiSky) + e.sunIntensity * lightLuma(e.sun) * 0.5
    expect(light).toBeGreaterThan(0.9)
  })

  it('every look is a valid colour set', () => {
    for (const look of [base, ...Object.values(LOOKS)]) {
      for (const k of ['sun', 'hemiSky', 'hemiGround', 'window', 'lamp', 'air', 'floor'] as const)
        expect(look[k]).toMatch(/^#[0-9a-f]{6}$/)
      expect(look.sunIntensity).toBeGreaterThan(0)
      expect(look.hemiIntensity).toBeGreaterThan(0)
    }
  })

  it('blends end on end', () => {
    expect(blendLook(base, LOOKS.sunset, 0)).toBe(base)
    expect(blendLook(base, LOOKS.sunset, 1)).toBe(LOOKS.sunset)
    const half = blendLook(base, LOOKS.sunset, 0.5)
    expect(half.sunIntensity).toBeCloseTo((base.sunIntensity + LOOKS.sunset.sunIntensity) / 2)
  })

  it('keeps the toon bands of both themes as they were', () => {
    expect(toonSunOf(base.sun, base.sunIntensity, base)).toBeCloseTo(themes.light.world.sunIntensity)
    const dark = baseLook(themes.dark.world)
    expect(toonSunOf(dark.sun, dark.sunIntensity, dark)).toBeCloseTo(themes.dark.world.sunIntensity)
    // an orange sun measures weaker, so the bands are rescaled with it
    expect(toonSunOf(LOOKS.sunset.sun, 1, base)).toBeLessThan(1)
  })

})

describe('?time= (E6)', () => {
  it('takes a time name or an hour', () => {
    expect(parseTime('sunset')).toBe(TIME_HOUR.sunset)
    expect(parseTime('morning')).toBe(TIME_HOUR.morning)
    expect(parseTime('18.25')).toBe(18.25)
    expect(parseTime('0')).toBe(0)
    expect(parseTime(null)).toBeNull()
    expect(parseTime('')).toBeNull()
    expect(parseTime('noon')).toBeNull()
    expect(parseTime('25')).toBeNull()
    expect(parseTime('-1')).toBeNull()
  })
})
