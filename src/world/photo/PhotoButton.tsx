'use client'

import { useExperience } from '@/experience/store'
import styles from '@/theme/ThemeSwitch.module.css'
import { useArcade } from '../arcade/arcadeState'
import { useMonitor } from '../monitor/monitorState'
import { preloadPhoto, startPhoto, usePhoto } from './photoState'

/**
 * The header's photo button (E7): only in 3D and with texts for it; usable once the visitor is in
 * the world (the cutscene, a portal, the arcade or the monitor's flight make the click do nothing —
 * `startPhoto` checks). Hover or focus fetches the hand's chunk ahead.
 */
export function PhotoButton() {
  const mode = useExperience((s) => s.mode)
  const label = useExperience((s) => s.scene?.photo?.button)
  const ready = useExperience((s) => s.handedOver && s.portal.phase === 'idle' && !s.arrival)
  const busy = usePhoto((s) => s.phase !== 'idle')
  const arcade = useArcade((s) => s.phase !== 'idle')
  const monitor = useMonitor((s) => s.phase !== 'idle')
  const screen = arcade || monitor
  if (mode !== '3d' || !label) return null
  return (
    <button
      type="button"
      className={`${styles.switch} ${styles.compact}`}
      disabled={!ready || busy || screen}
      onPointerEnter={preloadPhoto}
      onFocus={preloadPhoto}
      onClick={() => {
        preloadPhoto()
        startPhoto()
      }}
      aria-label="Take a photo of the office"
      title={label}
    >
      <span className={styles.label}>{label}</span>
      {/* Phones: a camera icon instead of the label. */}
      <svg className={styles.icon} width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M1.5 5.5a1 1 0 0 1 1-1h2.2l1.2-1.8h4.2l1.2 1.8h2.2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
        <circle cx="8" cy="9" r="2.6" />
      </svg>
    </button>
  )
}
