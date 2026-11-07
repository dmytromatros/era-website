'use client'

import { useIsClient } from '@/lib/useIsClient'
import { useThemeStore } from './store'
import { DEFAULT_THEME, THEME_NAMES, themes } from './tokens'
import styles from './ThemeSwitch.module.css'

/** Cycles through every theme in `tokens.ts`. */
export function ThemeSwitch() {
  const stored = useThemeStore((s) => s.name)
  const setTheme = useThemeStore((s) => s.setTheme)
  // The server cannot know the saved theme, so the first render always uses the default.
  const name = useIsClient() ? stored : DEFAULT_THEME

  const next = THEME_NAMES[(THEME_NAMES.indexOf(name) + 1) % THEME_NAMES.length]!
  return (
    <button
      type="button"
      className={styles.switch}
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${themes[next].label} theme`}
      title={`Theme: ${themes[name].label}`}
    >
      <span className={styles.dot} aria-hidden />
      {themes[name].label}
    </button>
  )
}
