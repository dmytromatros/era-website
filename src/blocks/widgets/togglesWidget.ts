/**
 * dfrnc step 02: "Cheap / High quality / Fast — pick two". Every second it shows another
 * pair; a click stops the demo and lets the visitor toggle, but never all three at once
 * (as dfrnc does: switching on the third switches off the "next" one). Next to them dfrnc's
 * colour dots, and a signature that writes itself (instead of dfrnc's free drawing).
 */
import { clamp01, DFRNC, defineWidget, font, kf, lerp, loop, mix, partialLine, roundRect } from './canvas'

const LABELS = ['CHEAP', 'HIGH QUALITY', 'FAST']
const COMBINATIONS: boolean[][] = [
  [true, true, false],
  [false, true, true],
  [true, false, true],
]
const COLORS = ['#050505', '#3470e3', '#e64d4d', '#19a97b']

const TOGGLE_W = 72
const TOGGLE_H = 32
const ROW = TOGGLE_H + 14
const KNOB = 20
const SWITCH = 0.25 // s, like the CSS transition
/** Top of the signature box (120×32); the underline is at its bottom, inside the widget. */
const SIGN_Y = 3 * TOGGLE_H + 2 * 14 + 16
const SIGN_PERIOD = 5

/** A scribble that reads as a signature (polyline in a 120×32 box). */
const SIGNATURE: [number, number][] = Array.from({ length: 60 }, (_, i) => {
  const p = i / 59
  return [4 + p * 112, 18 - Math.sin(p * Math.PI * 7) * 9 * (1 - 0.55 * p) + p * 4]
})

interface State {
  manual: boolean
  values: boolean[]
  /** When each toggle last changed (s) — for the switch animation. */
  changedAt: number[]
}

function setValues(s: State, next: boolean[], t: number) {
  next.forEach((v, i) => {
    if (v !== s.values[i]) s.changedAt[i] = t
  })
  s.values = next
}

export const togglesWidget = defineWidget<State>({
  height: 178,
  stillTime: SIGN_PERIOD * 0.7,
  init: () => ({ manual: false, values: [...COMBINATIONS[0]!], changedAt: [-1, -1, -1] }),

  draw({ ctx, t, w, state, ui }) {
    if (!state.manual) setValues(state, [...COMBINATIONS[Math.floor(t) % COMBINATIONS.length]!], t)

    LABELS.forEach((label, i) => {
      const y = i * ROW
      const since = clamp01((t - state.changedAt[i]!) / SWITCH)
      const on = state.values[i] ? since : 1 - since // 0 = off, 1 = on
      roundRect(ctx, 0, y, TOGGLE_W, TOGGLE_H, TOGGLE_H / 2)
      ctx.fillStyle = mix(DFRNC.light, DFRNC.green, on)
      ctx.fill()
      ctx.font = font(14)
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = on
      ctx.fillStyle = '#ffffff'
      ctx.fillText('ON', 8, y + TOGGLE_H / 2 + 0.5)
      ctx.globalAlpha = 1 - on
      ctx.fillStyle = DFRNC.grey
      ctx.fillText('OFF', TOGGLE_W - 8 - ctx.measureText('OFF').width, y + TOGGLE_H / 2 + 0.5)
      ctx.globalAlpha = 1
      ctx.fillStyle = mix(DFRNC.grey, '#ffffff', on)
      ctx.beginPath()
      ctx.arc(lerp(6, TOGGLE_W - 6 - KNOB, on) + KNOB / 2, y + TOGGLE_H / 2, KNOB / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = font(13)
      ctx.fillStyle = DFRNC.grey
      ctx.fillText(label, TOGGLE_W + 12, y + TOGGLE_H / 2 + 0.5)
    })

    COLORS.forEach((c, i) => {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(w - 8, 8 + i * 24, 8, 0, Math.PI * 2)
      ctx.fill()
    })

    // Sign: ____ with the signature writing itself.
    ctx.font = font(14)
    ctx.fillStyle = ui.text
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('Sign:', 0, SIGN_Y + 28)
    const sx = ctx.measureText('Sign:').width + 8
    ctx.fillRect(sx, SIGN_Y + 32, 120, 1)
    const p = loop(t, SIGN_PERIOD)
    const drawn = kf(p, [
      [0.1, 0],
      [0.55, 1],
    ])
    const alpha = kf(p, [
      [0.85, 1],
      [1, 0],
    ])
    ctx.save()
    ctx.translate(sx, SIGN_Y)
    ctx.globalAlpha = alpha
    ctx.strokeStyle = DFRNC.blue
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    partialLine(ctx, SIGNATURE, drawn)
    ctx.restore()
  },

  hit: (x, y) => y < 3 * ROW - 14 && x < TOGGLE_W + 12 + 110 && y % ROW < TOGGLE_H,

  click(state, x, y, w, h, t) {
    if (!togglesWidget.hit!(x, y, w, h)) return false
    const index = Math.floor(y / ROW)
    const next = [...state.values]
    next[index] = !next[index]
    if (next.every(Boolean)) next[(index + 1) % next.length] = false
    state.manual = true
    setValues(state, next, t)
    return true
  },
})
