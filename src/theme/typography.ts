/**
 * Font files for 3D text (troika needs a URL to a .woff/.ttf — not woff2).
 * They are the same Manrope files the CSS loads, so DOM and 3D glyphs match.
 *
 * NOTE: these are Latin subsets. Cyrillic (for a future `uk` locale) needs a full-coverage
 * font file here and in globals.css.
 */
const FILES: Record<number, string> = {
  400: '/fonts/manrope-latin-400-normal.woff',
  500: '/fonts/manrope-latin-500-normal.woff',
  700: '/fonts/manrope-latin-700-normal.woff',
  800: '/fonts/manrope-latin-800-normal.woff',
}

/** Closest available weight file. */
export function fontFor(weight: number): string {
  const best = Object.keys(FILES)
    .map(Number)
    .reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a))
  return FILES[best]!
}

export const FONT_BOLD = FILES[800]!
export const FONT_MEDIUM = FILES[500]!
