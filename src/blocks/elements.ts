/**
 * Which elements every module type has (their ids match `data-el` in the 2D view) and how
 * they group into 3D exhibits by default. Pure — used by content validation, tests and 3D.
 *
 * New module type: add a case to both functions.
 */
import type { Block, ExhibitDef } from '@/content/schema'

const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`)

export function elementIds(block: Block): string[] {
  switch (block.type) {
    case 'hero':
      return [
        ...(block.eyebrow ? ['eyebrow'] : []),
        'heading',
        ...(block.lead ? ['lead'] : []),
        ...range('action', block.actions.length),
        ...range('tag', block.tags.length),
      ]
    case 'cards':
      return ['heading', ...range('card', block.items.length)]
    case 'steps':
      return ['heading', ...range('step', block.items.length)]
    case 'cta':
      return ['heading', ...(block.text ? ['text'] : []), 'action']
    case 'door':
      return []
  }
}

function defaultExhibits(block: Block): ExhibitDef[] {
  switch (block.type) {
    case 'hero': {
      const exhibits: ExhibitDef[] = [
        { elements: [...(block.eyebrow ? ['eyebrow'] : []), 'heading'], key: true },
      ]
      const middle = [...(block.lead ? ['lead'] : []), ...range('action', block.actions.length)]
      if (middle.length) exhibits.push({ elements: middle, key: true })
      if (block.tags.length) exhibits.push({ elements: range('tag', block.tags.length), key: false })
      return exhibits
    }
    case 'cards':
      return [
        { elements: ['heading'], key: false },
        ...range('card', block.items.length).map((id) => ({ elements: [id], key: true })),
      ]
    case 'steps':
      return [
        { elements: ['heading'], key: false },
        ...range('step', block.items.length).map((id) => ({ elements: [id], key: true })),
      ]
    case 'cta':
      return [{ elements: elementIds(block), key: true }]
    case 'door':
      return []
  }
}

/** Exhibits of a module: the content's own split if given, otherwise the defaults. */
export function exhibitsOf(block: Block): ExhibitDef[] {
  if (block.type !== 'door' && block.exhibits?.length) return block.exhibits
  return defaultExhibits(block)
}

/** Problems with element references in a module (unknown ids, helpers on missing elements). */
export function referenceErrors(block: Block): string[] {
  if (block.type === 'door') return []
  const known = new Set(elementIds(block))
  const errors: string[] = []
  for (const ex of block.exhibits ?? []) {
    for (const id of ex.elements) if (!known.has(id)) errors.push(`exhibit element "${id}" does not exist`)
  }
  for (const h of block.helpers) {
    if (!known.has(h.target)) errors.push(`helper target "${h.target}" does not exist`)
  }
  const placed = new Set(exhibitsOf(block).flatMap((e) => e.elements))
  for (const id of known) if (!placed.has(id)) errors.push(`element "${id}" is in no exhibit`)
  return errors.map((e) => `${e} (in ${block.type}; known: ${[...known].join(', ')})`)
}
