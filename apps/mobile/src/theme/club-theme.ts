import {
  neutralColors,
  darkNeutralColors,
  semanticColors,
} from './tokens'

/**
 * Club theme configuration — fetched from API, cached in AsyncStorage.
 *
 * Each club provides:
 *   - primary: hex color (extracted from badge or set by coach)
 *   - name: club name
 *   - badgeUrl: R2 URL for club badge
 *
 * The theme engine derives primaryLight (10% opacity) and primaryDark
 * (20% darker) variants automatically.
 */
export interface ClubConfig {
  id: string
  name: string
  primary: string
  badgeUrl: string | null
}

export interface ClubTheme {
  // Club-specific
  clubPrimary: string
  clubPrimaryLight: string
  clubPrimaryDark: string

  // Neutrals
  background: string
  surface: string
  surfaceElevated: string
  border: string
  borderStrong: string
  textPrimary: string
  textSecondary: string
  textTertiary: string
  textInverse: string

  // Semantic
  success: string
  warning: string
  error: string
  info: string
}

// Default theme when no club is loaded (onboarding, club selection)
const DEFAULT_PRIMARY = '#4A4A48'

export function buildClubTheme(
  club: ClubConfig | null,
  isDark: boolean,
): ClubTheme {
  const primary = club?.primary || DEFAULT_PRIMARY
  const neutrals = isDark ? darkNeutralColors : neutralColors

  return {
    clubPrimary: primary,
    clubPrimaryLight: hexToRgba(primary, 0.1),
    clubPrimaryDark: darkenHex(primary, 0.2),

    ...neutrals,
    ...semanticColors,
  }
}

/**
 * Convert hex to rgba string with given opacity.
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Darken a hex color by a given amount (0-1).
 */
function darkenHex(hex: string, amount: number): string {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)))
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)))
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Fallback theme — renders immediately while club config loads.
 * Neutral gray accent, warm off-white background.
 */
export const FALLBACK_THEME = buildClubTheme(null, false)
export const FALLBACK_THEME_DARK = buildClubTheme(null, true)
