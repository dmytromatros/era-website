/**
 * Each page gets its own office: same Scandinavian style, a different furniture arrangement and
 * a light accent colour — so a portal feels like walking into another wing of the same company.
 * Pure; content can pin either value (`office: { seed, accent }` on the page).
 */
const ACCENTS = ['#a9b8a3', '#b9c6d6', '#d8b9a8', '#c9b8d8', '#d6cf9f']

export function hashKey(key: string): number {
  let h = 2166136261
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

export function officeStyle(sceneKey: string, page: { office?: { seed?: number; accent?: string } }) {
  const h = hashKey(sceneKey)
  return {
    seed: page.office?.seed ?? h % 100000,
    accent: page.office?.accent ?? ACCENTS[h % ACCENTS.length]!,
  }
}
