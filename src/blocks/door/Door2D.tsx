import Link from 'next/link'
import type { DoorBlock } from '@/content/schema'
import { isInternal, localizeHref } from '@/lib/href'
import type { Block2DProps } from '../types'
import styles from './Door2D.module.css'

export function Door2D({ block, locale }: Block2DProps<DoorBlock>) {
  const href = localizeHref(block.href, locale)
  const content = (
    <>
      <span className={styles.kicker}>Next room</span>
      <span className={styles.label}>{block.label} →</span>
    </>
  )
  return isInternal(block.href) ? (
    <Link href={href} className={styles.door}>
      {content}
    </Link>
  ) : (
    <a href={href} className={styles.door}>
      {content}
    </a>
  )
}
