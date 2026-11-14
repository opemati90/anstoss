import React from 'react'
import { Linking } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

const mockApi = jest.fn()
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }
let mockMembership: { role: string; operationalRoles: string[] } = { role: 'OWNER', operationalRoles: [] }
let mockParams: Record<string, string> = {}

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter
  },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (fn: () => void) => require('react').useEffect(fn, []),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k),
    i18n: { language: 'de-DE', dir: () => 'ltr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'de', getAppLocale: () => 'de-DE' }))
jest.mock('../../src/utils/haptics', () => ({
  Haptics: { select: jest.fn(), tap: jest.fn(), tapMedium: jest.fn(), success: jest.fn() },
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: { club: { id: 'c1', name: 'SV Spreewiese', primaryColor: '#0E3B2B', badgeUrl: null }, ...mockMembership },
    activeTeamAccess: { role: 'PLAYER', team: { id: 't1' } },
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})

import { planFeatureFlags, STUDIO_CREDIT_COSTS, STUDIO_CREDIT_PACKS } from '@anstoss/shared'
import * as Sharing from 'expo-sharing'
import StudioHomeScreen from '../studio/index'
import StudioEditorScreen from '../studio/editor'
import StudioCreditsScreen from '../studio/credits'
import StudioBrandKitScreen from '../studio/brand-kit'
import { __resetClubPlanCache } from '../../src/hooks/useClubPlan'
import { __resetStudioCache } from '../../src/hooks/useStudio'

const plan = (tier: 'FREE' | 'PRO') => ({
  clubId: 'c1',
  tier,
  source: tier === 'PRO' ? 'PAID' : 'NONE',
  trialEndsAt: null,
  trialUsed: false,
  limits: { teams: 5, players: 150 },
  usage: { teams: 1, players: 22 },
  prices: { monthly: { amountCents: 1099, currency: 'EUR' }, yearly: { amountCents: 10990, currency: 'EUR' } },
  features: planFeatureFlags(tier),
  canManage: true,
})

const credits = (balance: number, canBuy = true) => ({
  clubId: 'c1',
  balance,
  monthlyAllowance: 100,
  monthlyRemaining: balance,
  purchasedRemaining: 0,
  resetsAt: '2026-12-01T12:00:00.000Z',
  costs: STUDIO_CREDIT_COSTS,
  packs: STUDIO_CREDIT_PACKS.map((p) => ({ ...p, currency: 'EUR' })),
  canBuy,
  ledger: [],
})

const kit = {
  clubId: 'c1',
  crestUrl: null,
  sponsors: [{ id: 's1', name: 'Bäckerei Krause', logoUrl: null }],
  colors: { primary: '#0E3B2B', accent: '#D4F25C', dark: '#121A15', light: '#F1EEE4' },
  fontPairing: 'CONDENSED',
  handle: '@svspreewiese',
  hashtags: ['#SVSpreewiese'],
  accounts: [
    { channel: 'INSTAGRAM', connected: true, handle: '@svspreewiese' },
    { channel: 'FACEBOOK', connected: false, handle: null },
  ],
  templateSetAt: null,
}

const consent = (userId: string) => ({ userId, photoConsent: true, publicNaming: true, isMinor: false, parentalConsent: null })
const event = {
  id: 'e1',
  type: 'MATCH',
  date: '2026-11-15T13:00:00.000Z',
  location: 'Sportplatz Dammweg',
  opponent: 'Rot-Weiß Köpenick III',
  homeAway: 'HOME',
  competition: { name: 'Kreisliga C', matchday: 11 },
  lineup: null,
  members: [],
}
const live = (patch: Record<string, unknown> = {}) => ({
  eventId: 'e1',
  status: 'FINISHED',
  goalsFor: 3,
  goalsAgainst: 1,
  scoreHome: 3,
  scoreAway: 1,
  homeAway: 'HOME',
  opponent: 'Rot-Weiß Köpenick III',
  minute: 90,
  kickoffAt: null,
  secondHalfAt: null,
  finishedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  events: [
    { id: 'g1', kind: 'GOAL', minute: 23, playerUserId: 'osei', playerName: 'Kofi Osei', relatedUserId: null, relatedName: null, createdAt: '2026-11-15T13:23:00.000Z' },
  ],
  canRecord: true,
  ...patch,
})

type World = { tier?: 'FREE' | 'PRO'; balance?: number; canBuy?: boolean; live?: Record<string, unknown>; backend?: boolean }

function serve(world: World = {}) {
  const calls: Array<{ path: string; method: string; body?: unknown }> = []
  let balance = world.balance ?? 84
  mockApi.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
    const method = options?.method ?? 'GET'
    calls.push({ path, method, body: options?.body })
    if (path === '/clubs/c1/plan') return plan(world.tier ?? 'PRO')
    if (world.backend === false) throw new Error('404')
    if (path.startsWith('/clubs/c1/studio/context')) return { eventId: 'e1', consents: [consent('osei')] }
    if (path === '/clubs/c1/studio/brand-kit') return kit
    if (path === '/clubs/c1/studio/credits') return credits(balance, world.canBuy ?? true)
    if (path === '/clubs/c1/events/e1') return event
    if (path === '/clubs/c1/events/e1/live') return live(world.live)
    if (path === '/clubs/c1/studio/ai/variants') {
      balance -= 1
      return { variants: [{ id: 'v1', style: 'DERBY', accent: null }], balance }
    }
    if (path === '/clubs/c1/studio/ai/caption') {
      balance -= 1
      return { caption: 'KI-Text #SVSpreewiese', balance }
    }
    if (path === '/clubs/c1/studio/ai/template-set') {
      balance -= 20
      return { styles: [], templateSetAt: '2026-11-15T15:00:00.000Z', balance }
    }
    if (path === '/clubs/c1/studio/graphics') return { id: 'graphic-1' }
    if (path === '/clubs/c1/studio/credits/checkout') {
      balance += 300
      return { url: 'https://anstoss.io/studio/credits/checkout?pack=pack-300' }
    }
    throw new Error(`unhandled ${method} ${path}`)
  })
  return calls
}

beforeEach(() => {
  mockApi.mockReset()
  Object.values(mockRouter).forEach((fn) => (fn as jest.Mock).mockClear?.())
  __resetClubPlanCache()
  __resetStudioCache()
  mockMembership = { role: 'OWNER', operationalRoles: [] }
  mockParams = {}
})

describe('Studio home (board 38) and locked state (board 41)', () => {
  it('shows StudioLocked for a free club with the way into the Abo', async () => {
    serve({ tier: 'FREE' })
    const s = render(<StudioHomeScreen />)
    expect(await s.findByTestId('studio-locked')).toBeTruthy()
    expect(s.getByText('studio.locked.headline')).toBeTruthy()
    expect(s.getByText('studio.locked.f3')).toBeTruthy()
    expect(s.queryByTestId('studio-home')).toBeNull()
    fireEvent.press(s.getByTestId('studio-locked-cta'))
    expect(mockRouter.push).toHaveBeenCalledWith('/abo')
  })

  it('shows balance chip, the "Jetzt dran" suggestion, both rails and the Brand-Kit row', async () => {
    serve()
    const s = render(<StudioHomeScreen />)
    expect(await s.findByTestId('studio-suggestion')).toBeTruthy()
    expect(s.getByText('84')).toBeTruthy()
    expect(s.getByText('studio.suggest.fullTimeTitle {"score":"3:1"}')).toBeTruthy()
    expect(s.getByTestId('studio-rail-match')).toBeTruthy()
    expect(s.getByTestId('studio-rail-club')).toBeTruthy()
    for (const slug of ['spieltag', 'aufstellung', 'halbzeit', 'tor', 'endstand', 'spieler', 'news', 'sponsor']) {
      expect(s.getByTestId(`studio-template-${slug}`)).toBeTruthy()
    }
    fireEvent.press(s.getByTestId('studio-suggestion'))
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/studio/editor',
      params: { template: 'endstand', eventId: 'e1' },
    })
    fireEvent.press(s.getByTestId('studio-brand-kit-row'))
    expect(mockRouter.push).toHaveBeenCalledWith('/studio/brand-kit')
    fireEvent.press(s.getByTestId('studio-credits-chip'))
    expect(mockRouter.push).toHaveBeenCalledWith('/studio/credits')
  })

  it('suggests nothing before kickoff', async () => {
    serve({ live: { status: 'NOT_STARTED', goalsFor: 0, goalsAgainst: 0, events: [], finishedAt: null } })
    const s = render(<StudioHomeScreen />)
    expect(await s.findByTestId('studio-home')).toBeTruthy()
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/clubs/c1/events/e1/live'))
    expect(s.queryByTestId('studio-suggestion')).toBeNull()
  })

  it('keeps members without a Studio role out', async () => {
    mockMembership = { role: 'PLAYER', operationalRoles: [] }
    serve()
    const s = render(<StudioHomeScreen />)
    expect(await s.findByTestId('studio-no-access')).toBeTruthy()
  })

  it('renders an empty Studio against a server without the endpoints', async () => {
    serve({ backend: false })
    const s = render(<StudioHomeScreen />)
    expect(await s.findByTestId('studio-home')).toBeTruthy()
    await waitFor(() => expect(s.getByText('0')).toBeTruthy())
    expect(s.queryByTestId('studio-suggestion')).toBeNull()
  })
})

describe('Studio editor (board 39)', () => {
  it('shows one tool at a time and opens the share step with "Weiter"', async () => {
    mockParams = { template: 'endstand' }
    serve()
    const s = render(<StudioEditorScreen />)
    expect(await s.findByTestId('studio-tool-template')).toBeTruthy()
    expect(s.queryByTestId('studio-tool-style')).toBeNull()
    fireEvent.press(s.getByTestId('studio-tool-tab-elements'))
    expect(s.getByTestId('studio-tool-elements')).toBeTruthy()
    expect(s.queryByTestId('studio-tool-template')).toBeNull()
    fireEvent.press(s.getByTestId('studio-tool-tab-result'))
    await waitFor(() => expect(s.getByTestId('studio-goals-us').props.children).toBe(3))
    expect(s.getByText('studio.editor.resultFromLive')).toBeTruthy()
    fireEvent.press(s.getByTestId('studio-next'))
    expect(await s.findByTestId('studio-share')).toBeTruthy()
    expect(s.getByText('studio.share.post {"count":1}')).toBeTruthy()
    fireEvent.press(s.getByTestId('studio-channel-feed'))
    expect(s.getByText('studio.share.pick')).toBeTruthy()
  })

  it('shows the cost on the AI tile and spends a credit for a variant', async () => {
    mockParams = { template: 'endstand' }
    const calls = serve()
    const s = render(<StudioEditorScreen />)
    await s.findByText('84')
    fireEvent.press(s.getByTestId('studio-tool-tab-style'))
    expect(s.getByLabelText('studio.editor.aiVariantA11y {"count":1}')).toBeTruthy()
    await act(async () => {
      fireEvent.press(s.getByTestId('studio-ai-variant'))
    })
    await waitFor(() => expect(s.getByText('83')).toBeTruthy())
    expect(calls.some((c) => c.path === '/clubs/c1/studio/ai/variants' && c.method === 'POST')).toBe(true)
  })

  it('turns AI buttons into "Credits holen" at zero', async () => {
    mockParams = { template: 'endstand' }
    const calls = serve({ balance: 0 })
    const s = render(<StudioEditorScreen />)
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/clubs/c1/studio/credits'))
    fireEvent.press(s.getByTestId('studio-tool-tab-style'))
    expect(await s.findByTestId('studio-get-credits')).toBeTruthy()
    expect(s.queryByTestId('studio-ai-variant')).toBeNull()
    fireEvent.press(s.getByTestId('studio-get-credits'))
    expect(mockRouter.push).toHaveBeenCalledWith('/studio/credits')
    fireEvent.press(s.getByTestId('studio-next'))
    expect(await s.findByTestId('studio-caption-get-credits')).toBeTruthy()
    expect(s.queryByTestId('studio-caption-rewrite')).toBeNull()
    expect(calls.some((c) => c.path.includes('/studio/ai/'))).toBe(false)
  })

  it('offers "Ergebnis eintragen" with steppers when nothing was tracked live', async () => {
    mockParams = { template: 'endstand', eventId: 'e1' }
    serve({ live: { status: 'NOT_STARTED', goalsFor: 0, goalsAgainst: 0, events: [], finishedAt: null } })
    const s = render(<StudioEditorScreen />)
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/clubs/c1/events/e1/live'))
    fireEvent.press(s.getByTestId('studio-tool-tab-result'))
    expect(await s.findByTestId('studio-result-enter')).toBeTruthy()
    fireEvent.press(s.getByTestId('studio-goal-plus-us'))
    fireEvent.press(s.getByTestId('studio-goal-plus-us'))
    fireEvent.press(s.getByTestId('studio-goal-minus-them'))
    expect(s.getByTestId('studio-goals-us').props.children).toBe(2)
    expect(s.getByTestId('studio-goals-them').props.children).toBe(0)
  })

  it('rewrites the caption with AI, archives the graphic and opens the share sheet', async () => {
    mockParams = { template: 'endstand' }
    const calls = serve()
    const s = render(<StudioEditorScreen />)
    await s.findByText('84')
    fireEvent.press(s.getByTestId('studio-next'))
    expect(s.getByLabelText('studio.share.rewriteA11y {"count":1}')).toBeTruthy()
    await act(async () => {
      fireEvent.press(s.getByTestId('studio-caption-rewrite'))
    })
    await waitFor(() => expect(s.getByTestId('studio-caption').props.children).toBe('KI-Text #SVSpreewiese'))
    fireEvent.press(s.getByTestId('studio-channel-wa'))
    await act(async () => {
      fireEvent.press(s.getByTestId('studio-post'))
    })
    expect(await s.findByTestId('studio-posted')).toBeTruthy()
    const saved = calls.find((c) => c.path === '/clubs/c1/studio/graphics')
    expect(saved?.body).toMatchObject({
      template: 'FULL_TIME',
      format: '4:5',
      channels: ['INSTAGRAM_FEED', 'WHATSAPP'],
      caption: 'KI-Text #SVSpreewiese',
    })
    // WhatsApp is not a connected account: the native share sheet takes it.
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///tmp/studio-graphic.png', expect.objectContaining({ mimeType: 'image/png' }))
  })
})

describe('Credits (board 42) and Brand-Kit (board 40)', () => {
  it('lists costs and packs and buys on the website', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never)
    const calls = serve()
    const s = render(<StudioCreditsScreen />)
    expect(await s.findByText('84')).toBeTruthy()
    for (const action of ['variant', 'caption', 'cutout', 'template_set']) {
      expect(s.getByTestId(`studio-cost-${action}`)).toBeTruthy()
    }
    expect(s.getByText('studio.credits.freeTag')).toBeTruthy()
    expect(s.getByTestId('studio-pack-100')).toBeTruthy()
    expect(s.getByTestId('studio-pack-1000')).toBeTruthy()
    expect(s.getByTestId('studio-pack-300').props.accessibilityState).toMatchObject({ checked: true })
    fireEvent.press(s.getByTestId('studio-pack-100'))
    expect(s.getByTestId('studio-pack-100').props.accessibilityState).toMatchObject({ checked: true })
    fireEvent.press(s.getByTestId('studio-pack-300'))
    await act(async () => {
      fireEvent.press(s.getByTestId('studio-credits-buy'))
    })
    expect(calls.find((c) => c.path.endsWith('/credits/checkout'))?.body).toEqual({ packId: 'pack-300' })
    expect(open).toHaveBeenCalledWith('https://anstoss.io/studio/credits/checkout?pack=pack-300')
    expect(await s.findByTestId('studio-credits-bought')).toBeTruthy()
    expect(s.getByText('384')).toBeTruthy()
    open.mockRestore()
  })

  it('is read-only for members who cannot buy', async () => {
    serve({ canBuy: false })
    const s = render(<StudioCreditsScreen />)
    expect(await s.findByText('studio.credits.readOnly')).toBeTruthy()
    expect(s.queryByTestId('studio-credits-buy')).toBeNull()
  })

  it('generates the template set for 20 credits and offers "Credits holen" when short', async () => {
    const calls = serve()
    const s = render(<StudioBrandKitScreen />)
    expect(await s.findByTestId('studio-kit-generate')).toBeTruthy()
    expect(s.getByText('studio.brandKit.generate {"cost":20}')).toBeTruthy()
    expect(s.getByText('studio.brandKit.connected')).toBeTruthy()
    expect(s.getByTestId('studio-kit-connect-facebook')).toBeTruthy()
    await act(async () => {
      fireEvent.press(s.getByTestId('studio-kit-generate'))
    })
    expect(await s.findByTestId('studio-kit-set-done')).toBeTruthy()
    expect(calls.some((c) => c.path === '/clubs/c1/studio/ai/template-set')).toBe(true)
    fireEvent.press(s.getByTestId('studio-kit-font-modern'))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT' && c.path === '/clubs/c1/studio/brand-kit')?.body).toEqual({
        fontPairing: 'MODERN',
      }),
    )
  })

  it('swaps the template-set action for "Credits holen" below 20 credits', async () => {
    serve({ balance: 5 })
    const s = render(<StudioBrandKitScreen />)
    expect(await s.findByTestId('studio-kit-get-credits')).toBeTruthy()
    expect(s.queryByTestId('studio-kit-generate')).toBeNull()
  })
})
