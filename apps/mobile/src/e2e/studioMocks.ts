import {
  STUDIO_CREDIT_COSTS,
  STUDIO_CREDIT_CURRENCY,
  STUDIO_CREDIT_PACKS,
  STUDIO_INSUFFICIENT_CREDITS,
  STUDIO_MONTHLY_CREDITS,
  type MatchLiveStateDto,
  type StudioAiAction,
  type StudioBrandKit,
  type StudioCreditLedgerEntry,
  type StudioCredits,
  type StudioGraphic,
  type StudioPlayerConsent,
  type StudioStyle,
} from '@anstoss/shared'

/**
 * E2E / preview mocks for Matchday Studio (packages/shared schemas/studio.ts),
 * with the boards' data: 84 credits, sponsors Bäckerei Krause and Treptow
 * Autohaus, Instagram connected, and a match that ended 3:1 twelve minutes
 * ago (boards 38–42). State lives in memory until a persona is activated.
 *
 * Preview switches (query params on the page URL):
 *   ?studioCredits=0   the zero-credit state ("Credits holen")
 *   ?studioLocked=1    handled in planMocks.ts: the free-club StudioLocked
 */

type Response =
  | { handled: true; ok: boolean; status: number; body?: unknown; message?: string; code?: string }
  | null

type Ctx = {
  scenario: string
  pathname: string
  method: string
  query: URLSearchParams | null
  body: unknown
  clubId: string
  teamId: string
  club: { name: string; primaryColor: string }
  user: { id: string; name: string }
  /** Members of the session's own team, for consent rows of real mock events. */
  memberIds: () => string[]
}

export const STUDIO_EVENT_ID = 'event-studio-final'

const ROSTER: Array<[id: string, name: string, number: number, position: string]> = [
  ['studio-p1', 'Jonas Wagner', 1, 'GK'],
  ['studio-p3', 'Lukas Hoffmann', 3, 'LB'],
  ['studio-p4', 'Tomasz Nowak', 4, 'CB'],
  ['studio-p5', 'Marko Petrović', 5, 'CB'],
  ['studio-p2', 'Paul Krüger', 2, 'RB'],
  ['studio-p6', 'Felix Becker', 6, 'CM'],
  ['studio-p8', 'Tim Schulz', 8, 'CM'],
  ['studio-p7', 'Jan Meyer', 7, 'CM'],
  ['studio-p10', 'Mert Yılmaz', 10, 'LM'],
  ['studio-p11', 'Emre Kaya', 11, 'RM'],
  ['studio-p9', 'Kofi Osei', 9, 'ST'],
]

const ok = (body: unknown, status = 200): Response => ({ handled: true, ok: true, status, body })
const minutesAgo = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

function pageParam(name: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location?.search ?? '').get(name)
  } catch {
    return null
  }
}

// ─── state ──────────────────────────────────────────────────────────────────

let kit: StudioBrandKit | null = null
let ledger: StudioCreditLedgerEntry[] | null = null
let graphics: StudioGraphic[] = []
let liveState: MatchLiveStateDto | null = null
let counter = 0

export function resetStudioMocks() {
  kit = null
  ledger = null
  graphics = []
  liveState = null
  counter = 0
}

function ensureKit(ctx: Ctx): StudioBrandKit {
  if (!kit) {
    const handle = `@${ctx.club.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`
    kit = {
      clubId: ctx.clubId,
      crestUrl: null,
      sponsors: [
        { id: 'sponsor-krause', name: 'Bäckerei Krause', logoUrl: null },
        { id: 'sponsor-treptow', name: 'Treptow Autohaus', logoUrl: null },
      ],
      colors: { primary: ctx.club.primaryColor, accent: '#D4F25C', dark: '#121A15', light: '#F1EEE4' },
      fontPairing: 'CONDENSED',
      handle,
      hashtags: [`#${ctx.club.name.replace(/[^A-Za-z0-9]+/g, '')}`, '#Kreisliga'],
      accounts: [
        { channel: 'INSTAGRAM', connected: true, handle },
        { channel: 'FACEBOOK', connected: false, handle: null },
      ],
      templateSetAt: null,
    }
  }
  return kit
}

function ensureLedger(ctx: Ctx): StudioCreditLedgerEntry[] {
  if (!ledger) {
    const zero = pageParam('studioCredits') === '0'
    const entry = (
      id: string,
      type: StudioCreditLedgerEntry['type'],
      amount: number,
      action: StudioAiAction | null,
      minAgo: number,
    ): StudioCreditLedgerEntry => ({
      id,
      type,
      amount,
      bucket: 'MONTHLY',
      action,
      actor: action ? { userId: ctx.user.id, name: ctx.user.name } : null,
      graphicId: null,
      createdAt: minutesAgo(minAgo),
    })
    // 100 granted on the 1st, 16 spent since: 84 left (board 42).
    ledger = [
      entry('ledger-4', 'SPEND', -4, 'CAPTION', 60 * 24),
      entry('ledger-3', 'SPEND', -10, 'VARIANT', 60 * 24 * 3),
      entry('ledger-2', 'SPEND', -2, 'CUTOUT', 60 * 24 * 5),
      entry('ledger-1', 'GRANT', STUDIO_MONTHLY_CREDITS, null, 60 * 24 * 12),
    ]
    if (zero) ledger.unshift(entry('ledger-zero', 'SPEND', -84, 'VARIANT', 5))
  }
  return ledger
}

function creditsFor(ctx: Ctx): StudioCredits {
  const rows = ensureLedger(ctx)
  const sum = (bucket: 'MONTHLY' | 'PURCHASED') =>
    Math.max(0, rows.filter((r) => r.bucket === bucket).reduce((n, r) => n + r.amount, 0))
  const now = new Date()
  return {
    clubId: ctx.clubId,
    balance: sum('MONTHLY') + sum('PURCHASED'),
    monthlyAllowance: STUDIO_MONTHLY_CREDITS,
    monthlyRemaining: sum('MONTHLY'),
    purchasedRemaining: sum('PURCHASED'),
    resetsAt: new Date(now.getFullYear(), now.getMonth() + 1, 1, 12).toISOString(),
    costs: { ...STUDIO_CREDIT_COSTS },
    packs: STUDIO_CREDIT_PACKS.map((pack) => ({ ...pack, currency: STUDIO_CREDIT_CURRENCY })),
    canBuy: ctx.scenario === 'club-admin',
    ledger: rows.slice(0, 50),
  }
}

/** Spend from the monthly bucket first, then purchased. Null when short. */
function spend(ctx: Ctx, action: StudioAiAction): number | null {
  const cost = STUDIO_CREDIT_COSTS[action]
  const current = creditsFor(ctx)
  if (current.balance < cost) return null
  const fromMonthly = Math.min(cost, current.monthlyRemaining)
  const add = (bucket: 'MONTHLY' | 'PURCHASED', amount: number) => {
    if (amount <= 0) return
    counter += 1
    ensureLedger(ctx).unshift({
      id: `ledger-e2e-${counter}`,
      type: 'SPEND',
      amount: -amount,
      bucket,
      action,
      actor: { userId: ctx.user.id, name: ctx.user.name },
      graphicId: null,
      createdAt: new Date().toISOString(),
    })
  }
  add('MONTHLY', fromMonthly)
  add('PURCHASED', cost - fromMonthly)
  return creditsFor(ctx).balance
}

const short = (): Response => ({
  handled: true,
  ok: false,
  status: 402,
  code: STUDIO_INSUFFICIENT_CREDITS,
  message: 'Not enough AI credits',
})

function ensureLive(): MatchLiveStateDto {
  if (!liveState) {
    const goal = (id: string, minute: number, playerId: string, assistId: string | null): MatchLiveStateDto['events'][number] => ({
      id,
      kind: 'GOAL',
      minute,
      playerUserId: playerId,
      playerName: ROSTER.find((p) => p[0] === playerId)?.[1] ?? null,
      relatedUserId: assistId,
      relatedName: ROSTER.find((p) => p[0] === assistId)?.[1] ?? null,
      createdAt: minutesAgo(12 + 95 - minute),
    })
    liveState = {
      eventId: STUDIO_EVENT_ID,
      status: 'FINISHED',
      goalsFor: 3,
      goalsAgainst: 1,
      scoreHome: 3,
      scoreAway: 1,
      homeAway: 'HOME',
      opponent: 'Rot-Weiß Köpenick III',
      opponentColor: '#B23A3A',
      minute: 90,
      kickoffAt: minutesAgo(12 + 105),
      secondHalfAt: minutesAgo(12 + 47),
      finishedAt: minutesAgo(12),
      halfTime: { goalsFor: 1, goalsAgainst: 0 },
      events: [
        goal('studio-g3', 71, 'studio-p9', 'studio-p11'),
        {
          id: 'studio-c1',
          kind: 'CONCEDED',
          minute: 64,
          playerUserId: null,
          playerName: null,
          relatedUserId: null,
          relatedName: null,
          createdAt: minutesAgo(12 + 95 - 64),
        },
        goal('studio-g2', 58, 'studio-p11', 'studio-p9'),
        goal('studio-g1', 23, 'studio-p9', null),
      ],
      canRecord: false,
    }
  }
  return liveState
}

function studioEvent(ctx: Ctx) {
  const kickoff = minutesAgo(12 + 105)
  const starters = ROSTER.map(([userId, name, number, position]) => ({ userId, name, number, position, slotId: null }))
  return {
    id: STUDIO_EVENT_ID,
    teamId: ctx.teamId,
    clubId: ctx.clubId,
    title: 'vs. Rot-Weiß Köpenick III',
    type: 'MATCH',
    date: kickoff,
    location: 'Sportplatz Dammweg',
    notes: null,
    createdById: ctx.user.id,
    createdAt: minutesAgo(60 * 24 * 6),
    archivedAt: null,
    opponent: 'Rot-Weiß Köpenick III',
    homeAway: 'HOME',
    team: { id: ctx.teamId, name: '1. Herren' },
    competition: { name: 'Kreisliga C', matchday: 11 },
    rsvps: [],
    myRsvp: null,
    members: ROSTER.map(([userId, name, jerseyNumber, position]) => ({ userId, name, jerseyNumber, position })),
    children: [],
    viewer: { canManage: true, isPlayer: false, isGuardian: false },
    lineup: { formation: '4-5-1', starters, bench: [] },
  }
}

const adultConsent = (userId: string): StudioPlayerConsent => ({
  userId,
  photoConsent: true,
  publicNaming: true,
  isMinor: false,
  parentalConsent: null,
  cutoutUrl: null,
})

const STYLES: StudioStyle[] = ['FLUTLICHT', 'DERBY', 'KREIDE']
const VARIANT_ACCENTS = ['#FFFFFF', '#F2C94C', null]

// ─── handler ────────────────────────────────────────────────────────────────

export function handleStudioMock(ctx: Ctx): Response {
  const { pathname, method } = ctx

  // The Studio's own demo match, served through the regular event endpoints.
  const eventBase = `/clubs/${ctx.clubId}/events/${STUDIO_EVENT_ID}`
  if (pathname === eventBase && method === 'GET') return ok(studioEvent(ctx))
  if (pathname === `${eventBase}/live` && method === 'GET') return ok({ ...ensureLive() })
  const result = /^\/clubs\/[^/]+\/events\/([^/]+)\/live\/result$/.exec(pathname)
  if (result && method === 'PUT') {
    if (result[1] !== STUDIO_EVENT_ID) return null
    const input = ctx.body as { goalsFor?: number; goalsAgainst?: number }
    const state = ensureLive()
    state.goalsFor = Math.max(0, input?.goalsFor ?? state.goalsFor)
    state.goalsAgainst = Math.max(0, input?.goalsAgainst ?? state.goalsAgainst)
    state.scoreHome = state.goalsFor
    state.scoreAway = state.goalsAgainst
    return ok({ ...state })
  }

  const match = /^\/clubs\/[^/]+\/studio\/(.+)$/.exec(pathname)
  if (!match) return null
  const path = match[1]

  if (path === 'context' && method === 'GET') {
    const eventId = ctx.query?.get('eventId') ?? STUDIO_EVENT_ID
    const ids = eventId === STUDIO_EVENT_ID ? ROSTER.map((p) => p[0]) : ctx.memberIds()
    return ok({ eventId, consents: ids.map(adultConsent) })
  }

  if (path === 'brand-kit') {
    if (method === 'GET') return ok(ensureKit(ctx))
    if (method === 'PUT') {
      const patch = (ctx.body ?? {}) as Partial<StudioBrandKit>
      const current = ensureKit(ctx)
      kit = {
        ...current,
        ...(patch.fontPairing ? { fontPairing: patch.fontPairing } : null),
        ...(patch.handle !== undefined ? { handle: patch.handle } : null),
        ...(patch.hashtags ? { hashtags: patch.hashtags } : null),
      }
      return ok(kit)
    }
  }

  const connect = /^accounts\/(instagram|facebook)\/connect$/.exec(path)
  if (connect && method === 'POST') {
    return ok({ url: `https://anstoss.io/studio/connect/${connect[1]}?club=${ctx.clubId}` })
  }

  if (path === 'credits' && method === 'GET') return ok(creditsFor(ctx))

  if (path === 'credits/checkout' && method === 'POST') {
    const packId = (ctx.body as { packId?: string })?.packId
    const pack = STUDIO_CREDIT_PACKS.find((p) => p.id === packId)
    if (!pack) return { handled: true, ok: false, status: 400, message: 'Unknown pack' }
    if (!creditsFor(ctx).canBuy) {
      return { handled: true, ok: false, status: 403, message: 'Only Vorstand, Kassenwart or Medienwart' }
    }
    // Preview: the web checkout "succeeds" at once, so the balance shows the grant.
    counter += 1
    ensureLedger(ctx).unshift({
      id: `ledger-e2e-${counter}`,
      type: 'GRANT',
      amount: pack.credits,
      bucket: 'PURCHASED',
      action: null,
      actor: { userId: ctx.user.id, name: ctx.user.name },
      graphicId: null,
      createdAt: new Date().toISOString(),
    })
    return ok({ url: `https://anstoss.io/studio/credits/checkout?pack=${pack.id}&club=${ctx.clubId}` }, 201)
  }

  if (path === 'ai/variants' && method === 'POST') {
    const balance = spend(ctx, 'VARIANT')
    if (balance == null) return short()
    const input = ctx.body as { style?: StudioStyle }
    const at = Math.max(0, STYLES.indexOf(input?.style ?? 'FLUTLICHT'))
    counter += 1
    return ok({
      variants: [1, 2, 3].map((step) => ({
        id: `variant-${counter}-${step}`,
        style: STYLES[(at + step) % STYLES.length],
        accent: STYLES[(at + step) % STYLES.length] === 'FLUTLICHT' ? VARIANT_ACCENTS[(counter + step) % 3] : null,
      })),
      balance,
    })
  }

  if (path === 'ai/caption' && method === 'POST') {
    const balance = spend(ctx, 'CAPTION')
    if (balance == null) return short()
    const input = ctx.body as { facts?: Record<string, string>; outcome?: string | null; previous?: string }
    const f = input?.facts ?? {}
    const tags = ensureKit(ctx).hashtags.join(' ')
    const takes: Record<string, string[]> = {
      WIN: [
        `Drei Punkte bleiben zu Hause. ${f.score ?? ''} gegen ${f.opponent ?? 'den Gegner'}${f.scorers ? ` nach Toren von ${f.scorers}` : ''}. Danke an alle, die da waren.`,
        `Was für ein Spiel! ${f.score ?? ''} gegen ${f.opponent ?? 'den Gegner'}. Weiter geht's am Sonntag.`,
      ],
      DRAW: [
        `Punkteteilung: ${f.score ?? ''} gegen ${f.opponent ?? 'den Gegner'}. Sonntag geht's weiter.`,
        `${f.score ?? ''} gegen ${f.opponent ?? 'den Gegner'}. Ein Punkt, auf dem wir aufbauen.`,
      ],
      LOSS: [
        `Endstand ${f.score ?? ''}. Kopf hoch und weiter. Danke an alle, die da waren.`,
        `${f.score ?? ''} gegen ${f.opponent ?? 'den Gegner'}. Heute nicht unser Tag, Glückwunsch an den Gegner. Sonntag greifen wir wieder an.`,
      ],
    }
    const pool = takes[input?.outcome ?? ''] ?? [
      `${f.headline ?? f.title ?? ctx.club.name}. Mehr dazu bei uns im Verein.`,
      `${f.headline ?? f.title ?? ctx.club.name}. Wir sehen uns am Platz.`,
    ]
    counter += 1
    const text = pool.find((take) => !input?.previous?.startsWith(take)) ?? pool[counter % pool.length]
    return ok({ caption: `${text.replace(/\s+/g, ' ').trim()} ${tags}`.trim(), balance })
  }

  if (path === 'ai/cutout' && method === 'POST') {
    const balance = spend(ctx, 'CUTOUT')
    if (balance == null) return short()
    return ok({ imageUrl: 'https://cdn.anstoss.io/studio/cutouts/demo.png', balance })
  }

  if (path === 'ai/template-set' && method === 'POST') {
    const balance = spend(ctx, 'TEMPLATE_SET')
    if (balance == null) return short()
    const templateSetAt = new Date().toISOString()
    kit = { ...ensureKit(ctx), templateSetAt }
    return ok({
      styles: STYLES.map((style) => ({ style, accent: null, template: { version: 1, style } })),
      templateSetAt,
      balance,
    })
  }

  if (path === 'graphics') {
    if (method === 'GET') return ok({ graphics, nextCursor: null })
    if (method === 'POST') {
      const input = ctx.body as Partial<StudioGraphic> & { channels?: StudioGraphic['channels'] }
      counter += 1
      const me = { userId: ctx.user.id, name: ctx.user.name }
      const channels = input.channels ?? []
      const graphic: StudioGraphic = {
        id: `graphic-e2e-${counter}`,
        clubId: ctx.clubId,
        eventId: input.eventId ?? null,
        template: input.template ?? 'FULL_TIME',
        style: input.style ?? 'FLUTLICHT',
        format: input.format ?? '4:5',
        title: input.title ?? '',
        caption: input.caption ?? null,
        mediaUrl: null,
        channels,
        createdBy: me,
        postedBy: channels.length > 0 ? me : null,
        postedAt: channels.length > 0 ? new Date().toISOString() : null,
        createdAt: new Date().toISOString(),
      }
      graphics = [graphic, ...graphics]
      return ok(graphic, 201)
    }
  }

  return null
}
