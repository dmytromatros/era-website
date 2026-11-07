/**
 * Live widgets (animations ported from dfrnc.netlify.app) are drawn into a <canvas>, frame by
 * frame. The SAME drawing code serves both worlds:
 * - 2D: the canvas sits in the card (`WidgetCanvas`);
 * - 3D: the drawing is a texture on a plane inside the 3D card (`world/WidgetPlane`), so it
 *   is part of the world — cards in front hide it, fog and the ripple apply to it.
 * (An HTML overlay can not do that: it has no depth and shines through everything.)
 *
 * A widget = fixed height + `init` (its own state) + `draw` (+ optional `click` / `hit`).
 * Coordinates are CSS pixels of the widget box; width comes from the card.
 * Pure — no React, no DOM besides the 2D context handed in.
 */
import type { Theme } from '@/theme/tokens'

export type WidgetPalette = Theme['ui']

export interface DrawArgs<S> {
  ctx: CanvasRenderingContext2D
  /** Seconds (monotonic). */
  t: number
  w: number
  h: number
  state: S
  ui: WidgetPalette
}

export interface CanvasWidget<S = unknown> {
  /** Height of the widget box in CSS px (its width is the card's). */
  height: number
  // Method syntax on purpose: lets every widget be stored as CanvasWidget<unknown>.
  init(): S
  draw(args: DrawArgs<S>): void
  /** Pointer press at (x, y); true if it did something. */
  click?(state: S, x: number, y: number, w: number, h: number, t: number): boolean
  /** Is (x, y) clickable? — for the pointer cursor. */
  hit?(x: number, y: number, w: number, h: number): boolean
  /** Time (s) of the frame shown when the visitor prefers reduced motion. */
  stillTime: number
}

/** Identity helper that keeps the state type of a widget definition. */
export const defineWidget = <S>(w: CanvasWidget<S>): CanvasWidget<S> => w

/* ------------------------------------------------------------------ */
/* Animation helpers                                                   */
/* ------------------------------------------------------------------ */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p
const easeInOut = (p: number) => 0.5 - Math.cos(Math.PI * p) / 2

/** Position 0..1 inside a loop of `period` seconds. */
export const loop = (t: number, period: number) => (((t % period) + period) % period) / period

/**
 * Keyframes like CSS: `stops` = [[at 0..1, value], …] sorted by `at`; eased in-out between
 * neighbours, held before the first and after the last.
 */
export function kf(p: number, stops: [number, number][]): number {
  const first = stops[0]!
  if (p <= first[0]) return first[1]
  for (let i = 1; i < stops.length; i++) {
    const [b, vb] = stops[i]!
    if (p <= b) {
      const [a, va] = stops[i - 1]!
      return b === a ? vb : lerp(va, vb, easeInOut((p - a) / (b - a)))
    }
  }
  return stops[stops.length - 1]![1]
}

/** Mix two #rrggbb colours. */
export function mix(a: string, b: string, p: number): string {
  const ca = parseInt(a.slice(1), 16)
  const cb = parseInt(b.slice(1), 16)
  const ch = (shift: number) => Math.round(lerp((ca >> shift) & 255, (cb >> shift) & 255, p))
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

/* ------------------------------------------------------------------ */
/* Drawing helpers                                                     */
/* ------------------------------------------------------------------ */

export const font = (size: number, weight = 400) => `${weight} ${size}px Manrope, system-ui, sans-serif`

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Greedy word wrap with the context's current font. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** A rounded label with centred text; returns its width. */
export function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { size: number; padX: number; height: number; bg: string; color: string; radius?: number },
): number {
  ctx.font = font(opts.size)
  const w = ctx.measureText(text).width + opts.padX * 2
  ctx.fillStyle = opts.bg
  roundRect(ctx, x, y, w, opts.height, opts.radius ?? opts.height / 2)
  ctx.fill()
  ctx.fillStyle = opts.color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + opts.padX, y + opts.height / 2 + 0.5)
  return w
}

/** Draw the first `p` (0..1) of a polyline. */
export function partialLine(ctx: CanvasRenderingContext2D, pts: [number, number][], p: number) {
  const lengths = pts.slice(1).map(([x, y], i) => Math.hypot(x - pts[i]![0], y - pts[i]![1]))
  let left = lengths.reduce((a, b) => a + b, 0) * clamp01(p)
  ctx.beginPath()
  ctx.moveTo(pts[0]![0], pts[0]![1])
  for (let i = 1; i < pts.length && left > 0; i++) {
    const seg = lengths[i - 1]!
    const k = Math.min(1, left / seg)
    const [ax, ay] = pts[i - 1]!
    const [bx, by] = pts[i]!
    ctx.lineTo(lerp(ax, bx, k), lerp(ay, by, k))
    left -= seg
  }
  ctx.stroke()
}

/** dfrnc colours used by the widgets. */
export const DFRNC = {
  blue: '#3470e3',
  green: '#19a97b',
  red: '#ff5b51',
  orange: '#f99a42',
  yellow: '#ffd951',
  grey: '#979797',
  light: '#d9d9d9',
}
