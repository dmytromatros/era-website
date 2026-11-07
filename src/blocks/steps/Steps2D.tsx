import type { StepsBlock } from '@/content/schema'
import { HelperNotes } from '../HelperNotes'
import s from '../Section.module.css'
import type { Block2DProps } from '../types'

export function Steps2D({ block, index, actors }: Block2DProps<StepsBlock>) {
  return (
    <section className={s.section} data-block={index}>
      <h2 className={s.heading} data-el="heading" data-kind="text">
        {block.heading}
      </h2>
      <ol className={s.grid}>
        {block.items.map((item, i) => (
          <li key={i} className={s.card} data-el={`step-${i}`} data-kind="card">
            <h3 className={s.cardTitle} data-part>
              {item.title}
            </h3>
            <p className={s.cardText} data-part>
              {item.text}
            </p>
          </li>
        ))}
      </ol>
      <HelperNotes helpers={block.helpers} actors={actors} />
    </section>
  )
}
