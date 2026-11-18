/**
 * The monitor that shows the 2D landing (E5): where the camera ends its flight into the screen,
 * and where on the screen the picture of the page lies, so that at the end of the flight the frame
 * shows exactly the page the visitor is about to be back on. Pure, tested in monitor.test.ts; the
 * state is in monitorState.ts, the drawing in Monitor.tsx and landingPicture.ts.
 */
import { ENTRANCE_GEOMETRY, type Vec3 } from '../layout'
import { MONITOR_DESK, monitorEye, type MonitorDesk } from '../officeModel'

export const MONITOR = {
  /** Flight into the screen (s); a cancelled flight goes back in `leave`. */
  enter: 1.5,
  leave: 0.8,
  /** Further than this (m), a click on the screen says "come closer" instead. */
  reach: 16,
  /** "Come closer" shows this long (s). */
  closer: 1.8,
  /** The picture is drawn this long after the monitor appears (ms): never in the handover's frame. */
  drawDelay: 600,
} as const

export type MonitorPhase = 'idle' | 'entering' | 'leaving'

/** Where the camera ends up and looks: straight in front of the screen, which covers the frame. */
export function monitorView(screen: MonitorDesk['screen'], aspect: number): { eye: Vec3; look: Vec3; distance: number } {
  const eye = monitorEye(screen.center, screen.normal, aspect)
  const c = screen.center
  return { eye, look: [c[0], c[1], c[2]], distance: Math.hypot(eye[0] - c[0], eye[2] - c[2]) }
}

/**
 * The part of the screen (fractions of its width and height, origin top-left) the camera sees at
 * the end of the flight — a window of the viewport's shape. The landing is drawn into exactly this
 * rectangle; the rest of the screen is the page's background (a phone's page on a wide monitor is
 * a column in the middle).
 */
export function pageRect(size: [number, number], aspect: number): { x: number; y: number; w: number; h: number } {
  const t = Math.tan((ENTRANCE_GEOMETRY.fov * Math.PI) / 360)
  const d = Math.min(size[1] / 2 / t, size[0] / 2 / (t * aspect)) * MONITOR_DESK.margin
  const h = (2 * d * t) / size[1]
  const w = (2 * d * t * aspect) / size[0]
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}
