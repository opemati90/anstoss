import { z } from 'zod'

/**
 * Matchday Studio contract — REVAMP_HANDOFF.md "Matchday Studio (Verein plan
 * only)". Branded social graphics filled from match data.
 *
 * Gate: `matchdayStudio` plan feature (schemas/plan.ts), PRO only.
 * Who: Vorstand, Teammanager, Kapitän, team coaches and the Medienwart
 * (`ClubOperationalRole.MEDIA_MANAGER`).
 *
 * The app renders graphics on the device from template data for preview and
 * the native share sheet; the server renders the archived PNG / MP4 from the
 * same template JSON so the output is identical on every device.
 */

// ─── Templates, styles, formats ─────────────────────────────────────────────

export const STUDIO_TEMPLATES = [
  'MATCHDAY',
  'LINEUP',
  'HALF_TIME',
  'FULL_TIME',
  'GOAL',
  'PLAYER_OF_THE_MATCH',
  'NEWS',
  'SPONSOR',
  'CLIP_OVERLAY',
] as const
export const studioTemplateSchema = z.enum(STUDIO_TEMPLATES)
export type StudioTemplate = z.infer<typeof studioTemplateSchema>

/** Three styles per club in v1, all derived from the brand kit. */
export const STUDIO_STYLES = ['FLUTLICHT', 'DERBY', 'KREIDE'] as const
export const studioStyleSchema = z.enum(STUDIO_STYLES)
export type StudioStyle = z.infer<typeof studioStyleSchema>

/** 4:5 is the default (Instagram feed); 9:16 for Story, Reels and TikTok. */
export const STUDIO_FORMATS = ['1:1', '4:5', '9:16'] as const
export const studioFormatSchema = z.enum(STUDIO_FORMATS)
export type StudioFormat = z.infer<typeof studioFormatSchema>
export const STUDIO_DEFAULT_FORMAT: StudioFormat = '4:5'
/** height / width per format. */
export const STUDIO_FORMAT_RATIO: Record<StudioFormat, number> = {
  '1:1': 1,
  '4:5': 1.25,
  '9:16': 16 / 9,
}

/** Elements every template can switch off. */
export const studioElementsSchema = z.object({
  sponsor: z.boolean(),
  handle: z.boolean(),
  competition: z.boolean(),
})
export type StudioElements = z.infer<typeof studioElementsSchema>

// ─── Brand kit ──────────────────────────────────────────────────────────────

export const STUDIO_FONT_PAIRINGS = ['CONDENSED', 'CLASSIC', 'MODERN'] as const
export const studioFontPairingSchema = z.enum(STUDIO_FONT_PAIRINGS)
export type StudioFontPairing = z.infer<typeof studioFontPairingSchema>

export const STUDIO_SOCIAL_CHANNELS = ['INSTAGRAM', 'FACEBOOK'] as const
export const studioSocialChannelSchema = z.enum(STUDIO_SOCIAL_CHANNELS)
export type StudioSocialChannel = z.infer<typeof studioSocialChannelSchema>

export const studioSponsorSchema = z.object({
  id: z.string().min(1),
  /** "Bäckerei Krause" — shown in the "Präsentiert von" block. */
  name: z.string().trim().min(1).max(60),
  /** Background-removed logo (PNG); null until one is uploaded. */
  logoUrl: z.string().url().nullable(),
})
export type StudioSponsor = z.infer<typeof studioSponsorSchema>

export const studioSocialAccountSchema = z.object({
  channel: studioSocialChannelSchema,
  connected: z.boolean(),
  /** "@svspreewiese" / page name once connected. */
  handle: z.string().nullable(),
})
export type StudioSocialAccount = z.infer<typeof studioSocialAccountSchema>

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/)

/** GET /clubs/:clubId/studio/brand-kit */
export const studioBrandKitSchema = z.object({
  clubId: z.string().min(1),
  crestUrl: z.string().url().nullable(),
  sponsors: z.array(studioSponsorSchema).max(8),
  /** Read-only here: main colour comes from club setup. */
  colors: z.object({
    primary: hexColor,
    accent: hexColor,
    dark: hexColor,
    light: hexColor,
  }),
  fontPairing: studioFontPairingSchema,
  /** "@svspreewiese" */
  handle: z.string().max(40).nullable(),
  hashtags: z.array(z.string().max(40)).max(10),
  accounts: z.array(studioSocialAccountSchema),
  /** ISO time the AI template set was generated, null before. */
  templateSetAt: z.string().nullable(),
})
export type StudioBrandKit = z.infer<typeof studioBrandKitSchema>

/** PUT /clubs/:clubId/studio/brand-kit — partial update; responds with the kit. */
export const updateStudioBrandKitSchema = z
  .object({
    fontPairing: studioFontPairingSchema,
    handle: z.string().trim().max(40).nullable(),
    hashtags: z.array(z.string().trim().min(1).max(40)).max(10),
    /** Order and names; logos go through the upload endpoint. */
    sponsors: z.array(studioSponsorSchema.pick({ id: true, name: true })).max(8),
  })
  .partial()
export type UpdateStudioBrandKitInput = z.infer<typeof updateStudioBrandKitSchema>

/**
 * POST /clubs/:clubId/studio/accounts/:channel/connect — responds with the
 * OAuth URL (Meta Graph API) the app opens in the browser.
 * DELETE …/studio/accounts/:channel disconnects.
 */
export const studioAccountConnectResponseSchema = z.object({ url: z.string().url() })
export type StudioAccountConnectResponse = z.infer<typeof studioAccountConnectResponseSchema>

// ─── AI credits ─────────────────────────────────────────────────────────────

export const STUDIO_AI_ACTIONS = ['VARIANT', 'CAPTION', 'CUTOUT', 'TEMPLATE_SET'] as const
export const studioAiActionSchema = z.enum(STUDIO_AI_ACTIONS)
export type StudioAiAction = z.infer<typeof studioAiActionSchema>

/** Templates, manual edits, rendering and posting cost nothing. */
export const STUDIO_CREDIT_COSTS: Record<StudioAiAction, number> = {
  VARIANT: 1,
  CAPTION: 1,
  CUTOUT: 2,
  TEMPLATE_SET: 20,
}

/** Included with Verein, per club and month; reset on the 1st, not carried over. */
export const STUDIO_MONTHLY_CREDITS = 100
/** Purchased credits last 12 months and are spent after the monthly allowance. */
export const STUDIO_PACK_VALID_MONTHS = 12

export const STUDIO_CREDIT_PACKS = [
  { id: 'pack-100', credits: 100, amountCents: 499, savingsPercent: 0 },
  { id: 'pack-300', credits: 300, amountCents: 1199, savingsPercent: 20 },
  { id: 'pack-1000', credits: 1000, amountCents: 2999, savingsPercent: 40 },
] as const
export const STUDIO_CREDIT_CURRENCY = 'EUR'

export const studioCreditPackSchema = z.object({
  id: z.string().min(1),
  credits: z.number().int().positive(),
  /** Gross, VAT included. One-off, never a subscription. */
  amountCents: z.number().int().positive(),
  currency: z.string().length(3),
  savingsPercent: z.number().int().min(0).max(99),
})
export type StudioCreditPack = z.infer<typeof studioCreditPackSchema>

/**
 * One ledger row. The balance is always the sum of the ledger, never a
 * mutable counter. A failed generation is refunded with a REFUND row that
 * points at the spend it reverses.
 */
export const studioCreditLedgerEntrySchema = z.object({
  id: z.string().min(1),
  type: z.enum(['GRANT', 'SPEND', 'REFUND', 'EXPIRY']),
  /** Positive for GRANT/REFUND, negative for SPEND/EXPIRY. */
  amount: z.number().int(),
  /** MONTHLY grants reset on the 1st; PURCHASED ones expire after 12 months. */
  bucket: z.enum(['MONTHLY', 'PURCHASED']),
  action: studioAiActionSchema.nullable(),
  actor: z.object({ userId: z.string(), name: z.string() }).nullable(),
  graphicId: z.string().nullable(),
  /** REFUND: the spend it reverses. */
  reversesId: z.string().nullable().optional(),
  createdAt: z.string(),
})
export type StudioCreditLedgerEntry = z.infer<typeof studioCreditLedgerEntrySchema>

/** GET /clubs/:clubId/studio/credits */
export const studioCreditsSchema = z.object({
  clubId: z.string().min(1),
  /** monthlyRemaining + purchasedRemaining. */
  balance: z.number().int().min(0),
  monthlyAllowance: z.number().int().min(0),
  monthlyRemaining: z.number().int().min(0),
  purchasedRemaining: z.number().int().min(0),
  /** ISO date of the next monthly reset (the 1st). */
  resetsAt: z.string(),
  costs: z.record(studioAiActionSchema, z.number().int().min(0)),
  packs: z.array(studioCreditPackSchema),
  /** Vorstand, Kassenwart, Medienwart. */
  canBuy: z.boolean(),
  /** Newest first, last 50. */
  ledger: z.array(studioCreditLedgerEntrySchema),
})
export type StudioCredits = z.infer<typeof studioCreditsSchema>

/**
 * POST /clubs/:clubId/studio/credits/checkout — responds with a Stripe
 * Checkout URL on the website. Credits are a consumable digital good: the
 * apps never sell them natively, they open this URL in the browser.
 */
export const studioCreditCheckoutSchema = z.object({ packId: z.string().min(1) })
export type StudioCreditCheckoutInput = z.infer<typeof studioCreditCheckoutSchema>
export const studioCreditCheckoutResponseSchema = z.object({ url: z.string().url() })
export type StudioCreditCheckoutResponse = z.infer<typeof studioCreditCheckoutResponseSchema>

/** 402 body when the balance does not cover an AI action. */
export const STUDIO_INSUFFICIENT_CREDITS = 'studio_insufficient_credits'

// ─── AI actions (each spends credits, refunded when the generation fails) ───

export const STUDIO_OUTCOMES = ['WIN', 'DRAW', 'LOSS'] as const
export type StudioOutcome = (typeof STUDIO_OUTCOMES)[number]

const aiBase = z.object({
  template: studioTemplateSchema,
  /** The match the graphic is bound to, when there is one. */
  eventId: z.string().min(1).nullable().optional(),
  graphicId: z.string().min(1).nullable().optional(),
})

/** POST /clubs/:clubId/studio/ai/variants (1 credit) — three alternatives. */
export const studioAiVariantsSchema = aiBase.extend({
  style: studioStyleSchema,
  format: studioFormatSchema,
})
export type StudioAiVariantsInput = z.infer<typeof studioAiVariantsSchema>
export const studioAiVariantSchema = z.object({
  id: z.string().min(1),
  style: studioStyleSchema,
  /** Accent override inside the style (hex), null = the style's own. */
  accent: hexColor.nullable(),
})
export type StudioAiVariant = z.infer<typeof studioAiVariantSchema>
export const studioAiVariantsResponseSchema = z.object({
  variants: z.array(studioAiVariantSchema).length(3),
  balance: z.number().int().min(0),
})
export type StudioAiVariantsResponse = z.infer<typeof studioAiVariantsResponseSchema>

/**
 * POST /clubs/:clubId/studio/ai/caption (1 credit) — a caption in the club's
 * language with handle and hashtags. Tone follows the outcome; a loss gets a
 * respectful caption and the opponent is never mocked. `previous` asks for
 * another take ("Neu schreiben"). Captions are suggestions: nothing posts
 * without a tap.
 */
export const studioAiCaptionSchema = aiBase.extend({
  language: z.string().min(2).max(5),
  outcome: z.enum(STUDIO_OUTCOMES).nullable().optional(),
  /** Text already on the graphic (score, scorers with consent, opponent). */
  facts: z.record(z.string(), z.string().max(200)).optional(),
  previous: z.string().max(2200).optional(),
})
export type StudioAiCaptionInput = z.infer<typeof studioAiCaptionSchema>
export const studioAiCaptionResponseSchema = z.object({
  caption: z.string().max(2200),
  balance: z.number().int().min(0),
})
export type StudioAiCaptionResponse = z.infer<typeof studioAiCaptionResponseSchema>

/**
 * POST /clubs/:clubId/studio/ai/cutout (2 credits) — background-removed
 * player photo for Tor and Spieler des Spiels. The server refuses (403,
 * `studio_consent_missing`, no spend) when the player has no photo consent.
 */
export const studioAiCutoutSchema = z.object({
  playerUserId: z.string().min(1),
  graphicId: z.string().min(1).nullable().optional(),
})
export type StudioAiCutoutInput = z.infer<typeof studioAiCutoutSchema>
export const studioAiCutoutResponseSchema = z.object({
  imageUrl: z.string().url(),
  balance: z.number().int().min(0),
})
export type StudioAiCutoutResponse = z.infer<typeof studioAiCutoutResponseSchema>
export const STUDIO_CONSENT_MISSING = 'studio_consent_missing'

/**
 * POST /clubs/:clubId/studio/ai/template-set (20 credits) — generates the
 * club's three styles from crest and colours, stored as editable template
 * JSON (never flat images).
 */
export const studioAiTemplateSetSchema = z.object({}).strict()
export const studioAiTemplateSetResponseSchema = z.object({
  styles: z.array(
    z.object({
      style: studioStyleSchema,
      accent: hexColor.nullable(),
      /** Opaque, editable template JSON for the server renderer. */
      template: z.record(z.string(), z.unknown()),
    }),
  ),
  templateSetAt: z.string(),
  balance: z.number().int().min(0),
})
export type StudioAiTemplateSetResponse = z.infer<typeof studioAiTemplateSetResponseSchema>

// ─── Consent (blocking rules) ───────────────────────────────────────────────

/**
 * One player's consent as the Studio needs it. A player is never placed in a
 * graphic without photo consent; the name is used only when the player has
 * not opted out of public naming. Minors need the parental consent
 * (`child-consent`) for both. Players missing from the list count as "no".
 */
export const studioPlayerConsentSchema = z.object({
  userId: z.string().min(1),
  photoConsent: z.boolean(),
  /** False once the player opted out of public naming. */
  publicNaming: z.boolean(),
  isMinor: z.boolean(),
  /** Minors only: what the guardian allowed. Null = nothing on file. */
  parentalConsent: z.object({ photo: z.boolean(), name: z.boolean() }).nullable(),
  /** Background-removed photo from a previous cutout, if any. */
  cutoutUrl: z.string().url().nullable().optional(),
})
export type StudioPlayerConsent = z.infer<typeof studioPlayerConsentSchema>

/**
 * GET /clubs/:clubId/studio/context?teamId=&eventId= — what the Studio binds
 * to. Without `eventId` the server picks the match that is "jetzt dran": the
 * running one, else the one that finished last (24 h), else the next one.
 */
export const studioContextSchema = z.object({
  eventId: z.string().nullable(),
  consents: z.array(studioPlayerConsentSchema),
})
export type StudioContext = z.infer<typeof studioContextSchema>

// ─── Archive ────────────────────────────────────────────────────────────────

export const STUDIO_SHARE_CHANNELS = [
  'INSTAGRAM_FEED',
  'INSTAGRAM_STORY',
  'FACEBOOK_PAGE',
  'WHATSAPP',
  'SHARE_SHEET',
] as const
export const studioShareChannelSchema = z.enum(STUDIO_SHARE_CHANNELS)
export type StudioShareChannel = z.infer<typeof studioShareChannelSchema>

const person = z.object({ userId: z.string(), name: z.string() })

/** A finished graphic in the club archive: who created and who posted it. */
export const studioGraphicSchema = z.object({
  id: z.string().min(1),
  clubId: z.string().min(1),
  eventId: z.string().nullable(),
  template: studioTemplateSchema,
  style: studioStyleSchema,
  format: studioFormatSchema,
  title: z.string().max(120),
  caption: z.string().max(2200).nullable(),
  /** Server-rendered PNG (MP4 for clip overlays); null while rendering. */
  mediaUrl: z.string().url().nullable(),
  channels: z.array(studioShareChannelSchema),
  createdBy: person,
  postedBy: person.nullable(),
  postedAt: z.string().nullable(),
  createdAt: z.string(),
})
export type StudioGraphic = z.infer<typeof studioGraphicSchema>

/** GET /clubs/:clubId/studio/graphics — newest first. */
export const studioGraphicsListSchema = z.object({
  graphics: z.array(studioGraphicSchema),
  nextCursor: z.string().nullable(),
})
export type StudioGraphicsList = z.infer<typeof studioGraphicsListSchema>

/**
 * POST /clubs/:clubId/studio/graphics — stores the graphic in the archive
 * and, for connected Instagram / Facebook channels, posts it. `data` is the
 * template JSON the server renders from (texts already consent-filtered;
 * the server filters again and rejects names or photos without consent).
 */
export const createStudioGraphicSchema = z.object({
  eventId: z.string().min(1).nullable().optional(),
  template: studioTemplateSchema,
  style: studioStyleSchema,
  format: studioFormatSchema,
  elements: studioElementsSchema,
  data: z.record(z.string(), z.unknown()),
  caption: z.string().max(2200).nullable().optional(),
  channels: z.array(studioShareChannelSchema).max(STUDIO_SHARE_CHANNELS.length),
})
export type CreateStudioGraphicInput = z.infer<typeof createStudioGraphicSchema>
