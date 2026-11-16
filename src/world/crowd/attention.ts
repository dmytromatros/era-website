/**
 * The camera's attention (E2a, Dima 2026-11-16: "can all this life be brought into focus? Not
 * stopping on it — but it is all on the edges of the screen"; "maybe even zoom in there, a clear
 * accent"). A gag the visitor walks past (crowdModel.ts) may call it; <CameraRig> then glances
 * over (look turns towards it), zooms in (narrower field of view) and pulls focus to it (the
 * background blur, B3, focuses there for that moment) — and back. Only between stops, never at
 * a key stop, in the entrance, a cutscene or a portal (CameraRig gates it).
 *
 * Time-based, like the crack (CLAUDE.md rules 1 and 27 have this as a stated exception): the
 * scroll decides where the camera is; a glance plays in scene time from the gag's start.
 */
import type { Vec3 } from '../layout'
import type { Attention } from './crowdModel'

export const ATTENTION = {
  /** Seconds to turn towards it and to turn back. */
  in: 0.45,
  out: 0.7,
  /** How far the look goes to it (0 = not at all, 1 = straight at it). */
  look: 0.8,
  /**
   * How much narrower the field of view gets at the peak (degrees; normal 42). 11 at first —
   * Dima: "zoom in even more" → 20.
   */
  zoom: 20,
  /**
   * The zoom is OFF for now (Dima 2026-11-16: "not sure about the zoom — can we switch it off
   * without deleting it?": it could zoom in mid-scroll, and on a phone the coffee machine hid
   * behind the people). The mechanism stays: `true` brings it back; `?zoom=1` turns it on for
   * one visit to compare. The glance and the focus pull stay on.
   */
  zoomOn: false,
} as const

/** The zoom for this visit: ATTENTION.zoomOn, or `?zoom=1` in the address. */
export const glanceZoom =
  ATTENTION.zoomOn || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('zoom') === '1')
    ? ATTENTION.zoom
    : 0

/**
 * Is the visitor standing (not scrolling)? <CameraRig> writes it every frame from
 * `live.progress` (rule 1); gags call the camera only while it is true for `STILL_AFTER` seconds.
 */
export const STILL_AFTER = 0.4
export const cameraStill = { since: 0, still: true, last: NaN }

/** The current call (one at a time; a newer one replaces it). */
export const attention: { at: Vec3; start: number; dur: number } = { at: [0, 0, 0], start: -Infinity, dur: 0 }

export function callAttention(a: Attention) {
  attention.at = a.at
  attention.start = a.start
  attention.dur = a.dur
}

const smooth = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1)
  return t * t * (3 - 2 * t)
}

/** 0…1: how much the camera attends to the call at scene time `now` (ease in, hold, ease out). */
export function attentionWeight(now: number, a = attention): number {
  const t = now - a.start
  if (!(t >= 0) || t > a.dur + ATTENTION.out) return 0
  return Math.min(smooth(t / ATTENTION.in), 1 - smooth((t - a.dur) / ATTENTION.out))
}
