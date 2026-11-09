/**
 * Quality levels of the 3D world (docs/wow-plan.md, task A1). Every visual effect reads the
 * current level and has a cheaper or no version on lower levels, so weak phones stay smooth
 * and cool instead of lagging and overheating.
 *
 * The level starts at `high` (what the site always rendered) or at what this visit settled on
 * before, and steps DOWN by itself when the frame rate stays low (<QualityGovernor>), back up
 * when it recovers. `?quality=low|medium|high` forces a level (testing).
 */
import { create } from 'zustand'

export const LEVELS = ['low', 'medium', 'high'] as const
export type QualityName = (typeof LEVELS)[number]

export interface QualitySettings {
  /** Max device-pixel ratio of the canvas. */
  dpr: number
  /** MSAA samples of the post-processing target (0 = off). */
  multisampling: number
  /** Ink outlines of the cartoon styles (StyleEffect). */
  outlines: boolean
  /** Living office details move: wind in the plants, code on the screens (A5). */
  liveDetails: boolean
  /**
   * Hero heading letters spring from the cursor and sway (B1). On everywhere: a few dozen
   * springs on the CPU and one uniform upload per frame, no extra draw calls.
   */
  kineticText: boolean
  /**
   * Living characters (C1): springy look-at that follows the cursor, accessories swinging on
   * springs, click reactions. On everywhere: a few springs on the CPU for the characters near
   * the camera only, no extra draw calls (the emoji is one plane while it is in the air).
   */
  actorLife: boolean
  /** Background blur (B3): samples per pixel, 0 = off (no pass at all). */
  depthBlur: number
  /** Live view through the portal doors (B2): texture size as a fraction of the screen (0 = off)… */
  portalScale: number
  /** …and at most this many redraws a second (0 = whenever the camera moves). */
  portalMaxFps: number
}

/** What each level costs. New effects add their switches here. */
export const QUALITY: Record<QualityName, QualitySettings> = {
  low: { dpr: 1, multisampling: 0, outlines: false, liveDetails: false, kineticText: true, actorLife: true, depthBlur: 0, portalScale: 0.4, portalMaxFps: 10 },
  medium: { dpr: 1.25, multisampling: 2, outlines: true, liveDetails: true, kineticText: true, actorLife: true, depthBlur: 8, portalScale: 0.6, portalMaxFps: 0 },
  high: { dpr: 1.75, multisampling: 4, outlines: true, liveDetails: true, kineticText: true, actorLife: true, depthBlur: 16, portalScale: 1, portalMaxFps: 0 },
}

const STORAGE_KEY = 'era-quality'

export const isQualityName = (v: unknown): v is QualityName => LEVELS.includes(v as QualityName)

/** Level forced by the URL, if any. */
function forcedLevel(): QualityName | null {
  if (typeof location === 'undefined') return null
  const q = new URLSearchParams(location.search).get('quality')
  return isQualityName(q) ? q : null
}

function savedLevel(): QualityName | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    return isQualityName(v) ? v : null
  } catch {
    return null
  }
}

interface QualityState {
  level: QualityName
  /** Set by the URL: the governor does not change it. */
  forced: boolean
  /** One step down / up (no-op at the ends or when forced). */
  step: (dir: -1 | 1) => void
}

export const useQuality = create<QualityState>((set, get) => {
  const forced = forcedLevel()
  return {
    level: forced ?? savedLevel() ?? 'high',
    forced: forced !== null,
    step: (dir) => {
      const { level, forced } = get()
      if (forced) return
      const next = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, LEVELS.indexOf(level) + dir))]!
      if (next === level) return
      try {
        sessionStorage.setItem(STORAGE_KEY, next)
      } catch {
        // storage unavailable — the level still applies for this page view
      }
      set({ level: next })
    },
  }
})

/** Settings of the current level (React). */
export const useQualitySettings = () => QUALITY[useQuality((s) => s.level)]
