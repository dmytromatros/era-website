'use client'

import type { FormEvent, Ref } from 'react'
import type { LetterForm as LetterTexts } from '@/content/schema'
import { LETTER_LIMITS, type LetterField } from './letterModel'
import { letterFolded, resetLetter, setLetterField, submitLetter2D, useLetter } from './letterState'
import styles from './LetterForm.module.css'

/** A small paper plane (2D only — not a text glyph, the 3D font has none). */
export function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M2.5 11.5 21 3l-6.5 18-3.2-7.3z" />
      <path d="m11.3 13.7 4-4" />
    </svg>
  )
}

/** One field: its label (a part of the 3D card), the input, and its message when it is not right. */
function Field({ field, label, placeholder, error, multiline, prefix, first }: { field: LetterField; label: string; placeholder: string; error: string; multiline?: boolean; prefix: string; first?: boolean }) {
  const value = useLetter((s) => s.letter[field])
  const wrong = useLetter((s) => s.errors.includes(field))
  const id = `${prefix}-${field}`
  const common = {
    id,
    name: field,
    value,
    // The visible placeholder is the span below (a part of the 3D card); the native one is a
    // space, only so that `:placeholder-shown` hides the span once something is typed.
    placeholder: ' ',
    maxLength: LETTER_LIMITS[field],
    autoFocus: first,
    'data-paint': '',
    'aria-invalid': wrong || undefined,
    'aria-describedby': wrong ? `${id}-error` : undefined,
    className: multiline ? `${styles.input} ${styles.area}` : styles.input,
    onChange: (e: { target: { value: string } }) => setLetterField(field, e.target.value),
  }
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label} data-part data-paint="">
        {label}
      </label>
      <div className={styles.box}>
        {multiline ? <textarea rows={4} {...common} /> : <input type={field === 'email' ? 'email' : 'text'} autoComplete={field} {...common} />}
        <span className={styles.ghost} data-part data-paint="" aria-hidden>
          {placeholder}
        </span>
      </div>
      {wrong && (
        <span id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

/**
 * The letter form of a CTA (wow-plan E9) — the real 2D form (the source of truth). It is also the
 * 3D card `letter`: its title, labels and button are the card's parts; in 3D a click on the card
 * opens the sheet over the scene instead (`data-action`). Sent from here (2D), the sheet folds
 * into a paper plane that flies off.
 */
export function LetterForm({ texts, onSend, formRef }: { texts: LetterTexts; onSend?: () => void; formRef?: Ref<HTMLFormElement> }) {
  const phase = useLetter((s) => s.phase)
  // On the 3D stand (E9): the same form, written on in place; Send hands it to the 3D show.
  const onStand = !!onSend
  const prefix = onStand ? 'stand' : 'letter'

  if (phase === 'sent' && !onStand) {
    return (
      <div className={`${styles.sheet} ${styles.thanks}`} data-el="letter" data-kind="card" data-action="letter">
        <PlaneIcon className={styles.thanksIcon} />
        <p className={styles.title} data-part>
          {texts.sent}
        </p>
        <button type="button" className={styles.again} onClick={resetLetter}>
          <span data-part>{texts.again}</span>
        </button>
      </div>
    )
  }

  const busy = phase === 'sending' || phase === 'folding' || (onStand && phase !== 'writing')
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (onSend) onSend()
    else submitLetter2D()
  }
  return (
    <form
      ref={formRef}
      className={`${styles.sheet} ${phase === 'folding' ? styles.folding : ''}`}
      {...(onStand ? {} : { 'data-el': 'letter', 'data-kind': 'card', 'data-action': 'letter' })}
      noValidate
      onSubmit={onSubmit}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && phase === 'folding') letterFolded()
      }}
      aria-busy={busy || undefined}
    >
      <p className={styles.title} data-part data-paint="">
        {texts.title}
      </p>
      <Field field="name" label={texts.name} placeholder={texts.namePlaceholder} error={texts.invalid.name} prefix={prefix} first={onStand} />
      <Field field="email" label={texts.email} placeholder={texts.emailPlaceholder} error={texts.invalid.email} prefix={prefix} />
      <Field field="message" label={texts.message} placeholder={texts.messagePlaceholder} error={texts.invalid.message} prefix={prefix} multiline />
      <button type="submit" className={styles.send} disabled={busy}>
        {/* Not a card part: white on the button, it would vanish on the white 3D card. */}
        <span>{phase === 'sending' ? texts.sending : texts.send}</span>
        <PlaneIcon />
      </button>
    </form>
  )
}
