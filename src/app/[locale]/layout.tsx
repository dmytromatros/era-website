import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { readSite } from '@/content'
import { Experience } from '@/experience/Experience'
import { Header } from '@/components/Header'
import { DEFAULT_THEME, themeBootScript, themeCss, themes } from '@/theme/tokens'
import '../globals.css'

export const dynamicParams = false

export function generateStaticParams() {
  return readSite().locales.map((locale) => ({ locale }))
}

export const metadata: Metadata = {
  title: { default: 'DFRNC', template: '%s' },
}

export const viewport: Viewport = {
  themeColor: themes[DEFAULT_THEME].ui.bg,
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params
  const site = readSite()
  if (!site.locales.includes(locale)) notFound()

  return (
    <html lang={locale} data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
      </head>
      <body>
        <Header siteName={site.name} locale={locale} nav={site.nav[locale] ?? []} />
        {/* Persistent across page navigations: the 3D world is created once. */}
        <Experience />
        {children}
      </body>
    </html>
  )
}
