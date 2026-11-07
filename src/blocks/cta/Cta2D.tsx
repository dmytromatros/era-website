import Link from 'next/link'
import type { CtaBlock } from '@/content/schema'
import { isInternal, localizeHref } from '@/lib/href'
import { HelperNotes } from '../HelperNotes'
import s from '../Section.module.css'
import type { Block2DProps } from '../types'

export function Cta2D({ block, index, locale, actors }: Block2DProps<CtaBlock>) {
  const href = localizeHref(block.action.href, locale)
  const button = { className: s.ctaButton, 'data-el': 'action', 'data-kind': 'button' }
  return (
    <section className={s.section} data-block={index}>
      <div className={s.cta}>
        <h2 className={s.ctaHeading} data-el="heading" data-kind="text">
          {block.heading}
        </h2>
        {block.text && (
          <p className={s.ctaText} data-el="text" data-kind="text">
            {block.text}
          </p>
        )}
        {isInternal(block.action.href) ? (
          <Link href={href} {...button}>
            {block.action.label}
          </Link>
        ) : (
          <a href={href} {...button}>
            {block.action.label}
          </a>
        )}
      </div>
      <HelperNotes helpers={block.helpers} actors={actors} />
    </section>
  )
}
