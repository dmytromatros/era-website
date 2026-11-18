'use client'

import { useExperience } from '@/experience/store'
import { useIsClient } from '@/lib/useIsClient'
import styles from '@/theme/ThemeSwitch.module.css'
import { useThemeStore } from '@/theme/store'
import { useDaylight } from './daylightChoice'

/**
 * Day ↔ Live time (E6): the plain day, or the office following the visitor's clock. Only in 3D
 * and in the light theme (the dark one is its own "night office"). Fires the ripple, like the
 * style switch; only colours change, no shader compiles.
 */
export function DaylightSwitch() {
  const mode = useExperience((s) => s.mode)
  const theme = useThemeStore((s) => s.name)
  const stored = useDaylight((s) => s.live)
  const setLive = useDaylight((s) => s.setLive)
  // The server cannot know the saved choice: the first render uses the default (day).
  const live = useIsClient() ? stored : false
  if (mode !== '3d' || theme !== 'light') return null
  return (
    <button
      type="button"
      className={styles.switch}
      onClick={() => {
        setLive(!live)
        useExperience.getState().ripple()
      }}
      aria-label={live ? 'Show the office by day' : "Show the office at your local time of day"}
      title={live ? 'Time: your clock' : 'Time: day'}
    >
      {live ? 'Live time' : 'Day'}
    </button>
  )
}
