/**
 * Reads and validates everything in /content. Pure Node (fs + yaml + zod), no Next.js imports,
 * so the same code runs at build time and in tests. App code imports it through
 * `@/content` (which adds the `server-only` guard).
 */
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import type { z } from 'zod'
import { referenceErrors } from '@/blocks/elements'
import { actorSchema, pageSchema, siteSchema, type ActorDef, type Page, type Site } from './schema'

export const CONTENT_DIR = path.join(process.cwd(), 'content')
const HOME_SLUG = 'home'

export class ContentError extends Error {
  constructor(file: string, detail: string) {
    super(`Content error in ${path.relative(process.cwd(), file)}:\n${detail}`)
    this.name = 'ContentError'
  }
}

function readYaml<S extends z.ZodType>(file: string, schema: S): z.infer<S> {
  let raw: unknown
  try {
    raw = parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new ContentError(file, (err as Error).message)
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new ContentError(file, detail)
  }
  return result.data
}

function listYaml(dir: string, prefix: string[] = []): string[][] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return listYaml(path.join(dir, entry.name), [...prefix, entry.name])
    if (entry.isFile() && /\.ya?ml$/.test(entry.name)) {
      return [[...prefix, entry.name.replace(/\.ya?ml$/, '')]]
    }
    return []
  })
}

/* ------------------------------------------------------------------ */

let siteCache: Site | undefined
export function readSite(): Site {
  siteCache ??= readYaml(path.join(CONTENT_DIR, 'site.yaml'), siteSchema)
  return siteCache
}

/** Route slug segments for every page of a locale. Home is `[]`. */
export function listPageSlugs(locale: string): string[][] {
  return listYaml(path.join(CONTENT_DIR, 'pages', locale)).map((segments) =>
    segments.length === 1 && segments[0] === HOME_SLUG ? [] : segments,
  )
}

export function pageFile(locale: string, slug: string[]): string {
  const segments = slug.length === 0 ? [HOME_SLUG] : slug
  return path.join(CONTENT_DIR, 'pages', locale, ...segments) + '.yaml'
}

export function readPage(locale: string, slug: string[]): Page | null {
  // Reject anything that could walk out of the content folder.
  if (slug.some((s) => !/^[a-z0-9-]+$/.test(s))) return null
  const file = pageFile(locale, slug)
  if (!fs.existsSync(file)) return null
  const page = readYaml(file, pageSchema)
  const errors = page.blocks.flatMap((b, i) => referenceErrors(b).map((e) => `  • blocks.${i}: ${e}`))
  if (errors.length) throw new ContentError(file, errors.join('\n'))
  return page
}

export function readActor(id: string): ActorDef {
  const file = path.join(CONTENT_DIR, 'actors', `${id}.yaml`)
  if (!/^[a-z0-9-]+$/.test(id) || !fs.existsSync(file)) {
    throw new ContentError(file, `  • actor "${id}" does not exist (expected content/actors/${id}.yaml)`)
  }
  return { id, ...readYaml(file, actorSchema) }
}

/** Every actor a page refers to, keyed by id. Throws if a page references a missing actor. */
export function readActorsFor(page: Page): Record<string, ActorDef> {
  const ids = new Set(page.blocks.flatMap((b) => ('helpers' in b ? b.helpers.map((h) => h.actor) : [])))
  return Object.fromEntries([...ids].map((id) => [id, readActor(id)]))
}
