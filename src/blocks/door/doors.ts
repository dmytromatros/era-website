/**
 * Which doors the portal hall at the end of a page gets: the module's own door first (the
 * "next" page, in the middle), then one door for every other page in the site navigation —
 * so the visitor can jump anywhere, not only to the next office. Pure — unit-tested.
 */
export interface PortalDoor {
  label: string
  /** Locale-less href, like content and nav. */
  href: string
  /** The module's own door: centred and highlighted. */
  primary: boolean
}

const norm = (href: string) => (href === '/' ? '/' : href.replace(/\/+$/, ''))

export function portalDoors(
  door: { label: string; href: string },
  nav: { label: string; href: string }[],
  currentHref: string,
): PortalDoor[] {
  const here = norm(currentHref)
  const seen = new Set([here])
  const out: PortalDoor[] = []
  if (!seen.has(norm(door.href))) {
    out.push({ label: door.label, href: door.href, primary: true })
    seen.add(norm(door.href))
  }
  for (const item of nav) {
    if (seen.has(norm(item.href))) continue
    seen.add(norm(item.href))
    out.push({ label: item.label, href: item.href, primary: false })
  }
  return out
}

/** Spacing between door centres in the hall (metres). */
export const DOOR_SPACING = 2.9

/**
 * Local x of each door: the primary in the middle, the others alternating right / left — and
 * the whole row centred on the hall, which the camera frames. With an even count the primary
 * sits just left of centre (two doors: −1.45 / +1.45). Before, the primary was pinned to 0 and
 * the pair stood 1.45 m right of the frame, the right door cut by the screen edge.
 */
export function doorOffsets(count: number): number[] {
  const raw = Array.from({ length: count }, (_, i) => {
    if (i === 0) return 0
    const slot = Math.ceil(i / 2)
    return (i % 2 === 1 ? 1 : -1) * slot * DOOR_SPACING
  })
  const mid = count ? (Math.min(...raw) + Math.max(...raw)) / 2 : 0
  return raw.map((x) => x - mid)
}

/** Locale-less href of the current page from its scene key (`en/` → `/`, `en/contacts` → `/contacts`). */
export function hrefOfSceneKey(key: string): string {
  const rest = key.split('/').slice(1).join('/')
  return `/${rest}`
}
