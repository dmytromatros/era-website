/**
 * The comic polaroid around the picture (E7), drawn once per photo into a 2D canvas and encoded
 * as PNG (`toBlob` — off the main thread where the browser can). Always the same paper, whatever
 * the theme: it is a print. Layout numbers: photoModel.polaroidLayout (tested).
 */
import { pageLabel, polaroidLayout, type Box } from './photoModel'

export interface PolaroidTexts {
  /** The caption under the picture (content/site.yaml → photo). */
  caption: string
  /** The site's name (the logo) and the page's title (the second line). */
  site: string
  page: string
  /** The page's accent: the tape and the halftone dots. */
  accent: string
}

const PAPER = '#fffdf6'
const INK = '#141414'
const GREY = '#6b6b6b'

function roundRect(ctx: CanvasRenderingContext2D, b: Box, r: number) {
  ctx.beginPath()
  ctx.roundRect(b.x, b.y, b.w, b.h, r)
}

/** Comic halftone: dots growing towards a corner of the box. */
function halftone(ctx: CanvasRenderingContext2D, b: Box, color: string) {
  const step = b.h / 9
  ctx.fillStyle = color
  for (let y = b.y + step / 2; y < b.y + b.h; y += step) {
    for (let x = b.x + step / 2; x < b.x + b.w; x += step) {
      const k = ((x - b.x) / b.w) * 0.65 + ((y - b.y) / b.h) * 0.35
      const r = step * 0.46 * Math.max(0, k - 0.25) / 0.75
      if (r < 0.6) continue
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** A strip of sticky tape with torn (zig-zag) ends, across the top edge of the picture. */
function tape(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, color: string) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-0.045)
  ctx.globalAlpha = 0.72
  ctx.fillStyle = color
  const teeth = 5
  ctx.beginPath()
  ctx.moveTo(-w / 2, -h / 2)
  ctx.lineTo(w / 2, -h / 2)
  for (let i = 1; i <= teeth; i++) ctx.lineTo(w / 2 + (i % 2 ? h * 0.08 : 0), -h / 2 + (h * i) / teeth)
  ctx.lineTo(-w / 2, h / 2)
  for (let i = 1; i <= teeth; i++) ctx.lineTo(-w / 2 - (i % 2 ? h * 0.08 : 0), h / 2 - (h * i) / teeth)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Shrink a font until `text` fits `max` px. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, max: number) {
  let px = size
  ctx.font = `${weight} ${px}px ${family}`
  while (px > 8 && ctx.measureText(text).width > max) {
    px *= 0.92
    ctx.font = `${weight} ${px}px ${family}`
  }
  return px
}

export async function composePolaroid(photo: HTMLCanvasElement, texts: PolaroidTexts, date: Date): Promise<Blob | null> {
  const family = getComputedStyle(document.body).fontFamily
  try {
    await Promise.all([document.fonts.load(`800 32px ${family}`), document.fonts.load(`600 32px ${family}`)])
  } catch {
    // the system font then
  }
  const L = polaroidLayout(photo.width, photo.height)
  const canvas = document.createElement('canvas')
  canvas.width = L.width
  canvas.height = L.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const { ink } = L
  const radius = L.photo.x * 0.35

  // Paper with an ink outline (drawn inside the edge: the PNG has no transparent margin).
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, L.width, L.height)
  ctx.lineWidth = ink * 2
  ctx.strokeStyle = INK
  roundRect(ctx, { x: ink, y: ink, w: L.width - ink * 2, h: L.height - ink * 2 }, radius)
  ctx.stroke()

  // Dots in the strip's far corner, under the text.
  halftone(ctx, { x: L.strip.x + L.strip.w * 0.55, y: L.strip.y + L.strip.h * 0.12, w: L.strip.w * 0.45, h: L.strip.h * 0.76 }, texts.accent)

  // The picture, inked round.
  ctx.drawImage(photo, L.photo.x, L.photo.y, L.photo.w, L.photo.h)
  ctx.lineWidth = ink
  ctx.strokeRect(L.photo.x - ink / 2, L.photo.y - ink / 2, L.photo.w + ink, L.photo.h + ink)
  tape(ctx, L.width / 2, L.photo.y, L.width * 0.2, L.photo.x * 1.25, texts.accent)

  // The strip: logo, caption, page · date.
  const s = L.strip
  const mark = s.h * 0.42
  const mx = s.x
  const my = s.y + (s.h - mark) / 2
  ctx.fillStyle = INK
  roundRect(ctx, { x: mx, y: my, w: mark, h: mark }, mark * 0.28)
  ctx.fill()
  ctx.fillStyle = PAPER
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${mark * 0.56}px ${family}`
  ctx.fillText(texts.site.slice(0, 1), mx + mark / 2, my + mark / 2 + mark * 0.03)

  const tx = mx + mark * 1.35
  const room = s.x + s.w - tx
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = INK
  const big = fit(ctx, texts.caption, 800, s.h * 0.22, family, room)
  ctx.fillText(texts.caption, tx, s.y + s.h * 0.48)
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const line = `${texts.site} · ${pageLabel(texts.site, texts.page)} · ${day}`
  ctx.fillStyle = GREY
  fit(ctx, line, 600, Math.min(big * 0.62, s.h * 0.14), family, room)
  ctx.fillText(line, tx, s.y + s.h * 0.48 + big * 0.95)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
