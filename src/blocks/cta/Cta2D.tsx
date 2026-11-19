import Link from 'next/link'
import type { CtaBlock } from '@/content/schema'
import { LetterForm } from '@/experience/letter/LetterForm'
import { isInternal, localizeHref } from '@/lib/href'
import s from '../Section.module.css'
import type { Block2DProps } from '../types'

export function Cta2D({ block, index, locale }: Block2DProps<CtaBlock>) {
  const action = block.action
  const href = action ? localizeHref(action.href, locale) : ''
  const button = {
    className: action?.variant === 'secondary' ? `${s.ctaButton} ${s.ctaSecondary}` : s.ctaButton,
    'data-el': 'action',
    'data-kind': 'button',
  }
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
        {/* A letter to the studio (E9): the form. */}
        {block.form && <LetterForm texts={block.form} />}
        {action &&
          (isInternal(action.href) ? (
            <Link href={href} {...button}>
              {action.label}
            </Link>
          ) : (
            <a href={href} {...button}>
              {action.label}
            </a>
          ))}
      </div>
    </section>
  )
}
