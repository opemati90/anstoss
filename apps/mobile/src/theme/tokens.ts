/**
 * Anstoss design tokens.
 *
 * Re-export surface for the Renuir-derived token layer (colors.ts,
 * typography.ts, spacing.ts, scale.ts). New code should prefer the Renuir
 * names (`SPACING_*`, `FONT_SIZE_*`, `RADIUS_*`, `useColors()`, `TextStyles`).
 *
 * The legacy maps below (`size`/`space`, `fontSize`, `radius`, `fonts`,
 * `elevation`, `card`, `hairline`, `lineHeight`, `letterSpacing`,
 * `fontWeight`, `neutralColors`, `semanticColors`, `iconSize`, `haptic`,
 * `duration`, `TAB_BAR_CLEARANCE`) are kept as stable aliases for the many
 * existing consumers. Their numeric values intentionally predate the Renuir
 * responsive `ms()` scaling and are not 1:1 with `SPACING_*` / `FONT_SIZE_*`,
 * so bulk-renaming would shift visuals. Migrate screens incrementally.
 */

import { StyleSheet, type ViewStyle } from 'react-native'

// ─── Renuir-derived token layer (new canonical surface) ─────────────────────
export * from './colors'
export * from './typography'
export * from './spacing'
export * from './scale'

// ─── Legacy token maps ───────────────────────────────────────────────────────
export const size = {
  '2xs': 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const

export const space = size

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  full: 9999,
} as const

export const card = {
  radius: 16,
  heroRadius: 18,
  paddingCompact: 14,
  padding: 18,
  paddingHero: 20,
} as const

export const fontSize = {
  '2xs': 10,
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  display: 34,
} as const

export const letterSpacing = {
  tightest: -0.8,
  tight: -0.4,
  normal: 0,
  wide: 0.4,
  widest: 1.2,
} as const

export const fontWeight = {
  regular: '400',
  medium: '500',
  bold: '700',
} as const

/**
 * @deprecated The Renuir token layer (lightTheme / darkTheme in colors.ts) is
 * the source of truth. These maps are preserved for legacy consumers that read
 * neutralColors.X directly; values are kept as-is to minimise visual drift for
 * any non-theme-aware call site. New code should consume `useClubColors()`.
 */
export const neutralColors = {
  background: '#FAFAF8',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#E5E5E0',
  borderStrong: '#D1D1CC',
  textPrimary: '#1A1A18',
  textSecondary: '#6B6B66',
  textTertiary: '#9C9C96',
  textInverse: '#FFFFFF',
} as const

/** @deprecated See lightTheme.success/warning/error/info in colors.ts. */
export const semanticColors = {
  success: '#2D7A3A',
  warning: '#B8860B',
  error: '#C4372C',
  info: '#2563A0',
} as const

export const duration = {
  micro: 75,
  short: 200,
  medium: 325,
  long: 550,
} as const

/**
 * Centralized spring configs for `Animated.spring` (useNativeDriver-safe).
 * `press` is tuned for tap-feedback release: snappy, with a barely-there
 * settle (minimal overshoot) so touches feel physical rather than linear —
 * the iOS-native press feel. Use these instead of hand-rolled timing so
 * motion stays consistent across every pressable in the app.
 */
export const spring = {
  press: { stiffness: 340, damping: 24, mass: 0.85 },
  gentle: { stiffness: 180, damping: 22, mass: 1 },
} as const

export const lineHeight = {
  '2xs': 14,
  xs: 17,
  sm: 20,
  md: 24,
  lg: 24,
  xl: 26,
  '2xl': 30,
  '3xl': 38,
} as const

export const fonts = {
  body: 'DMSans_400Regular',
  label: 'DMSans_500Medium',
  heading: 'DMSans_700Bold',
  data: 'GeistMono_400Regular',
} as const

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const

export const TAB_BAR_CLEARANCE = 24 as const

export const hairline = StyleSheet.hairlineWidth

/**
 * Depth contract: content surfaces stay flat and use borders, spacing, and
 * background contrast for hierarchy. Only controls that physically float
 * above content, such as FABs and transient overlays, receive a shadow.
 */
export const elevation = {
  flat: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  } satisfies ViewStyle,
  hairline: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 0.5 },
    elevation: 1,
  } satisfies ViewStyle,
  card: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  } satisfies ViewStyle,
  hero: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  } satisfies ViewStyle,
  cardInner: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  } satisfies ViewStyle,
  heroInner: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  } satisfies ViewStyle,
  fab: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  } satisfies ViewStyle,
  pill: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  } satisfies ViewStyle,
} as const

export const haptic = {
  selection: 'selection',
  tapLight: 'impactLight',
  tapMedium: 'impactMedium',
  tapHeavy: 'impactHeavy',
  success: 'notificationSuccess',
  warning: 'notificationWarning',
  error: 'notificationError',
} as const

export type HapticTone = keyof typeof haptic
