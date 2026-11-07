import Link from 'next/link'
import type { HeroBlock } from '@/content/schema'
import { isInternal, localizeHref } from '@/lib/href'
import { HelperNotes } from '../HelperNotes'
import type { Block2DProps } from '../types'
import styles from './Hero.module.css'

export function Hero2D({ block, index, locale, actors }: Block2DProps<HeroBlock>) {
  return (
    <section className={styles.hero} data-hero data-block={index}>
      <div className={styles.inner}>
        {block.eyebrow && (
          <p className={styles.eyebrow} data-el="eyebrow" data-kind="text">
            {block.eyebrow}
          </p>
        )}
        <h1 className={styles.heading} data-el="heading" data-kind="text">
          {block.heading.map((line, i) => (
            <span key={i} className={styles.line}>
              {line}
            </span>
          ))}
        </h1>
        {block.lead && (
          <p className={styles.lead} data-el="lead" data-kind="text">
            {block.lead}
          </p>
        )}
        {block.actions.length > 0 && (
          <div className={styles.actions}>
            {block.actions.map((action, i) => {
              const href = localizeHref(action.href, locale)
              const props = {
                className: action.variant === 'primary' ? styles.primary : styles.secondary,
                'data-el': `action-${i}`,
                'data-kind': 'button',
              }
              return isInternal(action.href) ? (
                <Link key={href} href={href} {...props}>
                  {action.label}
                </Link>
              ) : (
                <a key={href} href={href} {...props}>
                  {action.label}
                </a>
              )
            })}
          </div>
        )}
        {block.tags.length > 0 && (
          <ul className={styles.tags} aria-label="What we do">
            {block.tags.map((tag, i) => (
              <li key={tag} className={styles.tag} data-el={`tag-${i}`} data-kind="button">
                {tag}
              </li>
            ))}
          </ul>
        )}
        <HelperNotes helpers={block.helpers} actors={actors} />
      </div>
      <p className={styles.scrollHint} aria-hidden>
        Scroll to enter
      </p>
    </section>
  )
}
