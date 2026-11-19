'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { LetterForm as LetterTexts } from '@/content/schema'
import { LetterForm } from '@/experience/letter/LetterForm'
import { closeLetter, submitLetter3D, useLetter } from '@/experience/letter/letterState'
import { useExperience } from '@/experience/store'
import { paintSheet } from './letterPicture'
import { thrower, useLetterShow } from './letterShow'
import { SpeechBubble } from '../SpeechBubble'
import helperStyles from '../Helper.module.css'
import styles from './LetterSheet.module.css'

/**
 * Writing on the 3D stand (E9, Dima 2026-11-19: "write right here — not an ordinary window"):
 * once the camera has flown up to the letter card, the very same form lies exactly over the
 * card on the screen (scaled to cover it), so the visitor writes on the stand itself. Send paints
 * it into the 3D sheet's picture, and the sheet peels off the stand in the same frame
 * (`html[data-letter-3d]` hides this one). And the helper's lines, docked at the bottom.
 * Outside the aria-hidden canvas: a real form.
 */
export function LetterSheet() {
  const page = useExperience((s) => s.scene?.page)
  const texts = useMemo<LetterTexts | undefined>(() => {
    for (const b of page?.blocks ?? []) if (b.type === 'cta' && b.form) return b.form
    return undefined
  }, [page])
  const phase = useLetter((s) => s.phase)
  const card = useLetterShow((s) => s.cardRect)
  const line = useLetterShow((s) => s.line)
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (phase !== 'writing') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLetter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  // The 2D form's own width (CSS px) — the 3D card was measured from it: laid out at the same
  // width, this one has the card's proportions, and is scaled onto it.
  const shown = !!texts && !!card && (phase === 'writing' || phase === 'flying')
  // (Read when it shows: only in the browser, once the camera is at the card.)
  const width = useMemo(() => (shown ? document.querySelector<HTMLElement>('[data-el="letter"]')?.offsetWidth || 460 : 0), [shown])

  const send = () => {
    const el = form.current
    if (!el) return
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    submitLetter3D(() => {
      const r = el.getBoundingClientRect()
      return { rect: { x: r.left, y: r.top, width: r.width, height: r.height }, picture: paintSheet(el) }
    })
  }

  const scale = card && width ? card.width / width : 1
  return (
    <>
      {shown && (
        <div className={`${styles.layer} ${phase === 'flying' ? styles.flying : ''}`} data-scroll-free="">
          <div className={styles.stand} style={{ left: card.x, top: card.y, width: width || undefined, transform: `scale(${scale})`, opacity: width ? 1 : 0 }}>
            <LetterForm texts={texts} onSend={send} formRef={form} />
          </div>
          <button
            type="button"
            className={styles.cancel}
            style={{ left: card.x + card.width / 2, top: Math.min(card.y + card.height + 14, window.innerHeight - 60) }}
            onClick={closeLetter}
            disabled={phase !== 'writing'}
          >
            {texts.cancel}
            <kbd className={styles.key}>Esc</kbd>
          </button>
        </div>
      )}
      {line && (
        // The helper's line, docked at the bottom: heard even when the camera is off by the window.
        <div className={styles.lineLayer}>
          <div className={helperStyles.dock}>
            <SpeechBubble key={line} name={thrower.name} lines={[line]} onDone={() => {}} />
          </div>
        </div>
      )}
    </>
  )
}
