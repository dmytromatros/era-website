/**
 * dfrnc step 01, simplified look-alike: two chat bubbles pop in one after another, typing
 * dots pulse, an arrow bobs. One 6 s loop. Texts are placeholders.
 */
import { DFRNC, defineWidget, font, kf, loop, pill, wrap, type DrawArgs } from './canvas'

const PERIOD = 6
const FONT = 13
const LINE = 17.5
const PAD_X = 10
const PAD_Y = 8
const PILL = { size: 11, padX: 8, height: 18 }
const GAP = 10

const FIRST = { text: 'Hi! I have a project idea.', who: 'Personal manager', color: DFRNC.blue }
const SECOND = { text: "Great! Let's talk about it.", who: 'You', color: DFRNC.orange }

/** Scale-and-fade pop, `from` = when it starts popping (0..1 of the loop). */
const pop = (p: number, from: number) => ({
  scale: kf(p, [
    [from, 0.6],
    [from + 0.1, 1],
  ]),
  alpha: kf(p, [
    [from, 0],
    [from + 0.1, 1],
    [0.85, 1],
    [0.95, 0],
  ]),
})

interface Bubble {
  lines: string[]
  bw: number
  bh: number
}

function measureBubble(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): Bubble {
  ctx.font = font(FONT)
  const lines = wrap(ctx, text, maxWidth - PAD_X * 2)
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + PAD_X * 2
  return { lines, bw, bh: lines.length * LINE + PAD_Y * 2 }
}

function drawBubble(
  { ctx, ui }: DrawArgs<unknown>,
  b: Bubble,
  x: number,
  y: number,
  tail: 'left' | 'right',
) {
  ctx.beginPath()
  const r = 10
  ctx.roundRect(x, y, b.bw, b.bh, tail === 'left' ? [r, r, r, 2] : [r, r, 2, r])
  ctx.fillStyle = ui.surface
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = ui.text
  ctx.stroke()
  ctx.fillStyle = ui.text
  ctx.font = font(FONT)
  ctx.textBaseline = 'middle'
  b.lines.forEach((line, i) => ctx.fillText(line, x + PAD_X, y + PAD_Y + LINE * (i + 0.5)))
}

/** Draw `paint` scaled around (ox, oy) with alpha. */
function popped(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: { scale: number; alpha: number }, paint: () => void) {
  if (s.alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = s.alpha
  ctx.translate(ox, oy)
  ctx.scale(s.scale, s.scale)
  ctx.translate(-ox, -oy)
  paint()
  ctx.restore()
}

export const chatWidget = defineWidget({
  height: 141,
  stillTime: PERIOD * 0.6,
  init: () => null,
  draw(args) {
    const { ctx, t, w } = args
    const p = loop(t, PERIOD)
    ctx.font = font(PILL.size)
    const firstPill = ctx.measureText(FIRST.who).width + PILL.padX * 2
    const secondPill = ctx.measureText(SECOND.who).width + PILL.padX * 2

    // Line 1: bubble on the left, its speaker on the right of it.
    const b1 = measureBubble(ctx, FIRST.text, w - firstPill - 8)
    const y1 = 0
    popped(ctx, 0, y1 + b1.bh, pop(p, 0), () => {
      drawBubble(args, b1, 0, y1, 'left')
      pill(ctx, FIRST.who, b1.bw + 8, y1 + b1.bh - PILL.height, { ...PILL, bg: FIRST.color, color: '#fff' })
    })

    // Line 2: right-aligned, speaker first.
    const b2 = measureBubble(ctx, SECOND.text, w - secondPill - 8)
    const y2 = b1.bh + GAP
    const x2 = w - b2.bw
    popped(ctx, w, y2 + b2.bh, pop(p, 0.3), () => {
      pill(ctx, SECOND.who, x2 - 8 - secondPill, y2 + b2.bh - PILL.height, { ...PILL, bg: SECOND.color, color: '#fff' })
      drawBubble(args, b2, x2, y2, 'right')
    })

    // Footer: typing dots + arrow down.
    const fy = y2 + b2.bh + GAP + 18
    for (let i = 0; i < 3; i++) {
      const s = kf(loop(t - i * 0.2, 1.2), [
        [0, 1],
        [0.5, 1.35],
        [1, 1],
      ])
      ctx.fillStyle = DFRNC.blue
      ctx.beginPath()
      ctx.arc(w * 0.4 + 12 + i * 13, fy, 4 * s, 0, Math.PI * 2)
      ctx.fill()
    }
    const bob = kf(loop(t, 1.6), [
      [0, 0],
      [0.5, 5],
      [1, 0],
    ])
    const ax = w - 22
    const ay = fy - 12 + bob
    ctx.strokeStyle = DFRNC.green
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax, ay + 20)
    ctx.moveTo(ax - 9, ay + 11)
    ctx.lineTo(ax, ay + 20)
    ctx.lineTo(ax + 9, ay + 11)
    ctx.stroke()
  },
})

