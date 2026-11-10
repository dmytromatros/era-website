import { describe, expect, it } from 'vitest'
import { listPageSlugs, readActor, readActorsFor, readPage, readSite } from './read'
import { referenceErrors } from '@/blocks/elements'
import { pageSchema } from './schema'

describe('content folder', () => {
  const site = readSite()

  it('declares the default locale among its locales', () => {
    expect(site.locales).toContain(site.defaultLocale)
  })

  for (const locale of site.locales) {
    const slugs = listPageSlugs(locale)

    it(`${locale}: has a home page`, () => {
      expect(slugs).toContainEqual([])
    })

    for (const slug of slugs) {
      const name = `${locale}/${slug.join('/') || 'home'}`

      it(`${name}: parses and every referenced actor exists`, () => {
        const page = readPage(locale, slug)
        expect(page).not.toBeNull()
        expect(() => readActorsFor(page!)).not.toThrow()
      })

      it(`${name}: internal links point at existing pages`, () => {
        const page = readPage(locale, slug)!
        const hrefs = page.blocks.flatMap((b) => {
          if (b.type === 'door') return [b.href]
          if (b.type === 'hero') return b.actions.map((a) => a.href)
          if (b.type === 'cta') return [b.action.href]
          return []
        })
        for (const href of hrefs.filter((h) => h.startsWith('/'))) {
          const target = href.split('/').filter(Boolean)
          expect(slugs, `${href} has no page`).toContainEqual(target)
        }
      })
    }

    it(`${locale}: nav links point at existing pages`, () => {
      for (const item of site.nav[locale] ?? []) {
        expect(slugs).toContainEqual(item.href.split('/').filter(Boolean))
      }
    })
  }

  it('the coffee welcome (D3) names an existing character, for known locales only', () => {
    for (const [locale, welcome] of Object.entries(site.welcome ?? {})) {
      expect(site.locales).toContain(locale)
      expect(() => readActor(welcome.actor)).not.toThrow()
    }
  })

  it('rejects path traversal in slugs', () => {
    expect(readPage('en', ['..', 'site'])).toBeNull()
  })
})

describe('element references', () => {
  it('reports helpers on elements that do not exist', () => {
    const errors = referenceErrors({
      type: 'cta',
      heading: 'x',
      action: { label: 'x', href: '/', variant: 'primary' },
      helpers: [{ target: 'nope', actor: 'leo', pose: 'waving', lines: ['hi'] }],
    })
    expect(errors.join()).toMatch(/helper target "nope"/)
  })

  it('reports elements left out of a custom exhibit split', () => {
    const errors = referenceErrors({
      type: 'cards',
      heading: 'x',
      items: [{ title: 'a', text: 'b' }],
      helpers: [],
      exhibits: [{ elements: ['heading'], key: true }],
    })
    expect(errors.join()).toMatch(/"card-0" is in no exhibit/)
  })
})

describe('page schema', () => {
  it('requires the hero to come first', () => {
    const result = pageSchema.safeParse({
      title: 'x',
      blocks: [{ type: 'door', label: 'x', href: '/' }],
    })
    expect(result.success).toBe(false)
  })
})
