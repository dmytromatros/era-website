import { z } from 'zod'
import { ACCESSORIES, ACTIVITIES, REACTIONS } from '@/actors/catalog'
import { WIDGETS } from '@/blocks/widgets/catalog'

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a #rrggbb colour')

/** Internal links are written without the locale (`/who-we-are`); the app prefixes it. */
const href = z.string().min(1)

export const actionSchema = z.object({
  label: z.string().min(1),
  href,
  variant: z.enum(['primary', 'secondary']).default('primary'),
})

/**
 * A character working next to one element of a module. Secondary content: it adds extra
 * info when the visitor flies up to that element (in 2D it is a small note).
 */
export const helperSchema = z.object({
  /** Element id inside the module, e.g. `heading`, `action-0`, `card-2` (see src/blocks/elements.ts). */
  target: z.string().min(1),
  /** Id of a file in content/actors/. */
  actor: z.string().min(1),
  /** What the character does next to the element. */
  pose: z.enum(ACTIVITIES),
  lines: z.array(z.string().min(1)).min(1),
})

/**
 * How a module is split into exhibits in 3D. Each exhibit is a group of elements that stand
 * together. `key` exhibits are where the camera stops; others it just flies past.
 * Optional — every module type has sensible defaults.
 */
export const exhibitSchema = z.object({
  elements: z.array(z.string().min(1)).min(1),
  key: z.boolean().default(true),
})

/**
 * How the route treats a module in 3D. Optional — every module type has defaults
 * (src/world/route.ts): cards/steps are corridors, a turn before each corridor, stairs up
 * before a CTA.
 */
export const routeSchema = z
  .object({
    /** `corridor` = walls on both sides; `open` = no walls. */
    shape: z.enum(['open', 'corridor']).optional(),
    /** What happens on the way INTO this module. */
    before: z.enum(['straight', 'left', 'right', 'stairs-up', 'stairs-down']).optional(),
  })
  .optional()

const stage = {
  helpers: z.array(helperSchema).default([]),
  exhibits: z.array(exhibitSchema).optional(),
  route: routeSchema,
}

/* ------------------------------------------------------------------ */
/* Modules (blocks). Each type: schema here + 2D view in src/blocks/   */
/* + element ids / default exhibits in src/blocks/elements.ts.         */
/* The 3D view is generic — built from the measured 2D elements.       */
/* ------------------------------------------------------------------ */

export const heroBlockSchema = z.object({
  type: z.literal('hero'),
  eyebrow: z.string().optional(),
  /** Each entry is one line of the headline. */
  heading: z.array(z.string().min(1)).min(1),
  lead: z.string().optional(),
  actions: z.array(actionSchema).default([]),
  tags: z.array(z.string().min(1)).default([]),
  ...stage,
})

export const cardsBlockSchema = z.object({
  type: z.literal('cards'),
  heading: z.string().min(1),
  items: z
    .array(z.object({ title: z.string().min(1), text: z.string().min(1), tag: z.string().optional() }))
    .min(1),
  ...stage,
})

export const stepsBlockSchema = z.object({
  type: z.literal('steps'),
  heading: z.string().min(1),
  items: z
    .array(
      z.object({
        title: z.string().min(1),
        text: z.string().min(1),
        /** Optional live widget (canvas animation) under the text — src/blocks/widgets. */
        widget: z.enum(WIDGETS).optional(),
      }),
    )
    .min(1),
  ...stage,
})

export const ctaBlockSchema = z.object({
  type: z.literal('cta'),
  heading: z.string().min(1),
  text: z.string().optional(),
  action: actionSchema,
  ...stage,
})

/** A doorway to another page. Has its own 3D look (not built from 2D elements). */
export const doorBlockSchema = z.object({
  type: z.literal('door'),
  label: z.string().min(1),
  href,
  route: routeSchema,
})

export const blockSchema = z.discriminatedUnion('type', [
  heroBlockSchema,
  cardsBlockSchema,
  stepsBlockSchema,
  ctaBlockSchema,
  doorBlockSchema,
])

export type HeroBlock = z.infer<typeof heroBlockSchema>
export type CardsBlock = z.infer<typeof cardsBlockSchema>
export type StepsBlock = z.infer<typeof stepsBlockSchema>
export type CtaBlock = z.infer<typeof ctaBlockSchema>
export type DoorBlock = z.infer<typeof doorBlockSchema>
export type Block = z.infer<typeof blockSchema>
export type BlockType = Block['type']
export type Helper = z.infer<typeof helperSchema>
export type ExhibitDef = z.infer<typeof exhibitSchema>
export type RouteHint = z.infer<typeof routeSchema>

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

export const pageSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    /** Optional look of this page's office (defaults derive from the page, see world/officeStyle.ts). */
    office: z
      .object({
        /** Different number = different furniture arrangement. */
        seed: z.number().int().optional(),
        /** Light accent for this office (chairs, dividers). */
        accent: hexColor.optional(),
      })
      .optional(),
    blocks: z.array(blockSchema).min(1),
  })
  .refine((page) => page.blocks[0]?.type === 'hero', {
    message: 'the first block of a page must be a hero (it is the 2D entrance)',
    path: ['blocks', 0],
  })
  .refine((page) => page.blocks.filter((b) => b.type === 'hero').length === 1, {
    message: 'a page has exactly one hero block',
    path: ['blocks'],
  })

export type Page = z.infer<typeof pageSchema>

/* ------------------------------------------------------------------ */
/* Actors (characters living inside the site)                          */
/* ------------------------------------------------------------------ */

const reactionSchema = z.object({
  move: z.enum(REACTIONS),
  /** One emoji (a few code points: skin tones and joined emoji are fine). */
  emoji: z.string().min(1).max(16),
})

export const actorSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  palette: z.object({
    skin: hexColor,
    shirt: hexColor,
    pants: hexColor,
    accent: hexColor,
    hair: hexColor.optional(),
  }),
  accessories: z.array(z.enum(ACCESSORIES)).default([]),
  scale: z.number().positive().default(1),
  /** Click / tap reactions, played in turn. */
  reactions: z.array(reactionSchema).min(1).default([{ move: 'jump', emoji: '👋' }]),
  /** Played instead when the visitor keeps clicking. */
  annoyed: reactionSchema.default({ move: 'shrug', emoji: '😤' }),
  /** Played when a pushed ball or box hits the character (C2). */
  hit: reactionSchema.default({ move: 'surprised', emoji: '😲' }),
})

export type ActorDef = z.infer<typeof actorSchema> & { id: string }

/* ------------------------------------------------------------------ */
/* Site                                                                */
/* ------------------------------------------------------------------ */

export const siteSchema = z.object({
  name: z.string().min(1),
  defaultLocale: z.string().min(2),
  locales: z.array(z.string().min(2)).min(1),
  /** Navigation per locale. `href` is locale-less, `/` is the home page. */
  nav: z.record(z.string(), z.array(z.object({ label: z.string().min(1), href }))),
})

export type Site = z.infer<typeof siteSchema>
