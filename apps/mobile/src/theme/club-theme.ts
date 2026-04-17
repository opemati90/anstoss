import { lightTheme, darkTheme, type AppTheme } from './colors'

/**
 * Club theme configuration — fetched from API, cached in AsyncStorage.
 *
 * Each club provides:
 *   - primary: hex color (extracted from badge or set by coach)
 *   - name: club name
 *   - badgeUrl: R2 URL for club badge
 *
 * The theme engine derives primaryPressed (15% darker) and primary50
 * (10% opacity) from the club primary automatically.
 */
export interface ClubConfig {
  id: string
  name: string
  primary: string
  badgeUrl: string | null
}

/**
 * The live theme object consumed by useClubColors().
 *
 * Shape extends the Renuir-derived AppTheme (colors.ts → lightTheme) with
 * legacy aliases (`clubPrimary`, `clubPrimaryLight`, `clubPrimaryDark`) that
 * pre-date the Renuir adoption. Both naming conventions resolve to the same
 * values; prefer `primary` / `primary50` / `primaryPressed` in new code.
 */
export interface ClubTheme extends AppTheme {
  // Legacy aliases — keep until the full Phase 6 migration sweep is done.
  clubPrimary: string
  clubPrimaryLight: string
  clubPrimaryDark: string
}

export function buildClubTheme(
  club: ClubConfig | null,
  isDark: boolean,
): ClubTheme {
  const base = isDark ? darkTheme : lightTheme

  // Hydrate the primary slot from the club if one is active; otherwise use
  // the base theme's fallback (Renuir indigo).
  const primary = club?.primary ?? base.primary
  const primaryPressed = club?.primary
    ? darkenHex(club.primary, 0.15)
    : base.primaryPressed
  const primary50 = club?.primary
    ? hexToRgba(club.primary, 0.1)
    : base.primary50

  return {
    ...base,
    primary,
    primaryPressed,
    primary50,
    // Legacy aliases
    clubPrimary: primary,
    clubPrimaryLight: primary50,
    clubPrimaryDark: primaryPressed,
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
  const r = Math.max(
    0,
    Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)),
  )
  const g = Math.max(
    0,
    Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)),
  )
  const b = Math.max(
    0,
    Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)),
  )
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Fallback theme — renders immediately while club config loads.
 * Uses the Renuir indigo defaults from colors.ts.
 */
export const FALLBACK_THEME = buildClubTheme(null, false)
export const FALLBACK_THEME_DARK = buildClubTheme(null, true)
