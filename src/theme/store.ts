'use client'

import { create } from 'zustand'
import { DEFAULT_THEME, isThemeName, THEME_STORAGE_KEY, themes, type ThemeName } from './tokens'

interface ThemeState {
  name: ThemeName
  setTheme: (name: ThemeName) => void
}

function initialTheme(): ThemeName {
  if (typeof document === 'undefined') return DEFAULT_THEME
  const attr = document.documentElement.getAttribute('data-theme')
  return isThemeName(attr) ? attr : DEFAULT_THEME
}

export const useThemeStore = create<ThemeState>((set) => ({
  name: initialTheme(),
  setTheme: (name) => {
    document.documentElement.setAttribute('data-theme', name)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, name)
    } catch {
      // storage unavailable (private mode etc.) — the theme still applies for this visit
    }
    set({ name })
  },
}))

/** Current theme tokens — for the 3D world and anything that needs raw colour values. */
export function useTheme() {
  return themes[useThemeStore((s) => s.name)]
}
