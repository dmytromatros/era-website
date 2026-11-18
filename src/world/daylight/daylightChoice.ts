/**
 * The visitor's choice (E6, Dima 2026-11-18: "a switch for the time of day — off by default"):
 * `live` = the office follows the visitor's clock (morning, day, sunset, evening); off (the
 * default) = the plain day of the theme, as before E6. Remembered in localStorage; `?time=`
 * (testing) turns it on for the visit. Switched with <DaylightSwitch> in the header (3D only).
 */
import { create } from 'zustand'
import { parseTime } from './daylightModel'

const STORAGE_KEY = 'era-daylight'

function initial(): boolean {
  if (typeof location === 'undefined') return false
  if (parseTime(new URLSearchParams(location.search).get('time')) !== null) return true
  try {
    return localStorage.getItem(STORAGE_KEY) === 'live'
  } catch {
    return false
  }
}

export const useDaylight = create<{ live: boolean; setLive: (live: boolean) => void }>((set) => ({
  live: initial(),
  setLive: (live) => {
    try {
      localStorage.setItem(STORAGE_KEY, live ? 'live' : 'day')
    } catch {
      // storage unavailable — the choice still applies for this page view
    }
    set({ live })
  },
}))
