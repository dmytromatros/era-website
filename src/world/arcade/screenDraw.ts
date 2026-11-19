/**
 * What the arcade's screen shows while nobody is inside it (E3): the attract screen (title,
 * hi-score, bugs crawling, "insert coin"), the game of someone from the office playing it, and
 * banners over either ("game over", "come closer"). Drawn on a small canvas (SCREEN) that the 3D
 * world shows with nearest-neighbour filtering: crisp pixel art. Own sprites (bugs to squash, a
 * cursor for a ship) — not any existing game's look. Pure canvas drawing; texts from content.
 */
import type { ArcadeTexts } from '@/content/schema'
import { drawText, textWidth } from './pixelFont'

/** The canvas, in screen pixels (4 : 3, as the screen). */
export const SCREEN = { w: 192, h: 144 } as const

export const COLORS = {
  bg: '#070b1f',
  text: '#e8f1ff',
  dim: '#7d8bb5',
  pink: '#ff4fa3',
  cyan: '#36e2ff',
  yellow: '#ffd23f',
  green: '#5cff7a',
  red: '#ff5146',
} as const

const sprites = (...r: string[]) => r

/** A bug, two frames of its legs. */
const BUG = [
  sprites('..#...#..', '...#.#...', '.#######.', '##.###.##', '.#######.', '#.#####.#', '..#...#..'),
  sprites('..#...#..', '...#.#...', '.#######.', '##.###.##', '.#######.', '.#.###.#.', '#.......#'),
]
/** The player's ship: a mouse cursor. */
const SHIP = sprites('#......', '##.....', '###....', '####...', '#####..', '##.##..', '#...##.')
/** A coin. */
export const COIN = sprites('..###..', '.#####.', '##.#.##', '##.#.##', '##.#.##', '.#####.', '..###..')
/** A burst where a bug was squashed. */
const POP = sprites('#.#.#', '.#.#.', '#...#', '.#.#.', '#.#.#')

/** Draw a sprite (rows of '#') with its top-left at (x, y). */
export function sprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, color: string, scale = 1) {
  ctx.fillStyle = color
  const left = Math.round(x)
  const top = Math.round(y)
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!
    for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(left + c * scale, top + r * scale, scale, scale)
  }
}

const blink = (t: number, hz = 1) => Math.floor(t * hz * 2) % 2 === 0

/** Score with leading zeros. */
export const score6 = (n: number) => String(Math.max(0, Math.min(999999, Math.floor(n)))).padStart(6, '0')

export function clear(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, SCREEN.w, SCREEN.h)
}

/** A few stars drifting down (the same ones every frame: from their index). */
function stars(ctx: CanvasRenderingContext2D, t: number, speed: number) {
  ctx.fillStyle = COLORS.dim
  for (let i = 0; i < 28; i++) {
    const x = (i * 73 + 11) % SCREEN.w
    const y = ((i * 41 + t * speed * (1 + (i % 3))) % SCREEN.h + SCREEN.h) % SCREEN.h
    ctx.fillRect(x, Math.floor(y), 1, 1)
  }
}

/** Nobody playing: hi-score, the title, bugs crawling past, "insert coin". */
export function drawAttract(ctx: CanvasRenderingContext2D, t: number, texts: ArcadeTexts, accent: string) {
  clear(ctx)
  stars(ctx, t, 6)
  const W = SCREEN.w
  const top = texts.scores[0]
  if (top) {
    const line = `${texts.hiScore} ${top.name} ${score6(top.score)}`
    drawText(ctx, line, W / 2, 6, { color: COLORS.yellow, align: 'center' })
  }
  // Bugs crawling across, in step.
  const frame = Math.floor(t * 2.5) % 2
  const shift = ((t * 14) % 24) - 12
  for (let i = 0; i < 6; i++) sprite(ctx, BUG[frame]!, 18 + i * 28 + shift, 22, i % 2 ? COLORS.green : COLORS.cyan)
  // The title, big, with a hard shadow and a sheen running along it.
  const scale = texts.title.length > 5 ? 3 : 4
  const ty = 42
  drawText(ctx, texts.title, W / 2 + scale, ty + scale, { scale, color: '#2a1d5c', align: 'center' })
  drawText(ctx, texts.title, W / 2, ty, { scale, color: accent, align: 'center' })
  const tw = textWidth(texts.title, scale)
  const sheen = ((t * 0.6) % 1.6) - 0.3
  if (sheen > 0 && sheen < 1) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(W / 2 - tw / 2 + sheen * tw - 6, ty, 6, 7 * scale)
    ctx.clip()
    drawText(ctx, texts.title, W / 2, ty, { scale, color: '#ffffff', align: 'center' })
    ctx.restore()
  }
  drawText(ctx, texts.subtitle, W / 2, 80, { scale: 2, color: COLORS.cyan, align: 'center' })
  if (blink(t, 0.8)) drawText(ctx, texts.insertCoin, W / 2, 108, { scale: 2, color: COLORS.text, align: 'center' })
  sprite(ctx, COIN, W / 2 - 3, 126, COLORS.yellow)
}

/** Someone from the office playing: the cursor-ship shoots at a swarm of bugs. */
export function drawDemo(ctx: CanvasRenderingContext2D, t: number) {
  clear(ctx)
  stars(ctx, t, 18)
  const W = SCREEN.w
  drawText(ctx, `1UP ${score6(1200 + t * 37)}`, 4, 4, { color: COLORS.yellow })
  // The swarm sways and a bug pops now and then (whichever the cycle picks).
  // Never negative (t can be, for a frame): BUG[-1] does not exist.
  const frame = ((Math.floor(t * 3) % 2) + 2) % 2
  const sway = Math.sin(t * 0.9) * 14
  const popped = Math.floor(t / 0.7) % 18
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      const k = r * 6 + c
      const x = 30 + c * 24 + sway
      const y = 20 + r * 14
      if (k === popped) {
        if ((t % 0.7) < 0.3) sprite(ctx, POP, x + 2, y + 1, COLORS.yellow)
        continue
      }
      sprite(ctx, BUG[frame]!, x, y, r === 0 ? COLORS.pink : r === 1 ? COLORS.cyan : COLORS.green)
    }
  }
  // The ship darts left and right, shooting.
  const sx = W / 2 + Math.sin(t * 1.7) * 60 + Math.sin(t * 4.3) * 10
  sprite(ctx, SHIP, sx - 3, 126, COLORS.text)
  ctx.fillStyle = COLORS.yellow
  for (let i = 0; i < 3; i++) {
    const age = (t + i * 0.25) % 0.75
    const bx = W / 2 + Math.sin((t - age) * 1.7) * 60 + Math.sin((t - age) * 4.3) * 10
    ctx.fillRect(Math.round(bx - 3), Math.round(124 - age * 140), 1, 3)
  }
}

/** A banner over the screen: a dark box and a blinking line ("game over", "come closer"). */
export function drawBanner(ctx: CanvasRenderingContext2D, text: string, t: number, color: string) {
  const scale = textWidth(text, 2) <= SCREEN.w - 24 ? 2 : 1
  const w = textWidth(text, scale) + 16
  const h = 7 * scale + 14
  const x = Math.round(SCREEN.w / 2 - w / 2)
  const y = Math.round(SCREEN.h / 2 - h / 2)
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, 1)
  ctx.fillRect(x, y + h - 1, w, 1)
  ctx.fillRect(x, y, 1, h)
  ctx.fillRect(x + w - 1, y, 1, h)
  if (blink(t, 2)) drawText(ctx, text, SCREEN.w / 2, y + 7, { scale, color, align: 'center' })
}

/**
 * The CRT look, drawn over every frame with one drawImage: scanlines and a dark vignette at the
 * edges (made once).
 */
export function makeCrt(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SCREEN.w
  c.height = SCREEN.h
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(0, 0, 0, 0.28)'
  for (let y = 1; y < SCREEN.h; y += 2) g.fillRect(0, y, SCREEN.w, 1)
  const v = g.createRadialGradient(SCREEN.w / 2, SCREEN.h / 2, SCREEN.h * 0.45, SCREEN.w / 2, SCREEN.h / 2, SCREEN.w * 0.62)
  v.addColorStop(0, 'rgba(0, 0, 0, 0)')
  v.addColorStop(1, 'rgba(0, 0, 0, 0.55)')
  g.fillStyle = v
  g.fillRect(0, 0, SCREEN.w, SCREEN.h)
  return c
}
