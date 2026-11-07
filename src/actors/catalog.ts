/**
 * Names that content files may reference. Kept in a plain module (no React / three imports)
 * so the content schema can validate YAML against them on the server and in tests.
 *
 * To add a new activity or accessory:
 *   1. add its name here,
 *   2. implement it in `src/actors/activities.tsx` or `src/actors/accessories.tsx`,
 *   3. register it in the matching registry.
 * TypeScript will refuse to compile until steps 2–3 cover every name listed here.
 */
export const ACTIVITIES = [
  'idle',
  'typing',
  'drawing',
  'rotating-cube',
  'juggling',
  'presenting',
  'waving',
  'holding',
  'pointing',
] as const
export type ActivityName = (typeof ACTIVITIES)[number]

export const ACCESSORIES = ['headphones', 'cap', 'glasses', 'beret', 'antenna'] as const
export type AccessoryName = (typeof ACCESSORIES)[number]
