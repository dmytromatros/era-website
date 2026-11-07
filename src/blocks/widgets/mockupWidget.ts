/**
 * dfrnc step 03, simplified look-alike: a small page mockup; a Designer cursor tilts the
 * heading, a Developer cursor highlights the image and clicks the button. One 6 s loop.
 */
import { DFRNC, defineWidget, font, kf, lerp, loop, pill, roundRect } from './canvas'

const PERIOD = 6
const PAD = 8

/** Cursor arrow (12×14) + name tag, tip at (x, y). */
function cursor(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, name: string, press: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(press, press)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(12, 7)
  ctx.lineTo(7, 8.5)
  ctx.lineTo(5, 14)
  ctx.closePath()
  ctx.fill()
  pill(ctx, name, 10, 10, { size: 10, padX: 5, height: 14, bg: color, color: '#fff', radius: 0 })
  ctx.restore()
}

/** Move along waypoints: [[at, x, y], …]. */
function path(p: number, pts: [number, number, number][]): [number, number] {
  return [kf(p, pts.map(([a, x]) => [a, x])), kf(p, pts.map(([a, , y]) => [a, y]))]
}

export const mockupWidget = defineWidget({
  height: 112,
  stillTime: PERIOD * 0.05,
  init: () => null,
  draw({ ctx, t, w, h, ui }) {
    const p = loop(t, PERIOD)

    // Frame (dashed) — everything is clipped to it, cursors wait outside.
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 10)
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = ui.border
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])
    ctx.save()
    ctx.clip()

    // Image box (outlined in orange while the developer looks at it).
    const iw = (w - PAD * 2) * 0.42
    const ih = h - PAD * 2
    roundRect(ctx, PAD, PAD, iw, ih, 8)
    ctx.fillStyle = ui.bg
    ctx.fill()
    const outline = kf(p, [
      [0.5, 0],
      [0.55, 1],
      [0.65, 1],
      [0.7, 0],
    ])
    if (outline > 0) {
      ctx.globalAlpha = outline
      ctx.strokeStyle = DFRNC.orange
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.font = font(11)
    ctx.fillStyle = DFRNC.grey
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText('Image', PAD + iw / 2, PAD + ih / 2)
    ctx.textAlign = 'left'

    // Body: heading (tilts), two text lines, a button (pressed).
    const bx = PAD + iw + 10
    const bw = w - PAD - bx
    const hy = PAD + 14
    const tilt = kf(p, [
      [0.25, 0],
      [0.35, 1],
      [0.45, 1],
      [0.55, 0],
    ])
    ctx.save()
    ctx.translate(bx + 10 * tilt, hy - 6 * tilt)
    ctx.rotate((-12 * Math.PI * tilt) / 180)
    ctx.font = font(13)
    ctx.fillStyle = DFRNC.grey
    ctx.fillText('Heading', 0, 0)
    ctx.restore()
    ctx.fillStyle = ui.border
    roundRect(ctx, bx, hy + 14, bw, 5, 3)
    ctx.fill()
    roundRect(ctx, bx, hy + 25, bw * 0.6, 5, 3)
    ctx.fill()
    const press = kf(p, [
      [0.78, 1],
      [0.82, 0.9],
      [0.88, 1],
    ])
    const btnY = h - PAD - 18
    ctx.save()
    ctx.translate(bx + 28, btnY + 9)
    ctx.scale(press, press)
    pill(ctx, 'Button', -28, -9, { size: 10, padX: 12, height: 18, bg: DFRNC.blue, color: '#fff' })
    ctx.restore()

    // Designer: to the heading, drags it into a tilt, lets it spring back.
    const [dx, dy] = path(p, [
      [0.1, w + 20, h + 20],
      [0.25, bx + 30, hy + 2],
      [0.45, bx + 42, hy - 10],
      [0.6, w + 20, h + 20],
    ])
    cursor(ctx, dx, dy, DFRNC.red, 'Designer', 1)

    // Developer: to the image, then clicks the button.
    const [vx, vy] = path(p, [
      [0.4, -40, h + 20],
      [0.55, PAD + iw * 0.6, PAD + ih * 0.5],
      [0.7, bx + 30, btnY + 9],
      [0.85, bx + 30, btnY + 9],
      [1, -40, h + 20],
    ])
    const click = lerp(1, 0.85, kf(p, [
      [0.78, 0],
      [0.8, 1],
      [0.85, 0],
    ]))
    cursor(ctx, vx, vy, DFRNC.orange, 'Developer', click)

    ctx.restore()
  },
})
