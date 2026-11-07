'use client'

import { useEffect, useState } from 'react'
import styles from './Helper.module.css'

const CHARS_PER_SECOND = 45

/** Types the character's lines out letter by letter. Remount to restart. */
export function SpeechBubble({ name, lines, onDone }: { name: string; lines: string[]; onDone: () => void }) {
  const total = lines.reduce((n, l) => n + l.length, 0)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const started = performance.now()
    const id = window.setInterval(() => {
      const n = Math.min(total, Math.floor(((performance.now() - started) / 1000) * CHARS_PER_SECOND))
      setShown(n)
      if (n >= total) {
        window.clearInterval(id)
        onDone()
      }
    }, 30)
    return () => window.clearInterval(id)
  }, [total, onDone])

  let budget = shown
  return (
    <div className={styles.bubble}>
      <strong className={styles.name}>{name}</strong>
      {lines.map((line, i) => {
        const visible = line.slice(0, Math.max(0, budget))
        budget -= line.length
        return (
          <p key={i} className={styles.line}>
            {visible}
            {/* keeps the final size from the start, so the bubble does not grow while typing */}
            <span className={styles.ghost}>{line.slice(visible.length)}</span>
          </p>
        )
      })}
    </div>
  )
}
