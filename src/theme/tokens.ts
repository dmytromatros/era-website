/**
 * Single source of truth for colours — used by BOTH the 2D page (as CSS variables)
 * and the 3D world (as material / light / fog colours).
 *
 * Add a theme: add a key to `themes` with every token filled in. TypeScript enforces
 * completeness, the CSS variables and the switcher pick it up automatically.
 */
export interface Theme {
  label: string
  /** Colours of the 2D interface. Exposed as `--ui-<name>` CSS variables. */
  ui: {
    bg: string
    surface: string
    text: string
    textMuted: string
    accent: string
    accentText: string
    border: string
    dot: string
    bubble: string
    bubbleText: string
  }
  /** Colours of the 3D world. */
  world: {
    background: string
    fogNear: number
    fogFar: number
    floor: string
    floorDot: string
    platform: string
    /** Corridor walls. */
    wall: string
    sign: string
    hemiSky: string
    hemiGround: string
    hemiIntensity: number
    sun: string
    sunIntensity: number
    shadow: string
    shadowOpacity: number
    /** The office the route runs through (see world/office.ts). */
    office: {
      ceiling: string
      light: string
      window: string
      wood: string
      woodDark: string
      frame: string
      metal: string
      fabricA: string
      fabricB: string
      plant: string
      plantDark: string
      pot: string
      screen: string
      bookA: string
      bookB: string
      bookC: string
      glass: string
      glassOpacity: number
      frosted: string
      frostedOpacity: number
    }
  }
}

const light: Theme = {
  label: 'Light',
  ui: {
    bg: '#f4f4f2',
    surface: '#ffffff',
    text: '#111111',
    textMuted: '#5f5f5f',
    accent: '#3b6cf6',
    accentText: '#ffffff',
    border: '#d9d9d6',
    dot: '#c9c9c4',
    bubble: '#ffffff',
    bubbleText: '#111111',
  },
  world: {
    background: '#f4f4f2',
    fogNear: 14,
    fogFar: 48,
    floor: '#e9e1d4',
    floorDot: '#d6cab8',
    platform: '#ffffff',
    wall: '#fafaf8',
    sign: '#111111',
    hemiSky: '#ffffff',
    hemiGround: '#d8d8d2',
    hemiIntensity: 1.6,
    sun: '#ffffff',
    sunIntensity: 1.4,
    shadow: '#000000',
    shadowOpacity: 0.16,
    office: {
      ceiling: '#fbfbf9',
      light: '#ffffff',
      window: '#eef4fb',
      wood: '#d9c4a3',
      woodDark: '#a8865e',
      frame: '#2b2b2e',
      metal: '#e6e6e3',
      fabricA: '#a9b8a3',
      fabricB: '#d8c9b5',
      plant: '#6f9a64',
      plantDark: '#4f7a4a',
      pot: '#f3efe8',
      screen: '#1d2026',
      bookA: '#3b6cf6',
      bookB: '#e8b04b',
      bookC: '#d9705a',
      glass: '#dfeaf2',
      glassOpacity: 0.18,
      frosted: '#f7f7f5',
      frostedOpacity: 0.72,
    },
  },
}

/** DRAFT — values are a first guess so the switch can be exercised; no design pass yet. */
const dark: Theme = {
  label: 'Dark (draft)',
  ui: {
    bg: '#0e0f12',
    surface: '#181a1f',
    text: '#f2f2f0',
    textMuted: '#9a9a96',
    accent: '#6c8cff',
    accentText: '#0e0f12',
    border: '#2a2d34',
    dot: '#2c2f36',
    bubble: '#1d2026',
    bubbleText: '#f2f2f0',
  },
  world: {
    background: '#0e0f12',
    fogNear: 12,
    fogFar: 42,
    floor: '#121418',
    floorDot: '#2f333b',
    platform: '#1b1e24',
    wall: '#16181d',
    sign: '#f2f2f0',
    hemiSky: '#8fa2ff',
    hemiGround: '#101215',
    hemiIntensity: 0.9,
    sun: '#cfd8ff',
    sunIntensity: 1.1,
    shadow: '#000000',
    shadowOpacity: 0.45,
    office: {
      ceiling: '#15171b',
      light: '#fff3d6',
      window: '#1a2440',
      wood: '#5a4632',
      woodDark: '#3d2f22',
      frame: '#0a0b0d',
      metal: '#3a3d44',
      fabricA: '#3f4a3d',
      fabricB: '#4a4136',
      plant: '#355a33',
      plantDark: '#243f23',
      pot: '#2a2c31',
      screen: '#6c8cff',
      bookA: '#6c8cff',
      bookB: '#b88a3b',
      bookC: '#a45444',
      glass: '#8fa2ff',
      glassOpacity: 0.1,
      frosted: '#2a2d34',
      frostedOpacity: 0.6,
    },
  },
}

export const themes = { light, dark } satisfies Record<string, Theme>
export type ThemeName = keyof typeof themes
export const THEME_NAMES = Object.keys(themes) as ThemeName[]
export const DEFAULT_THEME: ThemeName = 'light'
export const THEME_STORAGE_KEY = 'era-theme'

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && value in themes
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

/** `[data-theme="light"] { --ui-bg: …; … }` for every theme. Rendered once in the root layout. */
export function themeCss(): string {
  return THEME_NAMES.map((name) => {
    const vars = Object.entries(themes[name].ui)
      .map(([k, v]) => `--ui-${kebab(k)}:${v};`)
      .join('')
    return `[data-theme="${name}"]{${vars}color-scheme:${name === 'dark' ? 'dark' : 'light'};}`
  }).join('\n')
}

/** Runs before first paint: applies the saved theme so there is no flash. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t&&${JSON.stringify(THEME_NAMES)}.indexOf(t)>-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`
