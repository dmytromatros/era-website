'use client'

import { useEffect, useState } from 'react'
import { useExperience } from '@/experience/store'
import { metrics } from './Metrics'
import { physicsStats } from './physics/Physics'
import { useXRay, xrayStats } from './xrayState'
import styles from './XRayPanel.module.css'

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

/** Physics (C2) in a worker: idle until something can move, so "0 moving" is the usual answer. */
function physicsLine(): string {
  const p = physicsStats
  if (p.state === 'off') return 'not loaded (no props near)'
  if (p.state === 'loading') return 'loading in a worker…'
  return p.awake ? `${p.awake} of ${p.bodies} moving · ${p.ms.toFixed(1)} ms in worker` : `${p.bodies} bodies · all asleep, worker idle`
}

/**
 * The X-ray mode's live numbers (B4): what a frame costs right now (Metrics.tsx) and what
 * instancing saves (xrayStats from XRay.tsx). The visitor-facing sibling of `?debug=1`.
 */
export function XRayPanel() {
  const on = useXRay((s) => s.on)
  const mode = useExperience((s) => s.mode)
  const [rows, setRows] = useState<[string, string][]>([])

  useEffect(() => {
    if (!on) return
    const read = () => {
      const m = metrics
      const s = xrayStats
      setRows([
        ['fps', m.fps.toFixed(0)],
        ['draw calls', String(m.calls)],
        ['triangles', k(s.triangles)],
        ['programs', String(m.programs)],
        ['geo · tex', `${m.geometries} · ${m.textures}`],
        ['quality', m.level],
        ['instanced', `${s.instancedMeshes} calls → ${k(s.instances)} objects`],
        ['physics', physicsLine()],
      ])
    }
    read()
    const id = setInterval(read, 500)
    return () => clearInterval(id)
  }, [on])

  if (!on || mode !== '3d') return null
  return (
    <aside className={styles.panel} aria-live="off" aria-label="X-ray frame metrics">
      <p className={styles.title}>X-ray</p>
      <p className={styles.legend}>One colour = one draw call</p>
      <dl className={styles.rows}>
        {rows.map(([label, value]) => (
          <div key={label} className={label === 'instanced' || label === 'physics' ? `${styles.row} ${styles.wide}` : styles.row}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
