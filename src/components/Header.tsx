'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ModeSwitch } from '@/experience/ModeSwitch'
import { localizeHref } from '@/lib/href'
import { ThemeSwitch } from '@/theme/ThemeSwitch'
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
            <Link key={href} href={href} className={styles.link} aria-current={pathname === href ? 'page' : undefined}>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className={styles.tools}>
        <ModeSwitch />
        <ThemeSwitch />
      </div>
    </header>
  )
}
