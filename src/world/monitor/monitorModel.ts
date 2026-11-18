/**
 * The monitor that shows the 2D landing (E5): where the camera ends its flight into the screen,
 * and where on the screen the picture of the page lies, so that at the end of the flight the frame
 * shows exactly the page the visitor is about to be back on. Pure, tested in monitor.test.ts; the
 * state is in monitorState.ts, the drawing in Monitor.tsx and landingPicture.ts.
 */
import { ENTRANCE_GEOMETRY, forward, right, type Vec3, type WorldLayout } from '../layout'
import { crosses, MONITOR_DESK, monitorEye, type MonitorDesk } from '../officeModel'

export const MONITOR = {
  /** Flight into the screen (s); a cancelled flight goes back in `leave`. */
  enter: 1.5,
  leave: 0.8,
  /** Further than this (m), a click on the screen says "come closer" instead. */
  // 24 (was 16): on a phone the camera at the stop before the portal hall is ≈ 20 m from it.
  reach: 24,
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

/**
 * Where the monitor stands by the portal hall (E5): to the side of its doors, leaving the way to
 * them free (Dima 2026-11-18: in front of a door "there is no way through now" — "somewhere like
 * this, to the side, so it just stands there"): `out` beyond the hall's left edge, a little in
 * front of the doors' line; on a mezzanine no closer than `rail` to its edge.
 */
export const MONITOR_SPOT = { out: 1.5, min: 1.0, forward: 0.5, rail: 0.95, between: 0.5 } as const

/**
 * The monitor's spot: on the portal hall's floor, left of its doors (as the camera sees them),
 * facing the camera of the stop before the hall — where it is seen and clicked from. As far from
 * the doors as halfway to that stop's character (Dima 2026-11-18: "a bit closer to us… by depth,
 * between Mykola and the portals"), if there is one. `hallWidth` = the hall exhibit's width (m).
 */
export function monitorSpot(
  layout: Pick<WorldLayout, 'stations' | 'architecture'>,
  hall: number,
  hallWidth: number,
  guy?: Vec3,
): { at: Vec3; face: Vec3; station: number; hall: number } | undefined {
  const h = layout.stations[hall]
  if (hall < 0 || !h) return undefined
  const station = hall > 0 ? hall - 1 : hall
  // The hall's local −x is the camera's left (it faces the camera along +z).
  const c = Math.cos(h.yaw)
  const sn = Math.sin(h.yaw)
  const out = guy ? ((guy[0] - h.anchor[0]) * sn + (guy[2] - h.anchor[2]) * c) * MONITOR_SPOT.between : MONITOR_SPOT.forward
  const z = Math.max(MONITOR_SPOT.forward, out)
  const at = (x: number): Vec3 => [h.anchor[0] + x * c + z * sn, h.anchor[1], h.anchor[2] - x * sn + z * c]
  // On a mezzanine: as far out as its floor allows (the slab under the hall).
  const slab = layout.architecture.mezzanines.find((m) => Math.abs(m.frame.level - h.anchor[1]) < 0.05 && inside(m, at(0), 0))
  // …and clear of the glass partitions (the desk is ≈ 1.5 m wide).
  const offFloor = (x: number) => (slab ? !inside(slab, at(x), MONITOR_SPOT.rail) : false)
  const inGlass = (x: number) => layout.architecture.walls.some((w) => crosses(at(x - 0.95), at(x + 0.95), w))
  let x = -(hallWidth / 2 + MONITOR_SPOT.out)
  while (x < -(hallWidth / 2 + MONITOR_SPOT.min) && (offFloor(x) || inGlass(x))) x += 0.1
  return { at: at(x), face: layout.stations[station]!.viewpoint, station, hall }
}

/** Is floor point `p` on the mezzanine, `margin` in from its edges? */
function inside(m: WorldLayout['architecture']['mezzanines'][number], p: Vec3, margin: number): boolean {
  const fw = forward(m.frame.heading)
  const rt = right(m.frame.heading)
  const dx = p[0] - m.frame.origin[0]
  const dz = p[2] - m.frame.origin[2]
  const along = dx * fw[0] + dz * fw[2]
  const across = dx * rt[0] + dz * rt[2]
  return along >= m.from + margin && along <= m.to - margin && Math.abs(across) <= m.half - margin
}
