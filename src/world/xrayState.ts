/**
 * X-ray mode (docs/wow-plan.md, task B4): the world as a blueprint — every draw call in its own
 * colour, so the visitor sees what instancing buys (forty chairs, one colour = one draw call),
 * with live frame metrics. State + pure helpers; the 3D part is XRay.tsx, the panel
 * XRayPanel.tsx, the header button XRaySwitch.tsx.
 */
import { create } from 'zustand'

interface XRayState {
  on: boolean
  set: (on: boolean) => void
  toggle: () => void
}

export const useXRay = create<XRayState>((set, get) => ({
  on: false,
  set: (on) => set({ on }),
  toggle: () => set({ on: !get().on }),
}))

/** Blueprint background and the colour of text in X-ray (same in both themes). */
export const XRAY_BACKGROUND = '#0c1b2e'
export const XRAY_TEXT = '#eaf2ff'

/**
 * Colour of draw call number `index` (in the order the X-ray first met its mesh): golden-ratio
 * hue steps, so neighbours never look alike however many there are.
 */
export function xrayHue(index: number): { h: number; s: number; l: number } {
  return { h: (index * 0.618033988749895) % 1, s: 0.75, l: 0.62 }
}

/** Triangles a mesh draws: its geometry's triangles × instances. */
export function trianglesOf(indexCount: number | null, vertexCount: number, instances: number): number {
  return Math.floor((indexCount ?? vertexCount) / 3) * instances
}

/** What the X-ray found in the scene (refreshed while it is on; read by the panel). */
export const xrayStats = {
  /** Meshes drawn (each one draw call, before post-processing). */
  meshes: 0,
  /** Of those, instanced meshes — and how many objects they draw in total. */
  instancedMeshes: 0,
  instances: 0,
  /**
   * Triangles of everything visible (counted from the geometry: in X-ray the renderer draws
   * lines, so its own triangle count would read near zero). Frustum culling not applied.
   */
  triangles: 0,
}
