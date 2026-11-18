/**
 * The game slot of the arcade (E3): whatever runs on the screen while the visitor is inside the
 * machine. A game is its own chunk of code, loaded only when someone flies in (Arcade.tsx); for
 * now the only one is "coming soon" (Dima 2026-11-16: "the game itself is not needed yet, I have
 * not decided which"). A real game later implements the same three functions.
 */
import type { ArcadeTexts } from '@/content/schema'

export interface GameInput {
  ctx: CanvasRenderingContext2D
  /** Seconds since the visitor arrived inside. */
  t: number
  texts: ArcadeTexts
  accent: string
  /** A touch screen (hints say "tap", leaving is by the Back gesture or the button). */
  touch: boolean
}

export interface ArcadeGame<S> {
  init(): S
  /** Draw a frame (the canvas is SCREEN.w × SCREEN.h screen pixels). */
  draw(s: S, i: GameInput): void
  /** A click / tap on the screen, or Enter / Space, at `t`; x, y in screen pixels (null = a key). */
  press(s: S, t: number, at: { x: number; y: number } | null): void
}
