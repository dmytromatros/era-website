/**
 * Time of day behind the office windows (wow-plan E6): the visitor's own clock picks morning,
 * day, sunset or evening, and the office light follows — the sun's colour, strength and height,
 * the colour of the windows, and the ceiling lamps coming on as it gets dark (OUTDOOR); the
 * office inside keeps the theme's light, air and floor. Pure: no React, no scene — the runtime
 * (<Atmosphere>) blends these numbers in.
 *
 * Costs nothing on the GPU: only light colours, intensities, a light direction and material
 * colours change — uniforms, never defines, so no shader is compiled for it, ever.
 *
 * `day` IS the theme's light as it always was (taken from the theme, not copied here) — only
 * the lamps are off by day (Dima 2026-11-18: they come on when it gets dark). It is on at once
 * from the handover (the office is still behind the whole film in that frame).
 */
import * as THREE from 'three'
import type { Theme } from '@/theme/tokens'

export const TIMES = ['morning', 'day', 'sunset', 'evening'] as const
export type TimeName = (typeof TIMES)[number]

export interface DayLook {
  /** The sun (in the evening: the ceiling lamps' light from above). */
  sun: string
  sunIntensity: number
  /** Where the directional light shines from (towards the origin). */
  sunPos: [number, number, number]
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  /** Unlit window panes: the sky outside. */
  window: string
  /** Unlit ceiling light panels. */
  lamp: string
  /** Fog and background colour. */
  air: string
  /** Multiplies the (unlit) floor texture: '#ffffff' = as is. */
  floor: string
}

/** The theme's own light — the `day` look. */
export function baseLook(world: Theme['world']): DayLook {
  return {
    sun: world.sun,
    sunIntensity: world.sunIntensity,
    sunPos: [6, 12, 8],
    hemiSky: world.hemiSky,
    hemiGround: world.hemiGround,
    hemiIntensity: world.hemiIntensity,
    window: world.office.window,
    lamp: world.office.light,
    air: world.background,
    floor: '#ffffff',
  }
}

/**
 * What changes with the time of day — only what comes from OUTSIDE (Dima 2026-11-18: "if the
 * colour from the windows changes, the lamps' colour should not"; the first version tinted the
 * whole office — sky light, fog, floor, warm lamps — and it all went brown): the sun (colour,
 * strength, how low), the windows, and whether the ceiling lamps are on (`lampsOn` 0…1: off in
 * the morning and by day, coming on at sunset as it gets darker, on in the evening — always the
 * theme's own lamp colour, never tinted). Inside stays the theme's: the sky / ground light, the
 * air (fog and background) and the floor. The evening only dims the sky light a little and cools
 * the shade, as the light now comes from the lamps.
 */
export interface Outdoor {
  sun?: string
  sunIntensity?: number
  sunPos?: [number, number, number]
  window?: string
  hemiGround?: string
  hemiIntensity?: number
  lampsOn: number
}

export const OUTDOOR: Record<TimeName, Outdoor> = {
  // A soft golden sun low from the side, apricot dawn in the windows; lamps off.
  morning: { sun: '#ffe2b5', sunIntensity: 1.35, sunPos: [11, 8, 5], window: '#fde6cc', lampsOn: 0 },
  // The theme's own daylight; lamps off.
  day: { lampsOn: 0 },
  // Golden hour: an orange sun almost level through the windows, orange windows; the lamps come on.
  sunset: { sun: '#ff9a52', sunIntensity: 1.55, sunPos: [12, 5, 6], window: '#ffa768', lampsOn: 0.7 },
  // Dark blue windows; the light comes from the lamps above (white, as the lamps), a cooler shade.
  evening: { sun: '#fffaf2', sunIntensity: 1.05, sunPos: [4, 12, 6], window: '#22305a', hemiGround: '#7a7f96', hemiIntensity: 1.25, lampsOn: 1 },
}

/** A ceiling lamp that is off: its diffuser, a little greyer than the lit panel (not glowing). */
export const lampOff = (lamp: string) => mixHex(lamp, '#cfd2d4', 0.45)

/** The full look of `name`: the theme inside, the time's outdoors on top. */
export function looksOf(name: TimeName, base: DayLook): DayLook {
  const o = OUTDOOR[name]
  return {
    ...base,
    ...(o.sun !== undefined && { sun: o.sun }),
    ...(o.sunIntensity !== undefined && { sunIntensity: o.sunIntensity }),
    ...(o.sunPos !== undefined && { sunPos: o.sunPos }),
    ...(o.window !== undefined && { window: o.window }),
    ...(o.hemiGround !== undefined && { hemiGround: o.hemiGround }),
    ...(o.hemiIntensity !== undefined && { hemiIntensity: o.hemiIntensity }),
    lamp: mixHex(lampOff(base.lamp), base.lamp, o.lampsOn),
  }
}

/**
 * Hours (local clock) where each time is fully on; between two neighbours it blends smoothly
 * (an hour or two — a visit crossing one sees it change, never a jump). Wraps at midnight.
 */
export const SCHEDULE: readonly (readonly [number, TimeName])[] = [
  [5, 'evening'],
  [7, 'morning'],
  [8.5, 'morning'],
  [10.5, 'day'],
  [16.5, 'day'],
  [18.5, 'sunset'],
  [19.5, 'sunset'],
  [21, 'evening'],
]

/** The hour `?time=<name>` shows: the middle of each time. */
export const TIME_HOUR: Record<TimeName, number> = { morning: 7.75, day: 13, sunset: 19, evening: 23 }


/** Re-read the visitor's clock this often (ms); a blend lasts an hour or more. */
export const CLOCK_EVERY_MS = 20_000

export const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600

const wrap = (h: number) => ((h % 24) + 24) % 24
const ease = (t: number) => t * t * (3 - 2 * t)

/** Which two times `hour` sits between, and how far (eased, 0 = all `from`). */
export function phaseAt(hour: number): { from: TimeName; to: TimeName; t: number } {
  const h = wrap(hour)
  const n = SCHEDULE.length
  for (let i = 0; i < n; i++) {
    const [a, from] = SCHEDULE[i]!
    const [b0, to] = SCHEDULE[(i + 1) % n]!
    const b = b0 <= a ? b0 + 24 : b0
    const x = h < a ? h + 24 : h
    if (x >= a && x < b) return { from, to, t: from === to ? 0 : ease((x - a) / (b - a)) }
  }
  return { from: 'day', to: 'day', t: 0 }
}

/** The time that dominates at `hour` (for the debug readout). */
export function timeAt(hour: number): TimeName {
  const { from, to, t } = phaseAt(hour)
  return t < 0.5 ? from : to
}

/** `?time=` → hour: a time name or an hour 0–24 (e.g. `18.25`, to see a blend). */
export function parseTime(value: string | null): number | null {
  if (value === null || value === '') return null
  if ((TIMES as readonly string[]).includes(value)) return TIME_HOUR[value as TimeName]
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= 24 ? n : null
}

const ca = new THREE.Color()
const cb = new THREE.Color()
/** Linear-light blend of two colours (as three.js blends them on the GPU). */
function mixHex(a: string, b: string, t: number): string {
  return '#' + ca.set(a).lerp(cb.set(b), t).getHexString()
}
const mixN = (a: number, b: number, t: number) => a + (b - a) * t

export function blendLook(a: DayLook, b: DayLook, t: number): DayLook {
  if (t <= 0) return a
  if (t >= 1) return b
  return {
    sun: mixHex(a.sun, b.sun, t),
    sunIntensity: mixN(a.sunIntensity, b.sunIntensity, t),
    sunPos: [mixN(a.sunPos[0], b.sunPos[0], t), mixN(a.sunPos[1], b.sunPos[1], t), mixN(a.sunPos[2], b.sunPos[2], t)],
    hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
    hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
    hemiIntensity: mixN(a.hemiIntensity, b.hemiIntensity, t),
    window: mixHex(a.window, b.window, t),
    lamp: mixHex(a.lamp, b.lamp, t),
    air: mixHex(a.air, b.air, t),
    floor: mixHex(a.floor, b.floor, t),
  }
}

/** The look at `hour` (inside: the theme's own; lamps on only as it gets dark). */
export function lookAt(hour: number, base: DayLook): DayLook {
  const { from, to, t } = phaseAt(hour)
  return blendLook(looksOf(from, base), looksOf(to, base), t)
}

/** Relative luminance of a colour in linear light (what the toon shader measures). */
export function lightLuma(hex: string): number {
  ca.set(hex)
  return 0.299 * ca.r + 0.587 * ca.g + 0.114 * ca.b
}

/**
 * The toon bands are relative to the sun's strength (toonMaterial.tsx `eraSun`) as the shader
 * sees it: intensity × the luminance of its colour. Scaled so the theme's own sun gives its
 * own intensity — the bands of both themes stay exactly as before — while a dimmer or more
 * orange sun keeps the same bands on the same surfaces instead of everything dropping a band.
 */
export function toonSunOf(sun: string, intensity: number, base: DayLook): number {
  return (intensity * lightLuma(sun)) / Math.max(lightLuma(base.sun), 1e-3)
}
