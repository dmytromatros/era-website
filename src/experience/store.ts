'use client'

import { create } from 'zustand'
import type { ActorDef, CutsceneTexts, Page, Welcome } from '@/content/schema'
import type { PageElements } from './measure'

/** What the current route hands to the persistent 3D canvas. Plain data, no JSX. */
export interface SceneData {
  /** Unique per locale + page; changes on navigation. */
  key: string
  locale: string
  page: Page
  actors: Record<string, ActorDef>
  /** Site navigation (locale-less hrefs) — the portal hall has a door for each page. */
  nav: { label: string; href: string }[]
  /**
   * Content of the other pages in the navigation, by locale-less href — the portal doors show a
   * live view of the page behind them (B2). Optional: older scene objects may lack it.
   */
  previews?: Record<string, Page>
  /** The coffee welcome of this locale with its character (D3); absent = none. */
  welcome?: Welcome & { def: ActorDef }
  /** The entrance cutscene's end hint (texts of this locale). */
  cutscene?: CutsceneTexts
}

/**
 * Passing between pages inside 3D (see experience/portal.ts):
 * - `diving`: the camera flies into a door, the portal cover grows over the screen;
 * - `covered`: the screen is covered while the route changes and the next office builds;
 * - `revealing`: the cover fades away, the visitor steps out into the next office.
 */
export type PortalPhase = 'idle' | 'diving' | 'covered' | 'revealing'

export interface PortalState {
  phase: PortalPhase
  /** Screen point (0..1, top-left origin) the cover grows from. */
  origin: { x: number; y: number }
  /** World point the camera dives into (a door's centre), if any. */
  target: [number, number, number] | null
  /** performance.now() when the phase started. */
  since: number
}

/** How the next page should start: inside 3D at a scroll position, instead of the 2D hero. */
export interface Arrival {
  kind: 'portal' | 'back'
  /** Scroll position to restore (`back`); `null` = just past the entrance. */
  scrollY: number | null
}

/**
 * - `pending`: deciding (SSR / first client tick) — the page renders as plain 2D.
 * - `2d`: forced flat mode (no WebGL, reduced motion, `?mode=2d`, or the user's choice).
 * - `3d`: the canvas is mounted; the hero is still DOM until the first scroll.
 */
export type ExperienceMode = 'pending' | '2d' | '3d'

interface ExperienceState {
  mode: ExperienceMode
  /** Device can run the 3D layer (WebGL2). Decided once on the client. */
  capable: boolean
  scene: SceneData | null
  /** Measured 2D elements of the current page (see measure.ts). */
  elements: { sceneKey: string; blocks: PageElements } | null
  /** Canvas has rendered the current scene at least once. */
  canvasReadyFor: string | null
  /** DOM hero hidden, 3D twins took over. */
  handedOver: boolean
  /** Bumped to fire the membrane ripple (value = performance.now()). */
  rippleAt: number
  /** Where that ripple starts (screen uv); null = at the pointer. */
  rippleCenter: { x: number; y: number } | null
  navigate: ((href: string, opts?: { scroll?: boolean }) => void) | null
  portal: PortalState
  /** Set before a portal / back navigation; consumed by the next page. */
  arrival: Arrival | null
  /** Scene the visitor entered through a portal (it gets an arrival door behind the camera). */
  arrivedVia: string | null
  /** Next handover jumps `live.progress` straight to the scroll position (no glide). */
  instantProgress: boolean

  setMode: (mode: ExperienceMode) => void
  setCapable: (capable: boolean) => void
  setScene: (scene: SceneData) => void
  setElements: (sceneKey: string, blocks: PageElements) => void
  markCanvasReady: (sceneKey: string) => void
  setHandedOver: (value: boolean) => void
  ripple: (center?: { x: number; y: number }) => void
  setNavigate: (fn: (href: string, opts?: { scroll?: boolean }) => void) => void
  setPortal: (phase: PortalPhase, extra?: Partial<Omit<PortalState, 'phase' | 'since'>>) => void
  setArrival: (arrival: Arrival | null) => void
  setArrivedVia: (sceneKey: string | null) => void
  setInstantProgress: (value: boolean) => void
}

export const useExperience = create<ExperienceState>((set, get) => ({
  mode: 'pending',
  capable: false,
  scene: null,
  elements: null,
  canvasReadyFor: null,
  handedOver: false,
  rippleAt: -Infinity,
  rippleCenter: null,
  navigate: null,
  portal: { phase: 'idle', origin: { x: 0.5, y: 0.5 }, target: null, since: 0 },
  arrival: null,
  arrivedVia: null,
  instantProgress: false,

  setMode: (mode) => set({ mode, handedOver: false }),
  setCapable: (capable) => set({ capable }),
  setScene: (scene) => {
    if (get().scene?.key === scene.key) return
    set({ scene, handedOver: false })
  },
  setElements: (sceneKey, blocks) => set({ elements: { sceneKey, blocks } }),
  markCanvasReady: (sceneKey) => {
    if (get().canvasReadyFor !== sceneKey) set({ canvasReadyFor: sceneKey })
  },
  setHandedOver: (handedOver) => {
    if (get().handedOver === handedOver) return
    set({ handedOver, rippleAt: performance.now(), rippleCenter: null })
  },
  ripple: (center) => set({ rippleAt: performance.now(), rippleCenter: center ?? null }),
  setNavigate: (navigate) => set({ navigate }),
  setPortal: (phase, extra) => set({ portal: { ...get().portal, ...extra, phase, since: performance.now() } }),
  setArrival: (arrival) => set({ arrival }),
  setArrivedVia: (arrivedVia) => set({ arrivedVia }),
  setInstantProgress: (instantProgress) => set({ instantProgress }),
}))

/** True when the 3D layer can take over from the DOM for the current page. */
export function selectReady(s: ExperienceState): boolean {
  const key = s.scene?.key
  return !!key && s.mode === '3d' && s.elements?.sceneKey === key && s.canvasReadyFor === key
}

/**
 * Per-frame values. Deliberately NOT React state — written by scroll / pointer listeners,
 * read inside `useFrame`, so scrolling never re-renders React.
 */
export const live = {
  /** Where the scroll IS, in "timeline units" (see world/timeline.ts). Written on scroll. */
  scroll: 0,
  /** Raw scroll position in px. */
  scrollPx: 0,
  /**
   * What the 3D world SHOWS: `scroll` smoothed every frame by <Driver>, so a jumpy mouse wheel
   * still produces fluid motion. Everything in the canvas reads this, never `scroll`.
   */
  progress: 0,
  /** Pointer in normalised device coords (-1..1). */
  pointer: { x: 0, y: 0 },
  /** Pointer in UV space (0..1, origin bottom-left) — the ripple centre. */
  pointerUv: { x: 0.5, y: 0.5 },
  /**
   * Where the visitor tears in (uv, origin bottom-left; D1): set at the handover from the pointer
   * (centre on a touch screen). The tear starts here and the hands press here.
   */
  tear: { x: 0.5, y: 0.5 },
  /** Last scroll position per page (scene key) — so Back returns to the same spot in 3D. */
  positions: {} as Record<string, number>,
}
