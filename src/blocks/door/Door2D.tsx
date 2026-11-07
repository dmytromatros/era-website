import Link from 'next/link'
import type { DoorBlock } from '@/content/schema'
import { isInternal, localizeHref } from '@/lib/href'
import s from '../Section.module.css'
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
  return (
    // In the page column like every other module, not edge to edge.
    <div className={`${s.section} ${styles.wrap}`}>
      {isInternal(block.href) ? (
        <Link href={href} className={styles.door}>
          {content}
        </Link>
      ) : (
        <a href={href} className={styles.door}>
          {content}
        </a>
      )}
    </div>
  )
}
