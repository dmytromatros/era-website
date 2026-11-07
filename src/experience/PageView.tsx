'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, type ComponentType } from 'react'
import { registry2d } from '@/blocks/registry2d'
import type { Block2DProps } from '@/blocks/types'
import type { Block } from '@/content/schema'
import { useThemeStore } from '@/theme/store'
import { pageStops } from '@/world/stops'
import { scrollToUnits, totalUnits } from '@/world/timeline'
import { measurePage } from './measure'
import { live, useExperience, type SceneData } from './store'
import styles from './PageView.module.css'

function Block2D(props: Block2DProps<Block>) {
  // The registry is keyed by block type; the cast is safe because `type` picks the entry.
  const Component = registry2d[props.block.type] as ComponentType<Block2DProps<Block>>
  return <Component {...props} />
}

/**
 * Renders the page as normal HTML (always — that is what search engines, screen readers and
 * the 2D fallback see) and hands the same data to the persistent 3D canvas. In 3D mode the
 * modules below the hero are laid out invisibly, so the canvas can measure and rebuild them.
 */
export function PageView({ scene }: { scene: SceneData }) {
  const router = useRouter()
  const mode = useExperience((s) => s.mode)
  const theme = useThemeStore((s) => s.name)
  const main = useRef<HTMLElement>(null)
  const [hero, ...rest] = scene.page.blocks
  const stops = useMemo(() => pageStops(scene.page), [scene.page])

  useEffect(() => {
    useExperience.getState().setScene(scene)
  }, [scene])

  useEffect(() => {
    useExperience.getState().setNavigate((href) => router.push(href))
  }, [router])

  // Measure every element of the page (re-measure on resize, font load and theme change).
  useEffect(() => {
    const root = main.current
    if (mode !== '3d' || !root) return
    let frame = 0
    const run = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => useExperience.getState().setElements(scene.key, measurePage(root)))
    }
    run()
    void document.fonts.ready.then(run)
    window.addEventListener('resize', run)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', run)
    }
  }, [mode, scene.key, theme])

  // Scroll drives the camera (written to `live`, not React state) and the 2D → 3D handover.
  useEffect(() => {
    if (mode !== '3d') return
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      live.scroll = scrollToUnits(window.scrollY, max, stops)
      live.scrollPx = window.scrollY
      // The 2D → 3D handover itself is decided inside the canvas frame (world/Driver.tsx).
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [mode, stops, scene.key])

  const props = { locale: scene.locale, actors: scene.actors }
  return (
    <main ref={main} className={styles.main}>
      {hero && <Block2D block={hero} index={0} {...props} />}
      <div className={styles.blocks}>
        {rest.map((block, i) => (
          <Block2D key={i} block={block} index={i + 1} {...props} />
        ))}
      </div>
      {/* In 3D mode the document is just a scroll track; the canvas shows the content. */}
      <div className={styles.track} style={{ height: `${(totalUnits(stops) + 1) * 100}vh` }} aria-hidden />
    </main>
  )
}
