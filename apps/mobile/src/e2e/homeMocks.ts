import type { MySeasonSummary } from '@anstoss/shared'

/**
 * E2E / preview mocks for the 2026-11 redesign home contract
 * (packages/shared/src/schemas/home.ts): the reader's own season line on
 * the player home. Other home additions (matchKind, lineupDraft,
 * carpoolSummary, photoConsent, dues history) ride on existing mock rows in
 * session.ts.
 */

type Response = { handled: true; ok: boolean; status: number; body?: unknown } | null

const MY_SEASON = /^\/clubs\/[^/]+\/teams\/[^/]+\/my-season$/

export function handleHomeMock(ctx: { scenario: string; pathname: string; method: string }): Response {
  if (ctx.method !== 'GET' || !MY_SEASON.test(ctx.pathname)) return null
  const body: MySeasonSummary = {
    season: '2026/27',
    appearances: 9,
    goals: 6,
    trainingsAttended: 7,
    trainingsTotal: 8,
  }
  return { handled: true, ok: true, status: 200, body }
}
