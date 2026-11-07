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
  return (
    <PageView
      scene={{
        key: `${locale}/${slug.join('/')}`,
        locale,
        page,
        actors: readActorsFor(page),
        nav: readSite().nav[locale] ?? [],
      }}
    />
  )
}
