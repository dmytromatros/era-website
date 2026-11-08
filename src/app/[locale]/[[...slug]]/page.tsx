import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { listPageSlugs, readActorsFor, readPage, readSite } from '@/content'
import { PageView } from '@/experience/PageView'

export const dynamicParams = false

export function generateStaticParams() {
  const site = readSite()
  return site.locales.flatMap((locale) =>
    listPageSlugs(locale).map((slug) => ({ locale, slug: slug.length ? slug : undefined })),
  )
}

async function load(params: PageProps<'/[locale]/[[...slug]]'>['params']) {
  const { locale, slug = [] } = await params
  const page = readPage(locale, slug)
  if (!page) notFound()
  return { locale, slug, page }
}

export async function generateMetadata({ params }: PageProps<'/[locale]/[[...slug]]'>): Promise<Metadata> {
  const { page } = await load(params)
  return { title: page.title, description: page.description }
}

export default async function Page({ params }: PageProps<'/[locale]/[[...slug]]'>) {
  const { locale, slug, page } = await load(params)
  const nav = readSite().nav[locale] ?? []
  const here = `/${slug.join('/')}`
  // The other pages' content, for the live views in the portal doors (B2).
  const previews = Object.fromEntries(
    nav.flatMap((item) => {
      if (item.href === here) return []
      const other = readPage(locale, item.href.split('/').filter(Boolean))
      return other ? [[item.href, other] as const] : []
    }),
  )
  return (
    <PageView
      scene={{
        key: `${locale}/${slug.join('/')}`,
        locale,
        page,
        actors: readActorsFor(page),
        nav,
        previews,
      }}
    />
  )
}
