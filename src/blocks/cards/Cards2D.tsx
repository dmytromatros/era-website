import type { CardsBlock } from '@/content/schema'
import s from '../Section.module.css'
import type { Block2DProps } from '../types'

export function Cards2D({ block, index }: Block2DProps<CardsBlock>) {
  return (
    <section className={s.section} data-block={index}>
      <h2 className={s.heading} data-el="heading" data-kind="text">
        {block.heading}
      </h2>
      <ul className={s.grid}>
        {block.items.map((item, i) => (
          <li key={i} className={s.card} data-el={`card-${i}`} data-kind="card">
            <h3 className={s.cardTitle} data-part>
              {item.title}
            </h3>
            <p className={s.cardText} data-part>
              {item.text}
            </p>
            {item.tag && (
              <p className={s.cardTag} data-part>
                {item.tag}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
