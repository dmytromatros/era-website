'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ModeSwitch } from '@/experience/ModeSwitch'
import { portalTo } from '@/experience/portal'
import { useExperience } from '@/experience/store'
import { localizeHref } from '@/lib/href'
import { ThemeSwitch } from '@/theme/ThemeSwitch'
import { StyleSwitch } from '@/world/StyleSwitch'
import { XRaySwitch } from '@/world/XRaySwitch'
import styles from './Header.module.css'

interface Props {
  siteName: string
  locale: string
  nav: { label: string; href: string }[]
}

export function Header({ siteName, locale, nav }: Props) {
  const pathname = usePathname()
  return (
    <header className={styles.header}>
      <Link href={localizeHref('/', locale)} className={styles.logo} aria-label={`${siteName} home`}>
        <span className={styles.mark} aria-hidden>
          D
        </span>
        {siteName}
      </Link>
      <nav className={styles.nav} aria-label="Main">
        {nav.map((item) => {
          const href = localizeHref(item.href, locale)
          return (
            <Link
              key={href}
              href={href}
              className={styles.link}
              aria-current={pathname === href ? 'page' : undefined}
              onClick={(e) => {
                // Inside 3D the menu goes through a portal too; on the 2D hero it is a normal link.
                const s = useExperience.getState()
                if (s.mode !== '3d' || !s.handedOver || pathname === href) return
                e.preventDefault()
                portalTo(href, { origin: { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight } })
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className={styles.tools}>
        <ModeSwitch />
        <StyleSwitch />
        <XRaySwitch />
        <ThemeSwitch />
      </div>
    </header>
  )
}
