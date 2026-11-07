/** Content writes internal links without a locale (`/contacts`); this adds it. External links pass through. */
export function localizeHref(href: string, locale: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href
  return href === '/' ? `/${locale}` : `/${locale}${href}`
}

export function isInternal(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//')
}
