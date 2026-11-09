/**
 * When the 3D world draws a frame (CLAUDE.md, section 0: no needless load).
 *
 * 1. At most 60 frames a second, on every screen (Dima, 2026-11-09): a 120 Hz screen would
 *    otherwise draw the same world twice as often — twice the heat for motion nobody sees.
 * 2. Parked on the 2D landing: before the visitor scrolls in, the whole view is the intact
 *    membrane, which looks exactly like the 2D page background — a still picture. The world
 *    behind it (the full office, ~126 draw calls) was still drawn 60–120 times a second. Once
 *    everything is ready and still, no frames are drawn until something changes (scroll,
 *    resize, any store change); the last frame stays on the canvas.
 *
 * The scene clock advances only by drawn frames (capped at 0.1 s a step), so a park or a tab in
 * the background never makes time-based animation jump. Pure parts here (tested in
 * framePacing.test.ts); the loop is <FramePacer> (FramePacer.tsx).
 */

/** Frame cap. */
export const MAX_FPS = 60
export const FRAME_MS = 1000 / MAX_FPS
/** A vsync arriving this much early still counts (rAF timestamps jitter a little). */
const EARLY_MS = 1.5
/** The scene clock never steps more than this per frame (s). */
export const MAX_STEP = 0.1
/**
 * The landing must stay still this long (real time) AND for this many drawn frames before it
 * parks — enough for every text, texture and shader to reach the GPU. Time, not frames: a slow
 * device (where not drawing matters most) would otherwise draw many seconds before parking.
 */
export const PARK_AFTER_MS = 800
export const PARK_MIN_FRAMES = 10

/**
 * Frame limiter on a fixed grid of FRAME_MS: draws on the first vsync at or after each grid
 * point. 60 Hz → every vsync, 120 Hz → every other one, 144 Hz → 60 on average.
 * @returns whether to draw now, and the next grid point
 */
export function pace(now: number, next: number): { draw: boolean; next: number } {
  if (now + EARLY_MS < next) return { draw: false, next }
  let n = next + FRAME_MS
  // Fell behind (slow frame, park, background tab): restart the grid from now.
  if (n < now) n = now + FRAME_MS
  return { draw: true, next: n }
}

export interface ParkInput {
  handedOver: boolean
  /** Scroll in CSS px and the smoothed progress the world shows. */
  scrollPx: number
  progress: number
  /** Texts measured and built (selectReady). */
  ready: boolean
  /** Portal dive / arrival in flight. */
  portalBusy: boolean
}

/** The landing is a still picture: nothing in the canvas can change until something happens. */
export const landingIsStill = (p: ParkInput) =>
  !p.handedOver && p.scrollPx <= 2 && p.progress === 0 && p.ready && !p.portalBusy

/**
 * Layer the film is on besides the default one (D1). While the pointer stirs the waves on an
 * otherwise still landing, the camera sees only this layer: the film is opaque there, the
 * office behind it (~126 draw calls) could not be seen anyway.
 */
export const MEMBRANE_LAYER = 1

/** Shared between the loop and the wake-up listeners. */
export const pacer = {
  parked: false,
  /** Still frames in a row, and since when (performance.now(), ms). */
  still: 0,
  stillSince: 0,
  /**
   * Woken from a park by the pointer alone (waves on the film): draw only the film
   * (MEMBRANE_LAYER). Anything else that wakes the loop draws the whole world again.
   */
  membraneOnly: false,
}

/**
 * One drawn frame: is the landing still, and should the loop park now? `waving` = waves still
 * move on the film (D1): once the landing is warmed up the loop then draws the film alone
 * instead of parking, and parks when they have died out.
 */
export function notePark(still: boolean, now: number, waving = false) {
  if (!still) {
    pacer.still = 0
    return
  }
  if (pacer.still === 0) pacer.stillSince = now
  pacer.still++
  if (pacer.still >= PARK_MIN_FRAMES && now - pacer.stillSince >= PARK_AFTER_MS) {
    if (waving) pacer.membraneOnly = true
    else pacer.parked = true
  }
}

/** Something changed: draw again (and re-check stillness from scratch). */
export function wake() {
  pacer.parked = false
  pacer.still = 0
  pacer.membraneOnly = false
}

/**
 * The pointer moved (waves on the film, D1). From a park: draw again, the film only — every
 * other program and texture is already on the GPU (it parked). Not parked: nothing to change.
 */
export function wakeByPointer() {
  if (!pacer.parked) return
  pacer.parked = false
  pacer.still = 0
  pacer.membraneOnly = true
}
