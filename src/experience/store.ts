'use client'

import { create } from 'zustand'
import type { ActorDef, Page } from '@/content/schema'
import type { PageElements } from './measure'

/** What the current route hands to the persistent 3D canvas. Plain data, no JSX. */
export interface SceneData {
  /** Unique per locale + page; changes on navigation. */
  key: string
  locale: string
  page: Page
  actors: Record<string, ActorDef>
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
  navigate: ((href: string) => void) | null

  setMode: (mode: ExperienceMode) => void
  setCapable: (capable: boolean) => void
  setScene: (scene: SceneData) => void
  setElements: (sceneKey: string, blocks: PageElements) => void
  markCanvasReady: (sceneKey: string) => void
  setHandedOver: (value: boolean) => void
  ripple: () => void
  setNavigate: (fn: (href: string) => void) => void
}

export const useExperience = create<ExperienceState>((set, get) => ({
  mode: 'pending',
  capable: false,
  scene: null,
  elements: null,
  canvasReadyFor: null,
  handedOver: false,
  rippleAt: -Infinity,
  navigate: null,

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
    set({ handedOver, rippleAt: performance.now() })
  },
  ripple: () => set({ rippleAt: performance.now() }),
  setNavigate: (navigate) => set({ navigate }),
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
}
