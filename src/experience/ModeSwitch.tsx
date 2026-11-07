'use client'

import { useExperience } from './store'
import styles from '@/theme/ThemeSwitch.module.css'

/** Lets the visitor leave (or re-enter) the 3D layer. Hidden until the mode is decided. */
export function ModeSwitch() {
  const mode = useExperience((s) => s.mode)
  const setMode = useExperience((s) => s.setMode)
  const capable = useExperience((s) => s.capable)
  if (mode === 'pending' || !capable) return null

  const to3d = mode === '2d'
  return (
    <button
      type="button"
      className={styles.switch}
      onClick={() => {
        window.scrollTo({ top: 0 })
        setMode(to3d ? '3d' : '2d')
      }}
      aria-label={to3d ? 'Switch to the 3D experience' : 'Switch to the flat 2D page'}
    >
      {to3d ? '3D' : '2D'}
    </button>
  )
}
