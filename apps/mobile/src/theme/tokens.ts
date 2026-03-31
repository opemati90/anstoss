/**
 * Anstoss design tokens — maps DESIGN.md to Tamagui token format.
 *
 * Club-adaptive: neutrals are fixed, accent colors come from club config.
 * The club IS the brand — no fixed brand color.
 */

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
  sm: 4,
  md: 8,
  lg: 12,
  full: 9999,
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

export const fonts = {
  body: 'DMSans_400Regular',
  label: 'DMSans_500Medium',
  heading: 'DMSans_700Bold',
  data: 'GeistMono_400Regular',
} as const

export const chatColors = {
  bubbleOther: '#F0F0EB',
} as const
