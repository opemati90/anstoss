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
// Default club colour when no club is loaded: the deep pitch green of the
// 2026-11 redesign (welcome hero, crest, next-up hero). Clubs override it with
// their own Vereinsfarbe.
export const DEFAULT_PRIMARY = '#0E3B2B'
export const DEFAULT_PRIMARY_PRESSED = '#0A2C20'
export const DEFAULT_PRIMARY_50 = 'rgba(14, 59, 43, 0.10)'

// Ink: the near-black that carries primary actions, selected chips and the
// active tab. Kept separate from the club colour so a yellow or pale
// Vereinsfarbe never weakens the app's main button.
export const INK = '#121A15'
// Signal accent: the lime used for the one action on a club-coloured hero and
// for highlights on dark surfaces. Always paired with INK text.
export const ACCENT = '#D4F25C'
// Body copy on a club-coloured hero (dimmed white on the deep green).
export const ON_HERO_MUTED = '#C9D6CF'
// Unread / attention dot (bell, inbox).
export const ALERT_DOT = '#D9480F'

// Text constants — also imported by typography.ts
export const TEXT_PRIMARY = INK
export const TEXT_SECONDARY = '#5B675F'
export const TEXT_TERTIARY = '#66716A'
export const TEXT_WHITE = '#FFFFFF'

// Surfaces / borders
export const SURFACE = '#FFFFFF'
export const SURFACE_RAISED = '#FFFFFF'
export const SURFACE_SUNKEN = '#ECEAE3'
export const SURFACE_MUTED = '#F1EFE9'
export const SURFACE_OVERLAY = 'rgba(15, 17, 22, 0.55)'
export const SCRIM_BASE = '#0F1116'
export const BORDER_SUBTLE = '#EDEBE4'
export const BORDER_DEFAULT = '#E4E2DA'
export const BORDER_STRONG = '#CFCDC4'

// Semantic — light theme values darkened to meet WCAG AA non-text 3:1 on
// the warm off-white background; dark theme overrides below keep the
// brighter shades used on charcoal surfaces.
export const SUCCESS = '#15803D'
export const SUCCESS_BG = '#DCFCE7'
export const WARNING = '#B45309'
export const WARNING_BG = '#FEF3C7'
export const ERROR = '#C4372C'
export const ERROR_BG = '#FDECEA'
export const INFO = '#2563A0'
export const INFO_BG = '#E8EBFF'

// App-level chrome (Anstoss-specific)
export const APP_BACKGROUND = '#F6F5F1' // warm off-white body behind cards

// Machine-readable QR codes stay high-contrast regardless of the club theme
// or system appearance. These values must never be theme-inverted.
export const QR_FOREGROUND = '#000000'
export const QR_BACKGROUND = '#FFFFFF'

/**
 * Light theme — the Renuir-derived default palette.
 * `primary*` are fallbacks; the live values come from ClubThemeContext.
 */
export const lightTheme = {
  // Brand
  primary: DEFAULT_PRIMARY,
  primaryPressed: DEFAULT_PRIMARY_PRESSED,
  primary50: DEFAULT_PRIMARY_50,

  // Text/icon colour on a primary fill; recomputed per club in club-theme.ts
  onPrimary: TEXT_WHITE,

  // Ink actions (filled buttons, selected chips, active tab) and the lime
  // signal accent. See DESIGN.md → Color.
  ink: INK,
  onInk: TEXT_WHITE,
  accent: ACCENT,
  onAccent: INK,
  // Club-coloured hero surface (welcome, next-up, live match). Unlike
  // `primary` it is never contrast-adjusted, so the club colour reads true in
  // both modes; text on it uses `onHeroBg`, muted copy `onHeroMuted`.
  heroBg: DEFAULT_PRIMARY,
  onHeroBg: TEXT_WHITE,
  onHeroMuted: ON_HERO_MUTED,
  alertDot: ALERT_DOT,

  // App background (the screen root)
  background: APP_BACKGROUND,

  // Surfaces
  surface: SURFACE,
  surfaceRaised: SURFACE_RAISED,
  surfaceSunken: SURFACE_SUNKEN,
  // Icon wells and quiet tag fills
  surfaceMuted: SURFACE_MUTED,
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
  // Outlines that carry meaning (inputs, unselected RSVP pills): 3:1 on bg
  borderControl: '#868D87',
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
  chatBubbleOther: '#ECEAE3',
} as const

/**
 * Dark theme — mirrors lightTheme's shape.
 * Semantic colors lighten ~10% for legibility; surfaces go to warm charcoals.
 */
export const darkTheme = {
  primary: '#3FB27A',
  primaryPressed: '#2E9463',
  primary50: 'rgba(63, 178, 122, 0.16)',
  onPrimary: '#0B100D',

  ink: '#ECEFEA',
  onInk: '#0B100D',
  accent: ACCENT,
  onAccent: INK,
  heroBg: DEFAULT_PRIMARY,
  onHeroBg: TEXT_WHITE,
  onHeroMuted: ON_HERO_MUTED,
  alertDot: ALERT_DOT,

  background: '#0B100D',

  surface: '#151C17',
  surfaceRaised: '#1F2821',
  surfaceSunken: '#101712',
  surfaceMuted: '#1F2821',
  surfaceOverlay: 'rgba(0, 0, 0, 0.65)',
  surfaceElevated: '#1F2821',

  textPrimary: '#ECEFEA',
  textSecondary: '#97A39C',
  textTertiary: '#8B978F',
  textInverse: '#0B100D',

  borderSubtle: '#232C25',
  borderDefault: '#2A342D',
  borderStrong: '#343E37',
  borderControl: '#5C6760',
  border: '#2A342D',

  success: '#3ED671',
  successBg: 'rgba(34, 197, 94, 0.18)',
  warning: '#F5B945',
  warningBg: 'rgba(245, 158, 11, 0.18)',
  error: '#F07167',
  errorBg: 'rgba(240, 113, 103, 0.18)',
  info: '#6FA3F9',
  infoBg: 'rgba(59, 130, 246, 0.18)',

  chatBubbleOther: '#1F2821',
} as const

/**
 * Theme shape with widened string values — the literal types from `as const`
 * would prevent club-theme.ts from overriding the `primary*` slots with
 * runtime hex values.
 */
export type AppTheme = { [K in keyof typeof lightTheme]: string }
