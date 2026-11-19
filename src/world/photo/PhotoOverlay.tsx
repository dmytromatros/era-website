'use client'

import { useEffect } from 'react'
import { useExperience } from '@/experience/store'
import { PHOTO } from './photoModel'
import { cancelPhoto, closePicture, photoBusy, usePhoto, type Picture } from './photoState'
import styles from './PhotoOverlay.module.css'

/** On a phone, "Save" opens the system share sheet with the file (Save to Photos, messengers…). */
async function savePicture(p: Picture) {
  const file = new File([p.blob], p.name, { type: 'image/png' })
  const touch = matchMedia('(hover: none)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return // the visitor closed the sheet
    }
  }
  const a = document.createElement('a')
  a.href = p.url
  a.download = p.name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** The countdown over the frame: a big comic number as the scene counts (Photo.tsx writes it). */
function Countdown() {
  const since = usePhoto((s) => s.since)
  const count = usePhoto((s) => s.count)
  if (!count) return null
  return (
    <div className={styles.count} aria-hidden>
      <span key={`${since}-${count}`} className={styles.number} style={{ animationDuration: `${PHOTO.tick}s` }}>
        {count}
      </span>
    </div>
  )
}

/** The white flash of the shutter, and "Cheese!". */
function Flash({ cheese }: { cheese: string }) {
  const flash = usePhoto((s) => s.flash)
  if (!flash) return null
  return (
    <>
      <div key={`f${flash}`} className={styles.flash} aria-hidden />
      <div key={`c${flash}`} className={styles.count} aria-hidden>
        <span className={`${styles.number} ${styles.cheese}`}>{cheese}</span>
      </div>
    </>
  )
}

/** The polaroid that comes out: it develops, then Save / Close. */
function Card({ save, share, close }: { save: string; share: string; close: string }) {
  const picture = usePhoto((s) => s.picture)
  if (!picture) return null
  // Only ever rendered in the browser (there is no picture on the server).
  const touch = matchMedia('(hover: none)').matches
  return (
    <div className={styles.card} key={picture.url} role="dialog" aria-label="Your photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- a local blob, not an optimisable asset */}
      <img className={styles.picture} src={picture.url} alt="" />
      <div className={styles.actions}>
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => void savePicture(picture)}>
          {touch ? share : save}
        </button>
        <button type="button" className={styles.button} onClick={closePicture}>
          {close}
        </button>
      </div>
    </div>
  )
}

/**
 * The photo mode's layer over the canvas (E7): countdown, flash and the polaroid card. Esc stops a
 * countdown (no picture) or closes the card. Outside the aria-hidden canvas: real buttons.
 */
export function PhotoOverlay() {
  const texts = useExperience((s) => s.scene?.photo)
  const mode = useExperience((s) => s.mode)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (photoBusy()) cancelPhoto()
      else closePicture()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Back in 2D: the card goes too.
  useEffect(() => {
    if (mode !== '3d') closePicture()
  }, [mode])

  if (!texts) return null
  return (
    <>
      <Countdown />
      <Flash cheese={texts.cheese} />
      <Card save={texts.save} share={texts.share} close={texts.close} />
    </>
  )
}
