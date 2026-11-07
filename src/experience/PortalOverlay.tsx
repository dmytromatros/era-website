'use client'

import type { CSSProperties } from 'react'
import { useExperience } from './store'
import styles from './PortalOverlay.module.css'

/**
 * The portal cover: rings in the accent colour that grow from the door over the whole screen,
 * hold while the next page loads, then fade as the visitor steps out. It lives in the layout,
 * so it survives the route change underneath it.
 */
export function PortalOverlay() {
  const portal = useExperience((s) => s.portal)
  const style = {
    '--ox': `${portal.origin.x * 100}%`,
    '--oy': `${portal.origin.y * 100}%`,
  } as CSSProperties
  return <div className={styles.cover} data-phase={portal.phase} style={style} aria-hidden />
}
