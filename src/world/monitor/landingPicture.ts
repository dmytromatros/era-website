/**
 * A picture of the 2D landing for the monitor's screen (E5), painted into a canvas from the page
 * itself: the header and the hero as they stand at the very top of the page — boxes (buttons,
 * tags, the menu) with their colours, radii and borders, every word where the browser laid it out
 * (Range rects), in its own font, colour and spacing — over the page's dotted background. Generic:
 * a changed hero shows up on the monitor with no code here (like measure.ts for the 3D copies).
 *
 * Read once, painted once (and again only when the page, the theme or the size change): the
 * monitor costs no work a frame. The hero is hidden (opacity 0) while in 3D — that is ignored;
 * its layout is intact (rule 22).
 */
import { ENTRANCE_GEOMETRY } from '../layout'

/** Where the viewport goes on the canvas (px). */
export interface Area {
  x: number
  y: number
  w: number
  h: number
}

type Op =
  | { kind: 'box'; x: number; y: number; w: number; h: number; r: number; fill: string | null; stroke: string | null; line: number; alpha: number }
  | { kind: 'text'; x: number; y: number; h: number; text: string; font: string; color: string; spacing: string; alpha: number }
  | { kind: 'svg'; x: number; y: number; w: number; h: number; image: Promise<HTMLImageElement | null>; alpha: number }

const invisible = (c: string) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c)

function transform(text: string, how: string): string {
  if (how === 'uppercase') return text.toUpperCase()
  if (how === 'lowercase') return text.toLowerCase()
  if (how === 'capitalize') return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
  return text
}

function svgImage(el: SVGSVGElement, color: string): Promise<HTMLImageElement | null> {
  const clone = el.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.style.color = color
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Read what the top of the page shows (header + hero), in viewport px at scroll 0. */
function readPage(): Op[] {
  const ops: Op[] = []
  const roots = [document.querySelector('[data-hero]'), document.querySelector('header')]
  const range = document.createRange()
  for (const root of roots) {
    if (!(root instanceof HTMLElement)) continue
    // Fixed (the header; the hero in 3D mode): where it is now is where it is at the top.
    // Otherwise it scrolls with the page: back to scroll 0.
    const dy = getComputedStyle(root).position === 'fixed' ? 0 : window.scrollY
    const walk = (el: Element, alpha: number) => {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') return
      // Opacity 0 is the hero hidden while in 3D (not how the landing looks): counts as 1.
      const own = parseFloat(cs.opacity)
      const a = alpha * (own > 0 ? own : 1)
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      if (el instanceof SVGSVGElement) {
        ops.push({ kind: 'svg', x: r.left, y: r.top + dy, w: r.width, h: r.height, image: svgImage(el, cs.color), alpha: a })
        return
      }
      const line = parseFloat(cs.borderTopWidth) || 0
      const fill = invisible(cs.backgroundColor) ? null : cs.backgroundColor
      const stroke = line > 0 && !invisible(cs.borderTopColor) ? cs.borderTopColor : null
      if (fill || stroke) {
        const radius = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.width / 2, r.height / 2)
        ops.push({ kind: 'box', x: r.left, y: r.top + dy, w: r.width, h: r.height, r: radius, fill, stroke, line, alpha: a })
      }
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      for (const node of el.childNodes) {
        if (node instanceof Element) {
          walk(node, a)
          continue
        }
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue
        // Word by word, where the browser put each one (line breaks and all).
        const text = node.textContent
        for (const m of text.matchAll(/\S+/g)) {
          range.setStart(node, m.index)
          range.setEnd(node, m.index + m[0].length)
          const box = range.getClientRects()[0]
          if (!box || box.width <= 0) continue
          ops.push({
            kind: 'text',
            x: box.left,
            y: box.top + dy,
            h: box.height,
            text: transform(m[0], cs.textTransform),
            font,
            color: cs.color,
            spacing: cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing,
            alpha: a,
          })
        }
      }
    }
    walk(root, 1)
  }
  return ops
}

/**
 * Paint the landing into `area` of the canvas (the rest is the page's background), scaled from
 * the viewport (`innerWidth` × `innerHeight`). Resolves once drawn (an icon may need to load).
 */
export async function paintLanding(ctx: CanvasRenderingContext2D, area: Area, colors: { bg: string; dot: string }): Promise<void> {
  const ops = readPage()
  const icons = await Promise.all(ops.map((op) => (op.kind === 'svg' ? op.image : null)))
  const { width, height } = ctx.canvas
  const vw = window.innerWidth
  const vh = window.innerHeight
  const s = area.w / vw

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, width, height)
  // The film's dots (Membrane.tsx: 24 px apart, 1.4 px radius, the grid's origin at the world's
  // origin — the middle across, cameraStart's height below the middle), over the whole screen.
  const { cameraStart, membraneDistance, fov } = ENTRANCE_GEOMETRY
  const seen = 2 * membraneDistance * Math.tan((fov * Math.PI) / 360)
  const step = 24 * s
  const ox = area.x + area.w / 2
  const oy = area.y + area.h / 2 + (cameraStart[1] / seen) * area.h
  ctx.fillStyle = colors.dot
  ctx.beginPath()
  const r = Math.max(1.4 * s, 0.6)
  for (let x = ox - Math.ceil(ox / step) * step; x < width + step; x += step) {
    for (let y = oy - Math.ceil(oy / step) * step; y < height + step; y += step) {
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, Math.PI * 2)
    }
  }
  ctx.fill()

  // The page, in viewport px from here on.
  ctx.beginPath()
  ctx.rect(area.x, area.y, area.w, area.h)
  ctx.clip()
  ctx.setTransform(s, 0, 0, s, area.x, area.y)
  ctx.textBaseline = 'alphabetic'
  const metrics = new Map<string, { asc: number; desc: number }>()
  ops.forEach((op, i) => {
    if (op.y > vh || op.y + (op.kind === 'text' ? op.h : op.h) < 0) return
    ctx.globalAlpha = op.alpha
    if (op.kind === 'box') {
      ctx.beginPath()
      ctx.roundRect(op.x, op.y, op.w, op.h, op.r)
      if (op.fill) {
        ctx.fillStyle = op.fill
        ctx.fill()
      }
      if (op.stroke) {
        ctx.beginPath()
        ctx.roundRect(op.x + op.line / 2, op.y + op.line / 2, op.w - op.line, op.h - op.line, Math.max(0, op.r - op.line / 2))
        ctx.strokeStyle = op.stroke
        ctx.lineWidth = op.line
        ctx.stroke()
      }
    } else if (op.kind === 'text') {
      ctx.font = op.font
      if ('letterSpacing' in ctx) ctx.letterSpacing = op.spacing
      let m = metrics.get(op.font)
      if (!m) {
        const t = ctx.measureText('Hg')
        m = { asc: t.fontBoundingBoxAscent, desc: t.fontBoundingBoxDescent }
        metrics.set(op.font, m)
      }
      ctx.fillStyle = op.color
      // The word's box is the font's ascent + descent: the baseline sits that far down in it.
      ctx.fillText(op.text, op.x, op.y + (op.h - m.asc - m.desc) / 2 + m.asc)
    } else {
      const img = icons[i]
      if (img) ctx.drawImage(img, op.x, op.y, op.w, op.h)
    }
  })
  ctx.restore()
}

/** "Come closer" (clicked from too far away): a pill at the bottom of the page, in its own colours. */
export function paintCloser(ctx: CanvasRenderingContext2D, area: Area, text: string, colors: { bg: string; text: string }) {
  const s = area.w / window.innerWidth
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const size = Math.round(Math.max(28 * s, area.h * 0.05))
  ctx.font = `700 ${size}px ${getComputedStyle(document.body).fontFamily}`
  const w = ctx.measureText(text).width + size * 1.6
  const h = size * 2
  const x = area.x + (area.w - w) / 2
  const y = area.y + area.h * 0.78
  ctx.fillStyle = colors.text
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = colors.bg
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, x + w / 2, y + h / 2 + size * 0.05)
  ctx.restore()
}
