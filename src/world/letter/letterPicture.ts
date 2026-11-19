/**
 * The written sheet as a picture (E9): painted from the form's own DOM on the 3D stand — the
 * card's colour, then each `[data-paint]` element where the browser put it, in its own font and
 * colour (inputs: their box, their text; the message wrapped as the textarea wraps it; the
 * placeholders only while visible) — so the 3D sheet that takes its place in the same frame
 * looks the same. The form may be scaled (CSS transform, to cover the card on the screen): the
 * painting is done in its own CSS pixels. Painted once, at Send.
 */
const MAX_DPR = 2

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2))
}

/** Words wrapped into lines no wider than `width` (as the textarea does). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/(\s+)/)) {
      const next = line + word
      if (line && ctx.measureText(next).width > width && word.trim()) {
        out.push(line.trimEnd())
        line = word.trimStart()
      } else line = next
    }
    out.push(line)
  }
  return out
}

const visible = (c: string) => !/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent'

export function paintSheet(paper: HTMLElement): HTMLCanvasElement {
  const box = paper.getBoundingClientRect()
  // Screen px per CSS px of the form (its transform scale).
  const k = paper.offsetWidth > 0 ? box.width / paper.offsetWidth : 1
  const W = box.width / k
  const H = box.height / k
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * Math.max(1, k)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(W * Math.min(dpr, MAX_DPR * 1.5)))
  canvas.height = Math.max(1, Math.round(H * Math.min(dpr, MAX_DPR * 1.5)))
  const ctx = canvas.getContext('2d')!
  ctx.scale(canvas.width / W, canvas.height / H)
  const pcs = getComputedStyle(paper)
  ctx.fillStyle = pcs.backgroundColor
  ctx.fillRect(0, 0, W, H)

  for (const el of paper.querySelectorAll<HTMLElement>('[data-paint]')) {
    const cs = getComputedStyle(el)
    if (cs.opacity === '0' || cs.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    const x = (r.left - box.left) / k
    const y = (r.top - box.top) / k
    const w = r.width / k
    const h = r.height / k
    const pl = parseFloat(cs.paddingLeft) || 0
    const pt = parseFloat(cs.paddingTop) || 0
    const fs = parseFloat(cs.fontSize) || 16
    const lh = cs.lineHeight === 'normal' ? fs * 1.3 : parseFloat(cs.lineHeight)
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const radius = parseFloat(cs.borderTopLeftRadius) || 0
      if (visible(cs.backgroundColor)) {
        ctx.fillStyle = cs.backgroundColor
        roundRect(ctx, x, y, w, h, radius)
        ctx.fill()
      }
      const bw = parseFloat(cs.borderTopWidth) || 0
      if (bw > 0 && visible(cs.borderTopColor)) {
        ctx.strokeStyle = cs.borderTopColor
        ctx.lineWidth = bw
        roundRect(ctx, x + bw / 2, y + bw / 2, w - bw, h - bw, radius)
        ctx.stroke()
      }
      const value = el.value.trim() ? el.value : ''
      if (!value) continue // its placeholder is a painted span of its own
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      ctx.fillStyle = cs.color
      ctx.textBaseline = 'middle'
      const inner = w - pl - (parseFloat(cs.paddingRight) || 0)
      const lines = el instanceof HTMLTextAreaElement ? wrap(ctx, value, inner) : [value]
      const fit = Math.max(1, Math.floor((h - pt) / lh))
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.clip()
      lines.slice(0, fit).forEach((line, i) => ctx.fillText(line, x + pl, y + pt + lh * (i + 0.5)))
      ctx.restore()
    } else {
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      ctx.fillStyle = cs.color
      ctx.textBaseline = 'middle'
      ctx.fillText(el.textContent ?? '', x + pl, y + h / 2)
    }
  }
  return canvas
}
