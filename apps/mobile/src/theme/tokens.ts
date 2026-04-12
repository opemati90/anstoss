/**
 * Anstoss design tokens — maps DESIGN.md to Apple-HIG-aligned primitives.
 *
 * Club-adaptive: neutrals are fixed, accent colors come from club config.
 * The club IS the brand — no fixed brand color.
 */

import { StyleSheet, type ViewStyle } from 'react-native'

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
  display: 34, // iOS large title
} as const

/**
 * Letter spacing tokens — Apple-style typography tuning.
 * Large titles/display sit tight (-0.4 to -0.8), eyebrow labels open up (+0.4).
 */
export const letterSpacing = {
  tightest: -0.8, // display size only
  tight: -0.4,    // large titles, headlines
  normal: 0,
  wide: 0.4,      // eyebrow labels, small caps
  widest: 1.2,    // all-caps micro labels
} as const

export const fontWeight = {
  regular: '400',
  medium: '500',
  bold: '700',
} as const

// Fixed neutral palette — warm grays from DESIGN.md
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

export const darkNeutralColors = {
  background: '#0F0F0E',
  surface: '#1A1A18',
  surfaceElevated: '#242422',
  border: '#2E2E2C',
  borderStrong: '#3A3A38',
  textPrimary: '#E8E8E4',
  textSecondary: '#9C9C96',
  textTertiary: '#6B6B66',
  textInverse: '#1A1A18',
} as const

export const semanticColors = {
  success: '#2D7A3A',
  warning: '#B8860B',
  error: '#C4372C',
  info: '#2563A0',
} as const

// Motion durations from DESIGN.md
export const duration = {
  micro: 75,
  short: 200,
  medium: 325,
  long: 550,
} as const

/**
 * Line-height tokens — computed from fontSize * ratio per DESIGN.md:
 * - Body text: 1.5x
 * - Headings: 1.2x
 * - Small/caption: 1.4x
 * - Data/mono: 1.3x
 */
export const lineHeight = {
  '2xs': 14,   // 10px * 1.4
  xs: 17,      // 12px * ~1.4
  sm: 20,      // 14px * ~1.43
  md: 24,      // 16px * 1.5
  lg: 24,      // 18px * 1.33 (heading)
  xl: 26,      // 20px * 1.3 (heading)
  '2xl': 30,   // 24px * 1.25 (heading)
  '3xl': 38,   // 32px * 1.19 (heading)
} as const

export const fonts = {
  body: 'DMSans_400Regular',
  label: 'DMSans_500Medium',
  heading: 'DMSans_600SemiBold',
  data: 'GeistMono_400Regular',
} as const

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const

export const chatColors = {
  bubbleOther: '#F0F0EB',
} as const

/**
 * Bottom breathing room for scrollable screens that sit above the tab bar.
 * Keep this tight so the last card/button clears the tab bar without floating.
 */
export const TAB_BAR_CLEARANCE = 24 as const

/**
 * Hairline stroke width — 0.5pt on iOS at 2x, 0.33pt at 3x.
 * Use this for all separator lines and subtle borders instead of 1px.
 */
export const hairline = StyleSheet.hairlineWidth

/**
 * iOS 13+ "continuous" corner curve — the squircle shape used everywhere
 * in Apple-designed UI. Apply via style prop: { borderCurve: 'continuous' }.
 */
export const cornerCurve = 'continuous' as const

/**
 * Layered shadow presets — Apple routinely uses two stacked shadows
 * (ambient + key) to avoid the flat, "web" look of single shadows.
 *
 * RN only supports one shadow per View, so `card` and `hero` are arrays:
 * apply the first shadow to the outer wrapper and the second to an inner
 * wrapper, or flatten into a single View with larger blur. The ShadowStack
 * helper in components/ui/Shadow.tsx handles this idiomatically.
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
    // ambient + soft key combined; tuned for warm background #FAFAF8
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  } satisfies ViewStyle,
  hero: {
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  } satisfies ViewStyle,
  // Paired overlay shadow — apply to an inner wrapper when you want
  // the Apple double-shadow (ambient crisp + soft depth) look.
  cardInner: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 0,
  } satisfies ViewStyle,
  heroInner: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 0,
  } satisfies ViewStyle,
} as const

/**
 * Haptic tokens — consumed by src/lib/haptics.ts.
 * Keep as string literals so they can be logged / stubbed in tests.
 */
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
