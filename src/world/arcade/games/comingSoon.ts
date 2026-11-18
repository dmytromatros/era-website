/**
 * The game that is not there yet (E3, stub — Dima: "a stub 'insert coin / game coming soon' with
 * a joke"): insert a coin (it drops into the slot), the loading bar shoots to 99 % and sticks
 * there, "coming soon", then the high scores — Bohdan on top. Another coin: "nice try, still 99 %".
 */
import { drawText, textWidth } from '../pixelFont'
import { clear, COIN, COLORS, SCREEN, score6, sprite } from '../screenDraw'
import type { ArcadeGame } from './types'

type Step = 'coin' | 'dropping' | 'loading' | 'soon' | 'scores'

interface State {
  step: Step
  /** When the step started (s, the game's own time). */
  since: number
  credits: number
}

/** Seconds per step (loading: shoots up, then sticks; "still loading" after `stuck`). */
export const SOON = { drop: 0.7, fill: 1.1, stuck: 1.4, loading: 4.4, soon: 3.2, row: 0.45 } as const

const blink = (t: number, hz = 1) => Math.floor(t * hz * 2) % 2 === 0

const go = (s: State, step: Step, t: number) => {
  s.step = step
  s.since = t
}

export const comingSoon: ArcadeGame<State> = {
  init: () => ({ step: 'coin', since: 0, credits: 0 }),

  press(s, t) {
    // A coin goes in from the first screen and from the scores; not mid-joke.
    if (s.step === 'coin' || s.step === 'scores') {
      s.credits++
      go(s, 'dropping', t)
    }
  },

  draw(s, { ctx, t, texts, accent, touch }) {
    const g = texts.game
    const W = SCREEN.w
    const u = t - s.since
    clear(ctx)
    // Steps that run out move on by themselves.
    if (s.step === 'dropping' && u >= SOON.drop) go(s, 'loading', t)
    else if (s.step === 'loading' && u >= SOON.loading) go(s, 'soon', t)
    else if (s.step === 'soon' && u >= SOON.soon) go(s, 'scores', t)
    const v = t - s.since
    const exit = touch ? g.exitHintTouch : g.exitHint

    switch (s.step) {
      case 'coin':
      case 'dropping': {
        drawText(ctx, texts.insertCoin, W / 2, 26, { scale: 2, color: COLORS.text, align: 'center' })
        // The slot, and the coin over it (falling in while dropping).
        ctx.fillStyle = COLORS.dim
        ctx.fillRect(W / 2 - 9, 92, 18, 3)
        const fall = s.step === 'dropping' ? Math.min(v / SOON.drop, 1) : 0
        const y = 58 + fall * fall * 34 + (s.step === 'coin' ? Math.sin(t * 3) * 2 : 0)
        if (fall < 0.95) sprite(ctx, COIN, W / 2 - 7, y, COLORS.yellow, 2)
        if (s.step === 'coin' && blink(t, 0.8)) drawText(ctx, touch ? g.coinHintTouch : g.coinHint, W / 2, 110, { color: COLORS.cyan, align: 'center' })
        drawText(ctx, `${g.credit} ${s.credits}`, W - 4, SCREEN.h - 10, { color: COLORS.dim, align: 'right' })
        drawText(ctx, exit, 4, SCREEN.h - 10, { color: COLORS.dim })
        break
      }
      case 'loading': {
        drawText(ctx, `${g.credit} ${s.credits}`, W / 2, 22, { color: COLORS.yellow, align: 'center' })
        drawText(ctx, g.loading, W / 2, 46, { scale: 2, color: COLORS.text, align: 'center' })
        // Shoots to 99 %, then sticks — and twitches, as if it was trying.
        const shot = Math.min(v / SOON.fill, 1)
        const pct = v < SOON.fill ? Math.floor(99 * (1 - (1 - shot) ** 3)) : 99 - (Math.sin(v * 9) > 0.92 ? 1 : 0)
        const bw = 150
        const bx = W / 2 - bw / 2
        ctx.fillStyle = COLORS.dim
        ctx.fillRect(bx - 2, 72, bw + 4, 12)
        ctx.fillStyle = COLORS.bg
        ctx.fillRect(bx - 1, 73, bw + 2, 10)
        ctx.fillStyle = accent
        ctx.fillRect(bx, 74, Math.round((bw * pct) / 100), 8)
        drawText(ctx, `${pct}%`, W / 2, 92, { color: COLORS.text, align: 'center' })
        if (v > SOON.fill + SOON.stuck && blink(t, 1.2)) {
          drawText(ctx, s.credits > 1 ? g.again : g.stuck, W / 2, 112, { color: COLORS.pink, align: 'center' })
        }
        break
      }
      case 'soon': {
        const pop = Math.min(v / 0.25, 1)
        const scale = textWidth(g.soon, 3) <= W - 8 && pop >= 1 ? 3 : 2
        drawText(ctx, g.soon, W / 2 + 2, 50 + 2, { scale, color: '#2a1d5c', align: 'center' })
        drawText(ctx, g.soon, W / 2, 50, { scale, color: blink(t, 2) ? accent : COLORS.yellow, align: 'center' })
        if (v > 0.8) drawText(ctx, g.soonNote, W / 2, 92, { color: COLORS.text, align: 'center' })
        break
      }
      case 'scores': {
        drawText(ctx, g.scoresTitle, W / 2, 10, { scale: 2, color: COLORS.cyan, align: 'center' })
        texts.scores.forEach((row, i) => {
          if (v < i * SOON.row) return
          const y = 36 + i * 22
          const color = i === 0 ? COLORS.yellow : i === texts.scores.length - 1 ? COLORS.green : COLORS.text
          drawText(ctx, `${i + 1}. ${row.name}`, 8, y, { color })
          drawText(ctx, score6(row.score), W - 8, y, { color, align: 'right' })
          drawText(ctx, row.note, 8, y + 9, { color: COLORS.dim })
        })
        if (v > texts.scores.length * SOON.row + 0.6 && blink(t, 0.8)) {
          drawText(ctx, touch ? g.coinHintTouch : g.coinHint, W / 2, SCREEN.h - 22, { color: COLORS.cyan, align: 'center' })
        }
        drawText(ctx, exit, W / 2, SCREEN.h - 10, { color: COLORS.dim, align: 'center' })
        break
      }
    }
  },
}

export default comingSoon
