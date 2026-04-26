/**
 * Color palette — adapted from Renuir's colors.ts.
 *
 * Anstoss is club-adaptive: the `primary` slot is hydrated at runtime from
 * the active club's primary color via ClubThemeContext. The hex value in
 * `lightTheme.primary` here is the fallback used when no club is loaded
 * (sign-in, onboarding, offline bootstrap).
 *
 * Renuir's lost-and-found domain colors (lost/found, carrier brands) are
 * dropped — Anstoss doesn't need them.
 *
 * Dark mode: `useColors()`-style access is provided through ClubThemeContext
 * (`useClubColors()`), which returns the active theme object shaped like
 * `lightTheme` / `darkTheme` below, with `primary*` slots overridden by the
 * active club.
 */

// Fallback primary used when no club is loaded yet — intentionally neutral
// so pre-club flows (sign-in, onboarding, club-setup) do not look like any
// particular club. Once a club is active, buildClubTheme() hydrates these
// slots with the club's color.
export const DEFAULT_PRIMARY = '#1A1C22'
export const DEFAULT_PRIMARY_PRESSED = '#000000'
export const DEFAULT_PRIMARY_50 = '#F3F4F6'

// Text constants — also imported by typography.ts
export const TEXT_PRIMARY = '#1A1C22'
export const TEXT_SECONDARY = '#5F626C'
export const TEXT_TERTIARY = '#767D8C'
export const TEXT_WHITE = '#FFFFFF'

// Surfaces / borders
export const SURFACE = '#FFFFFF'
export const SURFACE_RAISED = '#FFFFFF'
export const SURFACE_SUNKEN = '#F3F3F3'
export const SURFACE_OVERLAY = 'rgba(15, 17, 22, 0.55)'
export const SCRIM_BASE = '#0F1116'
export const BORDER_SUBTLE = '#F3F4F6'
export const BORDER_DEFAULT = '#E6E7F2'
export const BORDER_STRONG = '#C9CCD9'

// Semantic — light theme values darkened to meet WCAG AA non-text 3:1 on
// the warm off-white background; dark theme overrides below keep the
// brighter shades used on charcoal surfaces.
export const SUCCESS = '#15803D'
export const SUCCESS_BG = '#DCFCE7'
export const WARNING = '#B45309'
export const WARNING_BG = '#FEF3C7'
export const ERROR = '#9C4A67'
export const ERROR_BG = '#FEE7E7'
export const INFO = '#3B82F6'
export const INFO_BG = '#E8EBFF'

// App-level chrome (Anstoss-specific)
export const APP_BACKGROUND = '#FAFAF8' // warm off-white body behind cards

/**
 * Light theme — the Renuir-derived default palette.
 * `primary*` are fallbacks; the live values come from ClubThemeContext.
 */
export const lightTheme = {
  // Brand
  primary: DEFAULT_PRIMARY,
  primaryPressed: DEFAULT_PRIMARY_PRESSED,
  primary50: DEFAULT_PRIMARY_50,

  // App background (the screen root)
  background: APP_BACKGROUND,

  // Surfaces
  surface: SURFACE,
  surfaceRaised: SURFACE_RAISED,
  surfaceSunken: SURFACE_SUNKEN,
  surfaceOverlay: SURFACE_OVERLAY,
  // Legacy alias — tokens.ts used surfaceElevated for the same concept as
  // surfaceRaised; keep the name so existing consumers don't break.
  surfaceElevated: SURFACE_RAISED,

  // Text
  textPrimary: TEXT_PRIMARY,
  textSecondary: TEXT_SECONDARY,
  textTertiary: TEXT_TERTIARY,
  textInverse: TEXT_WHITE,

  // Borders
  borderSubtle: BORDER_SUBTLE,
  borderDefault: BORDER_DEFAULT,
  borderStrong: BORDER_STRONG,
  // Legacy alias for the single default border
  border: BORDER_DEFAULT,

  // Semantic
  success: SUCCESS,
  successBg: SUCCESS_BG,
  warning: WARNING,
  warningBg: WARNING_BG,
  error: ERROR,
  errorBg: ERROR_BG,
  info: INFO,
  infoBg: INFO_BG,

  // Chat
  chatBubbleOther: '#F0F0EB',
} as const

/**
 * Dark theme — mirrors lightTheme's shape.
 * Semantic colors lighten ~10% for legibility; surfaces go to warm charcoals.
 */
export const darkTheme = {
  primary: '#E8E8E4',
  primaryPressed: '#FFFFFF',
  primary50: 'rgba(232, 232, 228, 0.12)',

  background: '#0F0F0E',

  surface: '#1A1A18',
  surfaceRaised: '#242422',
  surfaceSunken: '#141412',
  surfaceOverlay: 'rgba(0, 0, 0, 0.65)',
  surfaceElevated: '#242422',

  textPrimary: '#E8E8E4',
  textSecondary: '#9C9C96',
  textTertiary: '#6B6B66',
  textInverse: '#1A1A18',

  borderSubtle: '#2A2A28',
  borderDefault: '#2E2E2C',
  borderStrong: '#3A3A38',
  border: '#2E2E2C',

  success: '#3ED671',
  successBg: 'rgba(34, 197, 94, 0.18)',
  warning: '#F5B945',
  warningBg: 'rgba(245, 158, 11, 0.18)',
  error: '#D5708A',
  errorBg: 'rgba(156, 74, 103, 0.22)',
  info: '#6FA3F9',
  infoBg: 'rgba(59, 130, 246, 0.18)',

  chatBubbleOther: '#27272A',
} as const

/**
 * Theme shape with widened string values — the literal types from `as const`
 * would prevent club-theme.ts from overriding the `primary*` slots with
 * runtime hex values.
 */
export type AppTheme = { [K in keyof typeof lightTheme]: string }
