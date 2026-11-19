/**
 * The photo mode (wow-plan E7). Pure numbers and functions — tested in photo.test.ts.
 *
 * The moment, on the scene clock from the click (like the arcade's flight, a stated exception to
 * rule 1: it does not follow the scroll, which is held meanwhile): the visitor's hand raises a phone from below the frame → a
 * countdown 3-2-1 while everyone in the frame turns to the camera and poses → click: the frame is
 * taken (without the hand), a white flash, the phone jolts and goes down → the picture comes out
 * as a comic polaroid. Only the last frame before the flash is read back, once.
 */
import { PHOTO_MOVES, type ReactionName } from '@/actors/catalog'

export const PHOTO = {
  /** The phone comes up (s)… */
  raise: 0.5,
  /** …then one number of the countdown every `tick` s, `count` of them… */
  tick: 0.6,
  count: 3,
  /** …the shutter; the phone jolts for `jolt` s, then goes down in `lower` s. */
  jolt: 0.22,
  lower: 0.45,
  /**
   * How long a pose lasts (s; the characters' and the crowd's, from the countdown's start): its
   * blend in and out (`envelope`, 18 % each end) must leave it at full weight at the shutter.
   */
  pose: 3.0,
  /** A cue for poses older than this (scene s) is not taken: whoever comes into view later does not pose. */
  cueWindow: 0.3,
  /** The picture's longer side at most (px): big enough to share, small enough to encode fast. */
  maxSide: 1800,
} as const

/** Seconds from the click to the shutter. */
export const SHUTTER = PHOTO.raise + PHOTO.tick * PHOTO.count
/** Seconds from the click to the phone being gone again. */
export const PHOTO_END = SHUTTER + PHOTO.jolt + PHOTO.lower
/**
 * A character's emoji pops this long after the cue (scene s): on the last number, so it is in the
 * air, at full size, when the shutter clicks (lifeModel EMOJI_LIFE 1.5 s, full from 0.25 s).
 */
export const PHOTO_EMOJI_DELAY = SHUTTER - PHOTO.raise - 0.6

/**
 * Turning the whole body to the camera for the photo and back (Dima 2026-11-19: "if they stand
 * with their backs to me, for the selfie everyone turns to the camera, then back as they were").
 * Seconds after the cue (the countdown's start): round in `in`, held till just after the
 * shutter (`back`), then round again over `out` — done before the pose itself lets go.
 */
export const PHOTO_TURN = { in: 0.45, back: SHUTTER - PHOTO.raise + 0.3, out: 0.6 } as const
/** How far round to the camera, `u` s after the cue: 0 → 1 (eased, a little overshoot) → 0. */
export function photoTurn(u: number): number {
  if (!(u > 0) || u >= PHOTO_TURN.back + PHOTO_TURN.out) return 0
  const k = Math.min(u / PHOTO_TURN.in, 1)
  // Ease out with a small springy overshoot, settling at 1.
  const into = k >= 1 ? 1 : 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.08
  const o = Math.min(Math.max((u - PHOTO_TURN.back) / PHOTO_TURN.out, 0), 1)
  return into * (1 - o * o * (3 - 2 * o))
}
/** The signed angle (rad) from `from` to `to`, the short way round. */
export function turnBetween(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** The page's own name, without the site's ("DFRNC — Web motion design" → "Web motion design"). */
export function pageLabel(site: string, title: string): string {
  const esc = site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const t = title
    .replace(new RegExp(`^\\s*${esc}\\s*[—–\\-|:·]\\s*`, 'i'), '')
    .replace(new RegExp(`\\s*[—–\\-|:·]\\s*${esc}\\s*$`, 'i'), '')
    .trim()
  return t || title
}

const smooth = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1)
  return t * t * (3 - 2 * t)
}

export interface PhotoFrame {
  /** 0 = the phone below the frame, 1 = held up. */
  up: number
  /** The shutter's jolt: 0 → 1 → 0 over `PHOTO.jolt`. */
  jolt: number
  /** The countdown number shown (3, 2, 1), 0 before and after. */
  count: number
  /** The countdown has started: poses are cued. */
  posing: boolean
  /** It is time to take the picture. */
  shutter: boolean
  /** Over: the phone is gone. */
  done: boolean
}

/** Where the moment is, `t` seconds after the click. */
export function photoAt(t: number): PhotoFrame {
  // Up with a little overshoot (a hand lifting a phone does not stop dead).
  const k = smooth(t / PHOTO.raise)
  const over = Math.sin(Math.min(Math.max((t - PHOTO.raise * 0.6) / (PHOTO.raise * 0.8), 0), 1) * Math.PI) * 0.06
  const down = smooth((t - SHUTTER - PHOTO.jolt) / PHOTO.lower)
  const counting = t >= PHOTO.raise && t < SHUTTER
  const u = (t - SHUTTER) / PHOTO.jolt
  return {
    up: Math.max(0, k + over) * (1 - down),
    jolt: u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0,
    count: counting ? PHOTO.count - Math.floor((t - PHOTO.raise) / PHOTO.tick) : 0,
    posing: t >= PHOTO.raise,
    shutter: t >= SHUTTER,
    done: t >= PHOTO_END,
  }
}

/** A string's small stable hash (the same character always picks the same default pose). */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const EMOJI: Record<(typeof PHOTO_MOVES)[number], string> = { thumbs: '👍', peace: '✌️', flex: '💪' }

/** A character's pose for the camera: its own (`pose:` in its YAML) or one of the photo poses by its id. */
export function photoPoseFor(def: { id: string; pose?: { move: ReactionName; emoji: string } }): { move: ReactionName; emoji: string } {
  if (def.pose) return def.pose
  const move = PHOTO_MOVES[hash(def.id) % PHOTO_MOVES.length]!
  return { move, emoji: EMOJI[move] }
}

/**
 * The poses are cued once per photo: a character or a person of the crowd that is in the frame on
 * the cue's frame (scene time `at`) takes it; one that comes into view later does not.
 */
export const photoCue = { id: 0, at: -Infinity }

/** Take the cue `id` now (scene time `now`)? `seen` = the id this one took last. */
export const takesCue = (seen: number, now: number) => photoCue.id !== seen && photoCue.id > 0 && now - photoCue.at >= 0 && now - photoCue.at < PHOTO.cueWindow

/* ----------------------------------------------------------------- the polaroid */

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface PolaroidLayout {
  /** The whole card (px). */
  width: number
  height: number
  /** Where the picture goes. */
  photo: Box
  /** The strip under it: logo, caption, page and date. */
  strip: Box
  /** Thickness of the ink outline (px). */
  ink: number
}

/**
 * The comic polaroid around a picture of `w` × `h` px: an even white border, a wider strip
 * below for the logo and the caption (a fixed share of the picture's width, so a phone's tall
 * picture gets the same proportions of text as a wide one).
 */
export function polaroidLayout(w: number, h: number): PolaroidLayout {
  const side = Math.max(w, h)
  const pad = Math.round(side * 0.04)
  const ink = Math.max(2, Math.round(side * 0.004))
  const stripH = Math.round(Math.max(w * 0.15, side * 0.11))
  return {
    width: w + pad * 2,
    height: pad + h + stripH,
    photo: { x: pad, y: pad, w, h },
    strip: { x: pad, y: pad + h, w, h: stripH },
    ink,
  }
}

/** The picture's size: the canvas's own pixels, scaled down to `PHOTO.maxSide` at most. */
export function photoSize(w: number, h: number): { w: number; h: number } {
  const k = Math.min(1, PHOTO.maxSide / Math.max(w, h, 1))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** The file's name: `dfrnc-office-<page>-<yyyy-mm-dd>.png`. */
export function photoFileName(site: string, page: string, date: Date): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return [slug(site) || 'office', 'office', slug(pageLabel(site, page)), d].filter(Boolean).join('-') + '.png'
}
