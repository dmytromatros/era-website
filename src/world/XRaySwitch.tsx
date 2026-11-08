'use client'

import { useEffect } from 'react'
import { useExperience } from '@/experience/store'
import styles from '@/theme/ThemeSwitch.module.css'
import { useXRay } from './xrayState'

/** Toggle X-ray with the ripple: it makes the switch feel intended and hides the material swap. */
function toggle() {
  useXRay.getState().toggle()
  useExperience.getState().ripple()
}

/**
 * Header button for the X-ray mode (B4) — only in 3D — plus the X key. Leaving 3D turns it off.
 */
export function XRaySwitch() {
  const mode = useExperience((s) => s.mode)
  const on = useXRay((s) => s.on)

  useEffect(() => {
    if (mode !== '3d') {
      useXRay.getState().set(false)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'x' && e.key !== 'X') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (!useExperience.getState().handedOver) return
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  if (mode !== '3d') return null
  return (
    <button
      type="button"
      className={`${styles.switch} ${styles.compact}`}
      onClick={toggle}
      aria-pressed={on}
      aria-label="X-ray: show how the 3D world is drawn (key X)"
      title="X-ray (X)"
    >
      <span className={styles.label}>X-ray</span>
      {/* Phones: a scan-frame icon instead of the label (see ThemeSwitch.module.css). */}
      <svg className={styles.icon} width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11" />
        <path d="M4.5 8h7M8 4.5v7" />
      </svg>
    </button>
  )
}
