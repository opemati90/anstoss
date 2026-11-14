import { updateStudioBrandKitSchema, type ClubPlan, type StudioBrandKit } from '@anstoss/shared'
import { handlePlanMock } from './planMocks'
import type { E2EApiResponse, E2ESessionSnapshot } from './session'

// Simulator data only. Real persistence/permission tests live in studio.db.spec.ts.
// Weak keys discard all settings when a persona/session is replaced.
const kits = new WeakMap<E2ESessionSnapshot, StudioBrandKit>()

export function handleStudioMock(
  session: E2ESessionSnapshot,
  pathname: string,
  method: string,
  body: unknown,
): E2EApiResponse | null {
  const match = /^\/clubs\/([^/]+)\/studio\/brand-kit$/.exec(pathname)
  if (!match) return null
  const membership = session.memberships.find((entry) => entry.club.id === match[1])
  if (!membership || session.scenario !== 'club-admin') {
    return { handled: true, ok: false, status: 403, message: 'Studio access denied' }
  }
  const response = handlePlanMock({
    scenario: session.scenario,
    pathname: `/clubs/${match[1]}/plan`,
    method: 'GET',
  })
  const plan = response?.body as ClubPlan | undefined
  if (plan?.tier !== 'PRO' && plan?.tier !== 'SCALE') {
    return {
      handled: true,
      ok: false,
      status: 403,
      message: 'Studio requires an active Verein plan',
    }
  }
  const kit: StudioBrandKit = kits.get(session) ?? {
    clubId: membership.club.id,
    crestUrl: membership.club.badgeUrl ?? null,
    sponsors: [],
    colors: {
      primary: membership.club.primaryColor,
      accent: '#D4F25C',
      dark: '#121A15',
      light: '#F1EEE4',
    },
    fontPairing: 'CONDENSED',
    handle: null,
    hashtags: [],
    templateSetAt: null,
    accounts: [
      { channel: 'INSTAGRAM', connected: false, handle: null },
      { channel: 'FACEBOOK', connected: false, handle: null },
    ],
  }
  if (method === 'GET') return { handled: true, ok: true, status: 200, body: kit }
  if (method !== 'PUT')
    return { handled: true, ok: false, status: 405, message: 'Method not allowed' }
  const input = updateStudioBrandKitSchema.safeParse(body)
  if (!input.success || input.data.sponsors?.length) {
    return { handled: true, ok: false, status: 400, message: 'Invalid brand settings' }
  }
  const saved: StudioBrandKit = { ...kit, ...input.data, sponsors: kit.sponsors }
  kits.set(session, saved)
  return { handled: true, ok: true, status: 200, body: saved }
}
