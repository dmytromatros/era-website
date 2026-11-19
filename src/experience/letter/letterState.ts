/**
 * The letter to the studio (wow-plan E9): one store for the 2D form, the sheet over the 3D scene
 * and the paper plane's show. No three.js here — the 2D form uses it too.
 *
 * - 2D: idle → sending (the request) → folding (the CSS paper plane flies off) → sent.
 * - 3D: idle → writing (a sheet over the scene, the scroll held) → flying (the 3D show:
 *   the sheet goes to the helper, who folds a plane and throws it out of the window; the
 *   request runs meanwhile) → sent.
 * "Write another" from `sent` goes back to idle with an empty letter.
 */
import { create } from 'zustand'
import { lockScroll, unlockScroll } from '../scrollLock'
import { cleanLetter, letterErrors, type Letter, type LetterField } from './letterModel'
import { sendMessage } from './sendMessage'

export type LetterPhase = 'idle' | 'writing' | 'sending' | 'folding' | 'flying' | 'sent'

/** The written sheet handed from the HTML over the scene to the 3D show. */
export interface Sheet {
  /** Where it was on the screen (viewport px). */
  rect: { x: number; y: number; width: number; height: number }
  /** Its picture: paper, the title, the message (letterPicture.ts). */
  picture: HTMLCanvasElement
}

interface LetterState {
  phase: LetterPhase
  letter: Letter
  /** Fields to flag (only after a try to send). */
  errors: LetterField[]
  /** How the request went: the show ends on it. */
  delivery: 'none' | 'pending' | 'ok' | 'error'
  sheet: Sheet | null
}

const EMPTY: Letter = { name: '', email: '', message: '' }

export const useLetter = create<LetterState>(() => ({ phase: 'idle', letter: EMPTY, errors: [], delivery: 'none', sheet: null }))

/** The 3D show or the sheet is on (the camera keeps still, no other screen opens). */
export const letterBusy = () => {
  const p = useLetter.getState().phase
  return p === 'writing' || p === 'flying'
}

const mark = (v: string | null) => {
  if (typeof document === 'undefined') return
  if (v) document.documentElement.setAttribute('data-letter', v)
  else document.documentElement.removeAttribute('data-letter')
}

export function setLetterField(field: LetterField, value: string) {
  useLetter.setState((s) => {
    const letter = { ...s.letter, [field]: value }
    // Once flagged, a field clears its flag as soon as it is right.
    return { letter, errors: s.errors.length ? letterErrors(letter).filter((f) => s.errors.includes(f)) : s.errors }
  })
}

/** Check before sending: false (and the fields flagged) when something is not right. */
function check(): boolean {
  const errors = letterErrors(useLetter.getState().letter)
  useLetter.setState({ errors })
  return errors.length === 0
}

function deliver() {
  useLetter.setState({ delivery: 'pending' })
  void sendMessage(cleanLetter(useLetter.getState().letter)).then(
    (r) => useLetter.setState({ delivery: r.ok ? 'ok' : 'error' }),
    () => useLetter.setState({ delivery: 'error' }),
  )
}

/* ------------------------------------------------------------------ 2D */

/** The 2D form's Send. */
export function submitLetter2D() {
  if (useLetter.getState().phase !== 'idle' || !check()) return
  useLetter.setState({ phase: 'sending' })
  deliver()
  const unsub = useLetter.subscribe((s) => {
    if (s.delivery === 'pending') return
    unsub()
    if (s.phase !== 'sending') return
    if (s.delivery === 'ok') useLetter.setState({ phase: 'folding' })
    else useLetter.setState({ phase: 'idle' })
  })
}

/** The CSS paper plane has flown off. */
export function letterFolded() {
  if (useLetter.getState().phase === 'folding') useLetter.setState({ phase: 'sent' })
}

/* ------------------------------------------------------------------ 3D */

/** The 3D card was clicked: the sheet opens over the scene (the caller checked the world is free). */
export function openLetter() {
  const { phase } = useLetter.getState()
  if (phase === 'sent') resetLetter()
  if (useLetter.getState().phase !== 'idle') return
  useLetter.setState({ phase: 'writing', errors: [] })
  lockScroll('letter')
  mark('writing')
}

/** Cancel / Esc: the sheet goes, what was written stays for next time. */
export function closeLetter() {
  if (useLetter.getState().phase !== 'writing') return
  useLetter.setState({ phase: 'idle' })
  unlockScroll('letter')
  mark(null)
}

/** The sheet's Send: if the letter is right, the 3D show takes the sheet from here. */
export function submitLetter3D(sheet: () => Sheet): boolean {
  if (useLetter.getState().phase !== 'writing' || !check()) return false
  useLetter.setState({ phase: 'flying', sheet: sheet() })
  mark('flying')
  deliver()
  return true
}

/** The plane is gone (or the show could not play): the scroll is the visitor's again. */
export function letterShowDone() {
  if (useLetter.getState().phase !== 'flying') return
  useLetter.setState({ phase: 'sent', sheet: null })
  unlockScroll('letter')
  mark(null)
}

/** Leaving the page or 3D mid-way: no show; a letter already handed over still counts as sent. */
export function abortLetter() {
  const { phase } = useLetter.getState()
  if (phase === 'writing') closeLetter()
  else if (phase === 'flying') letterShowDone()
}

/** "Write another". */
export function resetLetter() {
  useLetter.setState({ phase: 'idle', letter: EMPTY, errors: [], delivery: 'none', sheet: null })
}
