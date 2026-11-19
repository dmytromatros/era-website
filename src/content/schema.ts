import { z } from 'zod'
import { ACCESSORIES, ACTIVITIES, REACTIONS } from '@/actors/catalog'
import { WIDGETS } from '@/blocks/widgets/catalog'
import { PIXEL_CHARSET, PIXEL_TEXT } from './pixelCharset'

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
  /**
   * E4, for the one holding the hero heading up: what they mutter after putting back a letter the
   * visitor knocked off it (one at a time, in turn). Absent = the letters cannot be knocked off.
   */
  grumbles: z.array(z.string().min(1)).min(1).max(8).optional(),
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
  /**
   * The photo mode (E7): how they pose for the visitor's camera (one of the photo poses: thumbs,
   * peace, flex — any move works). Default: one of those by the character's id.
   */
  pose: reactionSchema.optional(),
})

export type ActorDef = z.infer<typeof actorSchema> & { id: string }

/* ------------------------------------------------------------------ */
/* Site                                                                */
/* ------------------------------------------------------------------ */

/** The coffee welcome (wow-plan D3): who walks up, what they say, the two buttons. */
export const welcomeSchema = z.object({
  /** Id of a file in content/actors/. */
  actor: z.string().min(1),
  lines: z.array(z.string().min(1)).min(1).max(3),
  take: z.string().min(1).max(24),
  decline: z.string().min(1).max(24),
  /** Said after taking the coffee / after a no (or scrolling on). */
  thanks: z.string().min(1),
  shrug: z.string().min(1),
})

export type Welcome = z.infer<typeof welcomeSchema>

export const cutsceneSchema = z.object({
  hint: z.string().min(1).max(40),
  hintTouch: z.string().min(1).max(40),
})

export type CutsceneTexts = z.infer<typeof cutsceneSchema>

/** A line on the arcade's screen (E3): only what the pixel font draws, and it must fit. */
const pixelLine = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(PIXEL_TEXT, `arcade screen texts: only ${PIXEL_CHARSET.trim()} and spaces (the pixel font)`)

/**
 * The arcade machine (wow-plan E3): what its screen says — the attract screen while nobody plays,
 * and the game slot (for now "coming soon") once the visitor flies into it — and the button that
 * brings them back. Screen texts are pixel-font lines (upper case); a line holds at most 30.
 */
export const arcadeSchema = z.object({
  title: pixelLine(7),
  subtitle: pixelLine(15),
  insertCoin: pixelLine(15),
  hiScore: pixelLine(10),
  gameOver: pixelLine(10),
  comeCloser: pixelLine(15),
  game: z.object({
    coinHint: pixelLine(30),
    coinHintTouch: pixelLine(30),
    credit: pixelLine(12),
    loading: pixelLine(12),
    stuck: pixelLine(30),
    again: pixelLine(30),
    soon: pixelLine(15),
    soonNote: pixelLine(30),
    scoresTitle: pixelLine(15),
    exitHint: pixelLine(30),
    exitHintTouch: pixelLine(30),
  }),
  scores: z
    .array(z.object({ name: pixelLine(8), score: z.number().int().min(0).max(999999), note: pixelLine(30) }))
    .min(1)
    .max(4),
  /** The button (HTML, any text) that flies the visitor back out. */
  back: z.string().min(1).max(30),
})

export type ArcadeTexts = z.infer<typeof arcadeSchema>

/**
 * The monitor that shows the 2D landing (wow-plan E5): its screen is a picture of the page itself,
 * so the only text of its own is what it says when the visitor clicks it from too far away.
 */
export const monitorSchema = z.object({
  comeCloser: z.string().min(1).max(24),
})

export type MonitorTexts = z.infer<typeof monitorSchema>

/**
 * The photo mode (wow-plan E7): the header button, what the polaroid says under the picture and
 * its buttons. Absent = no photo button.
 */
export const photoSchema = z.object({
  /** The header button. */
  button: z.string().min(1).max(14),
  /** Big on the screen as the shutter clicks. */
  cheese: z.string().min(1).max(16),
  /** Under the picture on the polaroid (drawn into the PNG). */
  caption: z.string().min(1).max(40),
  save: z.string().min(1).max(14),
  /** The same button on a phone: it opens the system share sheet. */
  share: z.string().min(1).max(14),
  close: z.string().min(1).max(14),
})

export type PhotoTexts = z.infer<typeof photoSchema>

export const siteSchema = z.object({
  name: z.string().min(1),
  defaultLocale: z.string().min(2),
  locales: z.array(z.string().min(2)).min(1),
  /** Navigation per locale. `href` is locale-less, `/` is the home page. */
  nav: z.record(z.string(), z.array(z.object({ label: z.string().min(1), href }))),
  /** Per locale; absent = no coffee welcome. */
  welcome: z.record(z.string(), welcomeSchema).optional(),
  /** Per locale: the hint shown when the entrance cutscene gives the scroll back. */
  cutscene: z.record(z.string(), cutsceneSchema).optional(),
  /** Per locale: the arcade machine's texts (E3); absent = the screen stays dark, no flying in. */
  arcade: z.record(z.string(), arcadeSchema).optional(),
  /** Per locale: the monitor's texts (E5); absent = no monitor in the office. */
  monitor: z.record(z.string(), monitorSchema).optional(),
  /** Per locale: the photo mode's texts (E7); absent = no photo button. */
  photo: z.record(z.string(), photoSchema).optional(),
})

export type Site = z.infer<typeof siteSchema>
