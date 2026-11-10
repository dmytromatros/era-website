/**
 * The entrance as one cutscene that cannot be skipped (Dima, 2026-11-10: "a skills demo, so that
 * is fine"): the crack → the stumble and the look at the hands → the camera walks the rest of
 * the entrance by itself (the hero flies onto its places) → the coffee (the visitor has to answer)
 * → the scroll is the visitor's again, with Max ahead. Pure, tested in cutsceneModel.test.ts; the
 * <Cutscene> component locks the scroll and moves the page.
 *
 * Once per page view (like the coffee): re-entering from the top later, the crack and the stumble
 * play as before but nothing is locked. Never on arriving through a portal or Back (no crack).
 */
import { BREAK } from '../firstPerson/breakModel'
import { ENTRANCE } from '../timeline'

export const CUTSCENE = {
  /** After the crack: the fall, stumble and the look at the hands are over by then (s)… */
  walkInAfter: BREAK.settle - 0.1,
  /** …then the camera walks the rest of the entrance in this long (s). */
  walkIn: 2.6,
  /** The coffee is over this long after she starts walking off (she is out of the frame). */
  afterLeaving: 2.2,
} as const

export type CutPhase = 'idle' | 'fall' | 'walkIn' | 'coffee' | 'done'

/** Once per page view (a reload plays it again). */
export const cutsceneMemory = { played: false }

/** The current phase, for the coffee (it starts when the cutscene says so). */
export const cutsceneNow: { phase: CutPhase } = { phase: 'idle' }

export interface CutState {
  phase: CutPhase
  since: number
  /** Scroll units where the crack happened (the page is held there) / where the walk-in began. */
  at: number
}

export const newCutscene = (): CutState => ({ phase: 'idle', since: 0, at: 0 })

export interface CutInput {
  now: number
  /** Scene-clock time of the crack (breakModel), null / −∞ = none. */
  crackAt: number | null
  /** Scroll units at the crack, and right now. */
  crackUnits: number
  units: number
  /** There is a coffee welcome on this page, and how far it is (coffeeModel). */
  welcome: boolean
  coffee: 'waiting' | 'approaching' | 'offering' | 'taking' | 'declining' | 'leaving' | 'done'
  coffeeSince: number
}

export interface CutOutput {
  /** The visitor may not scroll. */
  lock: boolean
  /** Where the page should be (scroll units), null = leave it. */
  scroll: number | null
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

/** The camera walking the rest of the entrance: scroll units `t` seconds into the walk-in. */
export const walkInUnits = (t: number, from: number) => from + (ENTRANCE - from) * ease(Math.min(Math.max(t / CUTSCENE.walkIn, 0), 1))

export function stepCutscene(s: CutState, i: CutInput, memory = cutsceneMemory): CutOutput {
  const t = i.now - s.since
  switch (s.phase) {
    case 'idle':
      // A fresh crack (this entrance) and not played yet in this page view.
      if (!memory.played && i.crackAt !== null && Number.isFinite(i.crackAt) && i.now - i.crackAt < 0.5) {
        memory.played = true
        s.phase = 'fall'
        s.since = i.crackAt
        s.at = i.crackUnits
        return { lock: true, scroll: s.at }
      }
      return { lock: false, scroll: null }
    case 'fall':
      if (t >= CUTSCENE.walkInAfter) {
        s.phase = 'walkIn'
        s.since = i.now
        s.at = i.units
        return { lock: true, scroll: s.at }
      }
      return { lock: true, scroll: s.at }
    case 'walkIn':
      if (t >= CUTSCENE.walkIn) {
        s.phase = i.welcome ? 'coffee' : 'done'
        s.since = i.now
        return { lock: s.phase === 'coffee', scroll: ENTRANCE }
      }
      return { lock: true, scroll: walkInUnits(t, s.at) }
    case 'coffee':
      if (i.coffee === 'done' || (i.coffee === 'leaving' && i.now - i.coffeeSince >= CUTSCENE.afterLeaving)) {
        s.phase = 'done'
        s.since = i.now
        return { lock: false, scroll: null }
      }
      return { lock: true, scroll: ENTRANCE }
    case 'done':
      return { lock: false, scroll: null }
  }
}
