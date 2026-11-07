/**
 * The list of places the camera visits, in page order: every exhibit of every module, plus
 * doors. Pure — derived from page data only, so 2D (scroll track height) and 3D agree.
 */
import { exhibitsOf } from '@/blocks/elements'
import type { ExhibitDef, Page } from '@/content/schema'

export interface Stop {
  blockIndex: number
  /** `null` for blocks with their own 3D look (doors). */
  exhibit: ExhibitDef | null
  key: boolean
}

export function pageStops(page: Page): Stop[] {
  return page.blocks.flatMap((block, blockIndex): Stop[] =>
    block.type === 'door'
      ? [{ blockIndex, exhibit: null, key: true }]
      : exhibitsOf(block).map((exhibit) => ({ blockIndex, exhibit, key: exhibit.key })),
  )
}
