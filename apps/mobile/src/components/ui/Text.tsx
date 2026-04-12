import React from 'react'
import {
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
  StyleSheet,
} from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import type { ClubTheme } from '../../theme/club-theme'
import { fontSize, fonts, letterSpacing, lineHeight } from '../../theme/tokens'

/**
 * Semantic typography primitive aligned to Apple HIG text styles.
 *
 * Pick a `variant` — fontFamily, size, line-height, tracking, and default
 * weight are resolved from the design tokens in one place. Never set
 * `fontFamily` / `fontSize` / `lineHeight` inline at a call site; override
 * via `weight`, `color`, or `tracking` props instead.
 *
 * Variants map to Apple's Dynamic Type scale:
 *
 *   largeTitle   — 34, tightest, heading weight        (screen titles)
 *   title1       — 28, tight, heading weight           (hero name)
 *   title2       — 24, tight, heading weight           (section leads)
 *   title3       — 20, tight, heading weight           (card titles)
 *   headline     — 18, normal, label weight            (row headlines)
 *   body         — 16, normal, body weight             (paragraphs)
 *   callout      — 16, normal, label weight            (emphasized body)
 *   subheadline  — 14, normal, label weight            (meta under title)
 *   footnote     — 13, normal, body weight             (timestamps, hints)
 *   caption1     — 12, normal, body weight             (labels)
 *   caption2     — 11, wide,   label weight            (eyebrow labels)
 *   data         — 20, tight, monospace + tabular nums (scores, dues)
 *   dataLarge    — 34, tightest, monospace + tabular   (hero numbers)
 */
export type TextVariant =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subheadline'
  | 'footnote'
  | 'caption1'
  | 'caption2'
  | 'data'
  | 'dataLarge'

export type TextColor =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'inverse'
  | 'tint' // club primary
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | string // raw hex fallthrough

export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold'

export interface TextProps extends Omit<RNTextProps, 'style'> {
  variant?: TextVariant
  color?: TextColor
  weight?: TextWeight
  tracking?: keyof typeof letterSpacing
  align?: 'left' | 'center' | 'right'
  /**
   * Enable tabular figures (monospaced numerals) on any variant. Already
   * enabled automatically for `data` and `dataLarge` variants.
   */
  tabular?: boolean
  /**
   * Opacity multiplier — useful for hero labels where the "eyebrow" text
   * should feel lighter than secondary text.
   */
  muted?: boolean
  /**
   * Optional style override. Avoid fontFamily/fontSize/lineHeight here —
   * use variant/weight/color props instead.
   */
  style?: TextStyle | TextStyle[]
}

interface VariantStyle {
  fontSize: number
  lineHeight: number
  fontFamily: string
  letterSpacing: number
  defaultWeight: TextWeight
}

const VARIANTS: Record<TextVariant, VariantStyle> = {
  largeTitle: {
    fontSize: fontSize.display,
    lineHeight: 40,
    fontFamily: fonts.heading,
    letterSpacing: letterSpacing.tightest,
    defaultWeight: 'bold',
  },
  title1: {
    fontSize: fontSize['2xl'] + 4, // 28
    lineHeight: 34,
    fontFamily: fonts.heading,
    letterSpacing: letterSpacing.tight,
    defaultWeight: 'bold',
  },
  title2: {
    fontSize: fontSize['2xl'],
    lineHeight: 29,
    fontFamily: fonts.heading,
    letterSpacing: letterSpacing.tight,
    defaultWeight: 'semibold',
  },
  title3: {
    fontSize: fontSize.xl,
    lineHeight: 25,
    fontFamily: fonts.heading,
    letterSpacing: letterSpacing.tight,
    defaultWeight: 'semibold',
  },
  headline: {
    fontSize: fontSize.lg,
    lineHeight: 22,
    fontFamily: fonts.label,
    letterSpacing: letterSpacing.normal,
    defaultWeight: 'semibold',
  },
  body: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontFamily: fonts.body,
    letterSpacing: letterSpacing.normal,
    defaultWeight: 'regular',
  },
  callout: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontFamily: fonts.label,
    letterSpacing: letterSpacing.normal,
    defaultWeight: 'medium',
  },
  subheadline: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.label,
    letterSpacing: letterSpacing.normal,
    defaultWeight: 'medium',
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.body,
    letterSpacing: letterSpacing.normal,
    defaultWeight: 'regular',
  },
  caption1: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontFamily: fonts.body,
    letterSpacing: letterSpacing.normal,
    defaultWeight: 'regular',
  },
  caption2: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.label,
    letterSpacing: letterSpacing.wide,
    defaultWeight: 'medium',
  },
  data: {
    fontSize: fontSize.xl,
    lineHeight: 24,
    fontFamily: fonts.data,
    letterSpacing: letterSpacing.normal,
    defaultWeight: 'regular',
  },
  dataLarge: {
    fontSize: fontSize.display,
    lineHeight: 40,
    fontFamily: fonts.data,
    letterSpacing: letterSpacing.tight,
    defaultWeight: 'regular',
  },
}

// DM Sans weight → loaded font family name
const WEIGHT_BODY: Record<TextWeight, string> = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
}

function resolveFontFamily(
  variant: VariantStyle,
  weight: TextWeight | undefined,
): string {
  if (variant.fontFamily === fonts.data) return fonts.data // mono is single weight
  const effective = weight ?? variant.defaultWeight
  return WEIGHT_BODY[effective] ?? variant.fontFamily
}

function resolveColor(color: TextColor | undefined, c: ClubTheme): string {
  if (!color || color === 'primary') return c.textPrimary
  if (color === 'secondary') return c.textSecondary
  if (color === 'tertiary') return c.textTertiary
  if (color === 'inverse') return c.textInverse
  if (color === 'tint') return c.clubPrimary
  if (color === 'success') return c.success
  if (color === 'warning') return c.warning
  if (color === 'error') return c.error
  if (color === 'info') return c.info
  return color // raw hex or named RN color
}

export function Text({
  variant = 'body',
  color,
  weight,
  tracking,
  align,
  tabular,
  muted,
  style,
  children,
  allowFontScaling = true,
  ...rest
}: TextProps) {
  const c = useClubColors()
  const v = VARIANTS[variant]
  const isMono = v.fontFamily === fonts.data

  const composed: TextStyle = {
    fontSize: v.fontSize,
    lineHeight: v.lineHeight,
    fontFamily: resolveFontFamily(v, weight),
    letterSpacing: tracking != null ? letterSpacing[tracking] : v.letterSpacing,
    color: resolveColor(color, c),
    textAlign: align,
    opacity: muted ? 0.72 : undefined,
    ...(isMono || tabular || variant === 'data' || variant === 'dataLarge'
      ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] }
      : null),
  }

  return (
    <RNText
      allowFontScaling={allowFontScaling}
      style={[composed, style as TextStyle | TextStyle[]]}
      {...rest}
    >
      {children}
    </RNText>
  )
}

// Re-export helpers for consumers that want direct access to tokens
export { VARIANTS as TEXT_VARIANTS }

// Display helper — a subtle default so `<Text>Hello</Text>` still renders
// sensibly with body variant applied.
Text.displayName = 'Text'

// eslint: unused StyleSheet import guard — kept to reserve namespace for
// future variant-specific StyleSheet.create() optimisations.
void StyleSheet
