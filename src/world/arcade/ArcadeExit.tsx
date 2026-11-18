'use client'

import { useExperience } from '@/experience/store'
import { leaveArcade, useArcade } from './arcadeState'
import styles from './ArcadeExit.module.css'

/**
 * The way back out of the arcade (E3): a button over the screen while the visitor is inside the
 * machine (Esc and the browser's Back do the same). Outside the canvas, so screen readers and the
 * keyboard reach it (not focused by itself: Enter / Space insert a coin in the machine).
 */
export function ArcadeExit() {
  const label = useExperience((s) => s.scene?.arcade?.back)
  const shown = useArcade((s) => s.phase === 'entering' || s.phase === 'inside')
  if (!label) return null
  return (
    <div className={`${styles.wrap} ${shown ? styles.shown : ''}`}>
      <button
        type="button"
        className={styles.button}
        tabIndex={shown ? 0 : -1}
        aria-hidden={!shown}
        onClick={() => leaveArcade()}
      >
        <span className={styles.arrow} aria-hidden />
        {label}
        <kbd className={styles.key}>Esc</kbd>
      </button>
    </div>
  )
}
