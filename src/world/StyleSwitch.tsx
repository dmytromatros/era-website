'use client'

import { useExperience } from '@/experience/store'
import { useIsClient } from '@/lib/useIsClient'
import styles from '@/theme/ThemeSwitch.module.css'
import { DEFAULT_STYLE, STYLE, SWITCHABLE, useStyle } from './style'

/**
 * Comic ↔ Pastel (wow-plan A2). Only in 3D — the 2D page does not change with the style.
 * The switch fires the ripple: it makes the change feel intended and hides the moment the
 * GPU recompiles the materials' shaders for the new style.
 */
export function StyleSwitch() {
  const mode = useExperience((s) => s.mode)
  const stored = useStyle((s) => s.name)
  const setStyle = useStyle((s) => s.setStyle)
  // The server cannot know the saved style, so the first render uses the default.
  const name = useIsClient() ? stored : DEFAULT_STYLE
  if (mode !== '3d') return null

  const at = SWITCHABLE.indexOf(name)
  const next = SWITCHABLE[(at + 1) % SWITCHABLE.length]!
  return (
    <button
      type="button"
      className={styles.switch}
      onClick={() => {
        setStyle(next)
        useExperience.getState().ripple()
      }}
      aria-label={`Switch to the ${STYLE[next].label} look`}
      title={`Look: ${STYLE[name].label}`}
    >
      {STYLE[name].label}
    </button>
  )
}
