/**
 * Reads the rendered 2D page so the 3D world can rebuild it: for every `[data-el]` inside a
 * `[data-block]` it records size, position, typography, colours and text. This is what makes
 * the 3D layer generic — a new 2D module shows up in 3D without any 3D code.
 */

export interface TextStyle {
  fontSize: number
  fontWeight: number
  /** em */
  letterSpacing: number
  /** multiple of fontSize */
  lineHeight: number
  color: string
  align: 'left' | 'center' | 'right'
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface PartSpec extends Rect {
  /** Relative to the parent element's top-left corner. */
  text: string
  style: TextStyle
}

export interface ElementSpec extends Rect {
  /** Element id inside its module (`heading`, `card-2`, …). Rect is in viewport px. */
  id: string
  kind: 'text' | 'button' | 'card'
  text: string
  style: TextStyle
  box?: { background: string; borderColor?: string; radius: number }
  parts: PartSpec[]
  /** Where the element links to in 2D (already localised), so its 3D copy can do the same. */
  href?: string
}

/** blockIndex → its elements */
export type PageElements = Record<number, ElementSpec[]>

function isVisibleColor(c: string): boolean {
  return !/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent'
}

function textStyle(cs: CSSStyleDeclaration): TextStyle {
  const fontSize = parseFloat(cs.fontSize)
  const lh = cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / fontSize
  const align = cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : 'left'
  return {
    fontSize,
    fontWeight: parseInt(cs.fontWeight, 10) || 400,
    letterSpacing: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) / fontSize,
    lineHeight: lh,
    color: cs.color,
    align,
  }
}

const rectOf = (r: DOMRect): Rect => ({ x: r.left, y: r.top, width: r.width, height: r.height })

/**
 * `innerText` keeps line breaks between block children and applies `text-transform` — but it is
 * empty for an element that is not rendered visibly. Fall back to the raw text then, so a hidden
 * element never produces a blank 3D copy.
 */
function textOf(el: HTMLElement): string {
  const rendered = el.innerText.trim()
  if (rendered) return rendered
  const raw = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  return getComputedStyle(el).textTransform === 'uppercase' ? raw.toUpperCase() : raw
}

/**
 * Where a text element's lines really are.
 * - Horizontally: the glyphs (a Range around the contents) — text blocks are often full width.
 * - Vertically: the element's own box, i.e. the line boxes (`lines × line-height`). The 3D
 *   text is anchored to the top of its first line box, so this is what makes it land exactly
 *   on the DOM. (A Range would give the glyph boxes, which differ when line-height is tight.)
 */
function textExtent(el: HTMLElement): DOMRect {
  const box = el.getBoundingClientRect()
  const range = document.createRange()
  range.selectNodeContents(el)
  const glyphs = range.getBoundingClientRect()
  if (glyphs.width <= 0) return box
  return new DOMRect(glyphs.left, box.top, glyphs.width, box.height)
}

function measureElement(el: HTMLElement): ElementSpec {
  const cs = getComputedStyle(el)
  const kind = (el.dataset.kind as ElementSpec['kind']) ?? 'text'
  const rect = kind === 'text' ? textExtent(el) : el.getBoundingClientRect()
  const spec: ElementSpec = {
    id: el.dataset.el!,
    kind,
    text: textOf(el),
    ...rectOf(rect),
    style: textStyle(cs),
    parts: [],
  }
  const link = el.closest('a')
  const href = link?.getAttribute('href')
  if (href) spec.href = href
  if (kind !== 'text') {
    const borderWidth = parseFloat(cs.borderTopWidth)
    spec.box = {
      background: isVisibleColor(cs.backgroundColor) ? cs.backgroundColor : 'rgba(0,0,0,0)',
      borderColor: borderWidth > 0 && isVisibleColor(cs.borderTopColor) ? cs.borderTopColor : undefined,
      radius: parseFloat(cs.borderTopLeftRadius) || 0,
    }
  }
  if (kind === 'card') {
    spec.parts = [...el.querySelectorAll<HTMLElement>('[data-part]')].map((part) => {
      const r = part.getBoundingClientRect()
      return {
        text: textOf(part),
        x: r.left - rect.left,
        y: r.top - rect.top,
        width: r.width,
        height: r.height,
        style: textStyle(getComputedStyle(part)),
      }
    })
  }
  return spec
}

export function measurePage(root: ParentNode): PageElements {
  const out: PageElements = {}
  root.querySelectorAll<HTMLElement>('[data-block]').forEach((blockEl) => {
    const index = Number(blockEl.dataset.block)
    out[index] = [...blockEl.querySelectorAll<HTMLElement>('[data-el]')].map(measureElement)
  })
  return out
}
