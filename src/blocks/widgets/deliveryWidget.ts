/**
 * dfrnc step 04, simplified look-alike: a green "done" button pops up, a check mark draws
 * itself, a little confetti bursts, the button shrinks away. One 4 s loop.
 */
import { DFRNC, defineWidget, kf, loop, partialLine } from './canvas'

const PERIOD = 4
const R = 36
const CONFETTI = [
  { dx: -70, dy: -30, c: DFRNC.red },
  { dx: -50, dy: 30, c: DFRNC.yellow },
  { dx: -20, dy: -45, c: DFRNC.blue },
  { dx: 25, dy: -45, c: DFRNC.orange },
  { dx: 55, dy: 25, c: DFRNC.blue },
  { dx: 70, dy: -25, c: DFRNC.red },
]
/** The check mark, in a 24×24 box centred on the button. */
const CHECK: [number, number][] = [
  [5, 12.5],
  [9.5, 17],
  [19, 7.5],
]

export const deliveryWidget = defineWidget({
  height: 112,
  stillTime: PERIOD * 0.5,
  init: () => null,
  draw({ ctx, t, w, h }) {
    const p = loop(t, PERIOD)
    const cx = w / 2
    const cy = h / 2

    // Confetti flies out once the check is drawn.
    const fly = kf(p, [
      [0.33, 0],
      [0.6, 1],
    ])
    const bitAlpha = kf(p, [
      [0.33, 0],
      [0.38, 1],
      [0.6, 0],
    ])
    if (bitAlpha > 0) {
      for (const { dx, dy, c } of CONFETTI) {
        ctx.save()
        ctx.globalAlpha = bitAlpha
        ctx.translate(cx + dx * fly, cy + dy * fly)
        ctx.rotate((Math.PI / 2) * fly)
        ctx.fillStyle = c
        ctx.fillRect(-3.5, -3.5, 7, 7)
        ctx.restore()
      }
    }

    const scale = kf(p, [
      [0, 0],
      [0.18, 1],
      [0.8, 1],
      [0.95, 0],
    ])
    if (scale <= 0.001) return
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    ctx.fillStyle = DFRNC.green
    ctx.beginPath()
    ctx.arc(0, 0, R, 0, Math.PI * 2)
    ctx.fill()
    const k = 30 / 24
    ctx.scale(k, k)
    ctx.translate(-12, -12)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    partialLine(
      ctx,
      CHECK,
      kf(p, [
        [0.2, 0],
        [0.35, 1],
      ]),
    )
    ctx.restore()
  },
})
