/**
 * Art-direction presets of the 3D world (docs/wow-plan.md, A2 / A3 / A4).
 *
 * - `comic`  — DEFAULT. Bold cartoon: two hard bands, hatching in shadows, saturated grade,
 *   thick ink outlines.
 * - `pastel` — soft cartoon: three soft light bands, warm low-contrast grade, thin outlines.
 * - `classic` — the look before the wow plan (no toon, no post). Not offered to visitors
 *   (Dima: only comic and pastel); kept for `?style=classic` — debugging / before-after.
 *
 * The visitor switches comic ↔ pastel with <StyleSwitch> (header, 3D only); the choice is
 * remembered (localStorage). `?style=` overrides for testing. Materials read `toon`
 * (toonMaterial.ts), the post pass reads `post` (effects/StyleEffect.ts). Post effects fade in
 * only after the 2D → 3D handover, so the swap frame still matches the 2D page exactly.
 */
import { create } from 'zustand'
import type { Theme } from '@/theme/tokens'

export const STYLES = ['classic', 'pastel', 'comic'] as const
export type StyleName = (typeof STYLES)[number]

export interface ToonSettings {
  /** Light bands: [threshold 0..1 of the sun's strength, brightness of the band]. */
  bands: [number, number][]
  /** Width of the soft edge between bands (0 = hard). */
  softness: number
  /** Keep this much of the indirect (sky/ground) light. */
  ambient: number
  /** Specular: 0 = none, otherwise strength of a hard cartoon highlight. */
  highlight: number
  /** Rim light at grazing angles. */
  rim: { color: [number, number, number]; strength: number; power: number }
  /** Hatch lines in the darkest band: 0 = none, otherwise how much they darken. */
  hatch: number
  /** Hatch line spacing (device pixels). */
  hatchSpacing: number
}

export interface PostSettings {
  /** Outline sampling distance (px); 0 = no outlines. */
  outline: number
  outlineColor: [number, number, number]
  outlineStrength: number
  saturation: number
  contrast: number
  /** Multiplies the colour — a warm or cool cast. */
  tint: [number, number, number]
  vignette: number
}

export interface StylePreset {
  label: string
  toon: ToonSettings | null
  post: PostSettings | null
  /**
   * Office colours of this style (light theme), over the theme's `world.office` (A4).
   * Background, fog and floor are NOT here: they show at the 2D → 3D swap and must keep
   * matching the 2D page.
   */
  palette?: Partial<Theme['world']['office']>
}

export const STYLE: Record<StyleName, StylePreset> = {
  classic: { label: 'Classic', toon: null, post: null },
  pastel: {
    label: 'Pastel',
    toon: {
      bands: [
        [0, 0.55],
        [0.3, 0.82],
        [0.65, 1],
      ],
      softness: 0.08,
      ambient: 1,
      highlight: 0,
      rim: { color: [1, 0.96, 0.9], strength: 0.18, power: 3 },
      hatch: 0,
      hatchSpacing: 6,
    },
    post: {
      outline: 1,
      outlineColor: [0.33, 0.29, 0.27],
      outlineStrength: 0.55,
      saturation: 0.92,
      contrast: 0.94,
      tint: [1.03, 1.0, 0.95],
      vignette: 0.12,
    },
    palette: {
      ceiling: '#fbf5ee',
      wood: '#f0c9a0',
      woodDark: '#d6a07a',
      frame: '#8c82a3',
      metal: '#cdc6dc',
      fabricA: '#9fd8c9',
      fabricB: '#f6b5a1',
      plant: '#93d1a0',
      plantDark: '#6fb489',
      pot: '#f3dfc4',
      screen: '#3f3b55',
      bookA: '#f6b5a1',
      bookB: '#b9c8f2',
      bookC: '#f4dc8f',
    },
  },
  comic: {
    label: 'Comic',
    toon: {
      bands: [
        [0, 0.5],
        [0.45, 1],
      ],
      softness: 0.015,
      ambient: 0.85,
      highlight: 0.35,
      rim: { color: [1, 1, 1], strength: 0.12, power: 4 },
      hatch: 0.28,
      hatchSpacing: 5,
    },
    post: {
      outline: 1.6,
      outlineColor: [0.05, 0.05, 0.07],
      outlineStrength: 1,
      saturation: 1.35,
      contrast: 1.12,
      tint: [1, 1, 1],
      vignette: 0.2,
    },
    palette: {
      ceiling: '#ffffff',
      wood: '#f2a541',
      woodDark: '#c4762a',
      frame: '#2b2d42',
      metal: '#8d99ae',
      fabricA: '#ef476f',
      fabricB: '#118ab2',
      plant: '#06c98f',
      plantDark: '#04946a',
      pot: '#ffd166',
      screen: '#1b1b2f',
      bookA: '#ef476f',
      bookB: '#ffd166',
      bookC: '#118ab2',
    },
  },
}

const isStyleName = (v: unknown): v is StyleName => STYLES.includes(v as StyleName)

/** What the visitor can switch between, in this order. */
export const SWITCHABLE: StyleName[] = ['comic', 'pastel']
export const DEFAULT_STYLE: StyleName = 'comic'
const STORAGE_KEY = 'era-style'

function initialStyle(): StyleName {
  if (typeof location === 'undefined') return DEFAULT_STYLE
  const fromUrl = new URLSearchParams(location.search).get('style')
  if (isStyleName(fromUrl)) return fromUrl
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isStyleName(saved) && SWITCHABLE.includes(saved)) return saved
  } catch {
    // storage unavailable (private mode etc.)
  }
  return DEFAULT_STYLE
}

interface StyleState {
  name: StyleName
  setStyle: (name: StyleName) => void
}

export const useStyle = create<StyleState>((set) => ({
  name: initialStyle(),
  setStyle: (name) => {
    try {
      localStorage.setItem(STORAGE_KEY, name)
    } catch {
      // the style still applies for this visit
    }
    set({ name })
  },
}))

export const useStylePreset = () => STYLE[useStyle((s) => s.name)]
