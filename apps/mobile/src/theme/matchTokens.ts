/**
 * Match-context tokens — structural pieces (cream card overlap, status pills,
 * pitch line markings) layered on top of the existing club-color theme.
 *
 * IMPORTANT: this file does NOT define the hero background color. The match
 * hero uses `useClubColors().primary` — the white-label club color owns every
 * hero/accent surface in the app. Only the curved-card overlap, status pills,
 * and pitch line markings live here.
 */

export const STATUS_LIVE = '#E04338'
export const STATUS_LIVE_DARK = '#F26259'

export const lightMatchTokens = {
  // Curved cream card that overlaps the hero — uses the existing app
  // background so the rest of the screen flows seamlessly into it.
  cardSurface: '#FAFAF8',
  cardText: '#1A1C22',
  cardSecondary: '#5F626C',
  // Pitch surface for the lineup-builder hero. Green is the football
  // convention; tokenized so future white-label themes can override
  // without touching the screen.
  pitchFill: '#2E8B40',
  // White stripes/lines drawn on top of the club-primary hero.
  heroLine: 'rgba(255, 255, 255, 0.18)',
  heroLineStrong: 'rgba(255, 255, 255, 0.32)',
  heroStripeTint: 'rgba(255, 255, 255, 0.04)',
  // Status pill backgrounds + text.
  statusLive: STATUS_LIVE,
  statusLiveText: '#FFFFFF',
  statusUpcoming: '#5F626C',
  statusUpcomingText: '#FFFFFF',
  statusFinal: '#3F4453',
  statusFinalText: '#FFFFFF',
  // Player token on FormationPitch — home uses club-primary, away uses
  // a neutral charcoal that contrasts on any club color.
  tokenAway: '#1A1F4D',
  tokenText: '#FFFFFF',
  // Empty lineup-builder slot tokens drawn on the green pitch.
  tokenEmptyFill: 'rgba(0, 0, 0, 0.18)',
  tokenEmptyBorder: 'rgba(255, 255, 255, 0.45)',
  tokenEmptyText: 'rgba(255, 255, 255, 0.7)',
  // Drop shadow behind player-name labels printed on the green pitch.
  pitchLabelShadow: 'rgba(0, 0, 0, 0.5)',
} as const

export const darkMatchTokens = {
  cardSurface: '#0F0F0E',
  cardText: '#E8E8E4',
  cardSecondary: '#9C9C96',
  // Slightly deeper / desaturated green so the pitch doesn't fight a
  // dark surrounding canvas.
  pitchFill: '#1F5C42',
  heroLine: 'rgba(255, 255, 255, 0.14)',
  heroLineStrong: 'rgba(255, 255, 255, 0.26)',
  heroStripeTint: 'rgba(255, 255, 255, 0.03)',
  statusLive: STATUS_LIVE_DARK,
  statusLiveText: '#FFFFFF',
  statusUpcoming: '#9C9C96',
  statusUpcomingText: '#0F0F0E',
  statusFinal: '#6B6B66',
  statusFinalText: '#0F0F0E',
  tokenAway: '#3743A1',
  tokenText: '#FFFFFF',
  tokenEmptyFill: 'rgba(0, 0, 0, 0.28)',
  tokenEmptyBorder: 'rgba(255, 255, 255, 0.40)',
  tokenEmptyText: 'rgba(255, 255, 255, 0.7)',
  pitchLabelShadow: 'rgba(0, 0, 0, 0.5)',
} as const

export type MatchTokens = { [K in keyof typeof lightMatchTokens]: string }

export const HERO_CARD_OVERLAP = 24
export const HERO_CARD_RADIUS = 28

import { useIsDark } from '../context/ClubThemeContext'

export function useMatchTokens(): MatchTokens {
  const isDark = useIsDark()
  return isDark ? darkMatchTokens : lightMatchTokens
}
