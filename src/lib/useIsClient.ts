import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/** `false` during SSR and hydration, `true` afterwards — hydration-safe. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
