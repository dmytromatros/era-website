import type { StepsBlock } from '@/content/schema'
import s from '../Section.module.css'
import type { Block2DProps } from '../types'
import { WidgetCanvas } from '../widgets/WidgetCanvas'
import st from './Steps.module.css'

/** Step number as on dfrnc: 01, 02, … — derived from the order, not written in content. */
const stepNumber = (i: number) => String(i + 1).padStart(2, '0')

export function Steps2D({ block, index }: Block2DProps<StepsBlock>) {
  return (
    <section className={s.section} data-block={index}>
      <h2 className={s.heading} data-el="heading" data-kind="text">
        {block.heading}
      </h2>
      <ol className={st.grid}>
        {block.items.map((item, i) => (
          <li key={i} className={st.card} data-el={`step-${i}`} data-kind="card">
            <p className={st.number} data-part aria-hidden>
              {stepNumber(i)}
            </p>
            <h3 className={st.title} data-part>
              {item.title}
            </h3>
            <p className={st.text} data-part>
              {item.text}
            </p>
            {item.widget && <WidgetCanvas name={item.widget} />}
          </li>
        ))}
      </ol>
    </section>
  )
}
