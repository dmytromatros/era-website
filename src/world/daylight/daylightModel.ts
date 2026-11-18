/**
 * Time of day behind the office windows (wow-plan E6): the visitor's own clock picks morning,
 * day, sunset or evening, and the office light follows — the sun's colour, strength and height,
 * the sky / ground light (the hemisphere light IS the sky gradient on every lit surface), the
 * colour of the windows, warm ceiling lamps in the evening, the air (fog) and a tint of the
 * unlit floor. Pure: no React, no scene — the runtime (<Atmosphere>) blends these numbers in.
 *
 * Costs nothing on the GPU: only light colours, intensities, a light direction and material
 * colours change — uniforms, never defines, so no shader is compiled for it, ever.
 *
 * `day` IS the theme as it always was (taken from the theme, not copied here), so at midday
 * the office looks exactly as before. The others are blended in only with the entrance (the
 * film tear, like the style: `DAY_FADE`), so the frame of the 2D → 3D swap is never touched.
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
 * The other three times (light theme; the dark theme is the "night office" already and keeps
 * its own light). Kept bright enough that cards and characters stay readable: the darkest
 * (evening) still lights a white card well above its text.
 */
export const LOOKS: Record<Exclude<TimeName, 'day'>, DayLook> = {
  // Fresh and pale: a soft golden sun low from the side, cool sky, apricot dawn in the windows.
  morning: {
    sun: '#ffe2b5',
    sunIntensity: 1.35,
    sunPos: [11, 8, 5],
    hemiSky: '#e8f0ff',
    hemiGround: '#d9cfc2',
    hemiIntensity: 1.5,
    window: '#fde6cc',
    lamp: '#ffffff',
    air: '#f1eee8',
    floor: '#fff4e6',
  },
  // Golden hour: an orange sun almost level, warm sky, violet shade, orange windows.
  sunset: {
    sun: '#ff9a52',
    sunIntensity: 1.55,
    sunPos: [12, 5, 6],
    hemiSky: '#ffc7a0',
    hemiGround: '#9b7f8c',
    hemiIntensity: 1.3,
    window: '#ffa768',
    lamp: '#ffe3b3',
    air: '#ead2c0',
    floor: '#ffe4cc',
  },
  // Dark blue windows, warm lamps: the directional light becomes the lamps' warm light from
  // above, the sky light dims and the shade turns blue — screens and the arcade (unlit) glow.
  evening: {
    sun: '#ffcf90',
    sunIntensity: 1.15,
    sunPos: [4, 12, 6],
    hemiSky: '#efcf9f',
    hemiGround: '#4c4864',
    hemiIntensity: 0.95,
    window: '#22305a',
    lamp: '#ffd88a',
    air: '#4f4b5f',
    floor: '#a8978a',
  },
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

/**
 * The film tear (entrance progress) over which the time of day fades in — the same span as the
 * style's outlines and grade (effects/Effects.tsx), so the tear hides both.
 */
export const DAY_FADE = { from: 0.15, to: 0.45 } as const

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

/** The look at `hour`, with `day` = the theme's own light. */
export function lookAt(hour: number, base: DayLook): DayLook {
  const of = (name: TimeName) => (name === 'day' ? base : LOOKS[name])
  const { from, to, t } = phaseAt(hour)
  return blendLook(of(from), of(to), t)
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
