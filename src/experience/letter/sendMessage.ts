/**
 * Where a letter to the studio goes (wow-plan E9).
 *
 * STUB (2026-11-19, Dima: "the visuals now, the real sending later — I'll say where and how"):
 * nothing is sent anywhere. It waits a moment, as a real request would, logs the letter to the
 * console and reports success. Real delivery (e.g. Netlify Forms, an e-mail service) replaces
 * this one function; the form, the 3D show and their states stay as they are. (The site is a
 * portfolio piece to play with — Dima 2026-11-19: no e-mail fallback next to the form.)
 */
import type { Letter } from './letterModel'

export type SendResult = { ok: true } | { ok: false; error: string }

/** How long the stub pretends to take (ms). */
const STUB_DELAY = 900

export const sendIsStub = true

export async function sendMessage(letter: Letter): Promise<SendResult> {
  await new Promise((r) => setTimeout(r, STUB_DELAY))
  console.info('[letter] stub — not sent anywhere yet:', letter)
  return { ok: true }
}
