import type { CSSProperties } from 'react'
import type { ActorDef, Helper } from '@/content/schema'
import styles from './HelperNotes.module.css'

/**
 * 2D form of the characters' extra info: small notes under the module. In 3D the same lines
 * are spoken by the character standing next to its element. Hidden in 3D mode.
 */
export function HelperNotes({ helpers, actors }: { helpers: Helper[]; actors: Record<string, ActorDef> }) {
  if (!helpers.length) return null
  return (
    <div className={styles.notes} data-helper-notes>
      {helpers.map((h, i) => {
        const actor = actors[h.actor]
        if (!actor) return null
        return (
          <aside key={i} className={styles.note}>
            <span
              className={styles.face}
              aria-hidden
              style={{ '--skin': actor.palette.skin, '--hair': actor.palette.hair ?? actor.palette.shirt } as CSSProperties}
            />
            <div>
              <strong className={styles.who}>
                {actor.name} · {actor.role}
              </strong>
              {h.lines.map((line, j) => (
                <p key={j} className={styles.line}>
                  {line}
                </p>
              ))}
            </div>
          </aside>
        )
      })}
    </div>
  )
}
