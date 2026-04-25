import React from 'react'
import {
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
  StyleSheet,
} from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba, type ClubTheme } from '../../theme/club-theme'
import { letterSpacing, fonts } from '../../theme/tokens'
import {
  FONT_SIZE_DISPLAY,
  FONT_SIZE_H1,
  FONT_SIZE_H2,
  FONT_SIZE_BODY,
  FONT_SIZE_BODY_SMALL,
  FONT_SIZE_CAPTION,
  FONT_SIZE_MICRO,
  LINE_HEIGHT_TIGHT,
  LINE_HEIGHT_NORMAL,
  LINE_HEIGHT_RELAXED,
  LETTER_SPACING_TIGHTER,
  LETTER_SPACING_TIGHT,
  LETTER_SPACING_SNUG,
  LETTER_SPACING_NORMAL,
  LETTER_SPACING_WIDE,
  FONT_FAMILY_REGULAR,
  FONT_FAMILY_MEDIUM,
  FONT_FAMILY_BOLD,
} from '../../theme/typography'

/**
 * Typography primitive.
 *
 * As of 2026-04-17 the variant sizes/weights are sourced from the Renuir-
 * derived typography scale (display/h1/h2/body/bodySmall/caption/micro).
 * The Apple-HIG variant names are preserved so existing call sites keep
 * compiling; they map onto the Renuir scale as follows:
 *
 *   Apple-HIG name  →  Renuir scale  →  base size
 *   largeTitle      →  display        →  32
 *   title1          →  display (tight) →  32
 *   title2          →  h1             →  24
 *   title3          →  h2             →  20
 *   headline        →  bodyMedium     →  16 (medium weight)
 *   body            →  body           →  16
 *   callout         →  bodyMedium     →  16 (medium weight)
 *   subheadline     →  bodySmall      →  14
 *   footnote        →  bodySmall      →  14
 *   caption1        →  caption        →  12
 *   caption2        →  micro (wide)   →  10
 *   data            →  h2 mono        →  20 (Geist Mono)
 *   dataLarge       →  display mono   →  32 (Geist Mono)
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
  | 'inverseMuted'
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
  tabular?: boolean
  muted?: boolean
  style?: TextStyle | TextStyle[]
}

interface VariantStyle {
  fontSize: number
  lineHeight: number
  fontFamily: string
  letterSpacing: number
  defaultWeight: TextWeight
  isMono?: boolean
}

const VARIANTS: Record<TextVariant, VariantStyle> = {
  largeTitle: {
    fontSize: FONT_SIZE_DISPLAY,
    lineHeight: FONT_SIZE_DISPLAY * LINE_HEIGHT_TIGHT,
    fontFamily: FONT_FAMILY_BOLD,
    letterSpacing: LETTER_SPACING_TIGHTER,
    defaultWeight: 'bold',
  },
  title1: {
    fontSize: FONT_SIZE_DISPLAY,
    lineHeight: FONT_SIZE_DISPLAY * LINE_HEIGHT_TIGHT,
    fontFamily: FONT_FAMILY_BOLD,
    letterSpacing: LETTER_SPACING_TIGHT,
    defaultWeight: 'bold',
  },
  title2: {
    fontSize: FONT_SIZE_H1,
    lineHeight: FONT_SIZE_H1 * LINE_HEIGHT_TIGHT,
    fontFamily: FONT_FAMILY_BOLD,
    letterSpacing: LETTER_SPACING_TIGHT,
    defaultWeight: 'bold',
  },
  title3: {
    fontSize: FONT_SIZE_H2,
    lineHeight: FONT_SIZE_H2 * LINE_HEIGHT_TIGHT,
    fontFamily: FONT_FAMILY_BOLD,
    letterSpacing: LETTER_SPACING_SNUG,
    defaultWeight: 'bold',
  },
  headline: {
    fontSize: FONT_SIZE_BODY,
    lineHeight: FONT_SIZE_BODY * LINE_HEIGHT_NORMAL,
    fontFamily: FONT_FAMILY_MEDIUM,
    letterSpacing: LETTER_SPACING_NORMAL,
    defaultWeight: 'medium',
  },
  body: {
    fontSize: FONT_SIZE_BODY,
    lineHeight: FONT_SIZE_BODY * LINE_HEIGHT_NORMAL,
    fontFamily: FONT_FAMILY_REGULAR,
    letterSpacing: LETTER_SPACING_NORMAL,
    defaultWeight: 'regular',
  },
  callout: {
    fontSize: FONT_SIZE_BODY,
    lineHeight: FONT_SIZE_BODY * LINE_HEIGHT_NORMAL,
    fontFamily: FONT_FAMILY_MEDIUM,
    letterSpacing: LETTER_SPACING_NORMAL,
    defaultWeight: 'medium',
  },
  subheadline: {
    fontSize: FONT_SIZE_BODY_SMALL,
    lineHeight: FONT_SIZE_BODY_SMALL * LINE_HEIGHT_NORMAL,
    fontFamily: FONT_FAMILY_MEDIUM,
    letterSpacing: 0.1,
    defaultWeight: 'medium',
  },
  footnote: {
    fontSize: FONT_SIZE_BODY_SMALL,
    lineHeight: FONT_SIZE_BODY_SMALL * LINE_HEIGHT_NORMAL,
    fontFamily: FONT_FAMILY_REGULAR,
    letterSpacing: 0.1,
    defaultWeight: 'regular',
  },
  caption1: {
    fontSize: FONT_SIZE_CAPTION,
    lineHeight: FONT_SIZE_CAPTION * LINE_HEIGHT_RELAXED,
    fontFamily: FONT_FAMILY_MEDIUM,
    letterSpacing: LETTER_SPACING_WIDE,
    defaultWeight: 'medium',
  },
  caption2: {
    fontSize: FONT_SIZE_MICRO,
    lineHeight: FONT_SIZE_MICRO * LINE_HEIGHT_RELAXED,
    fontFamily: FONT_FAMILY_MEDIUM,
    letterSpacing: LETTER_SPACING_WIDE,
    defaultWeight: 'medium',
  },
  data: {
    fontSize: FONT_SIZE_H2,
    lineHeight: FONT_SIZE_H2 * LINE_HEIGHT_TIGHT,
    fontFamily: fonts.data,
    letterSpacing: LETTER_SPACING_NORMAL,
    defaultWeight: 'regular',
    isMono: true,
  },
  dataLarge: {
    fontSize: FONT_SIZE_DISPLAY,
    lineHeight: FONT_SIZE_DISPLAY * LINE_HEIGHT_TIGHT,
    fontFamily: fonts.data,
    letterSpacing: LETTER_SPACING_TIGHT,
    defaultWeight: 'regular',
    isMono: true,
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
  if (variant.isMono) return variant.fontFamily
  const effective = weight ?? variant.defaultWeight
  return WEIGHT_BODY[effective] ?? variant.fontFamily
}

function resolveColor(color: TextColor | undefined, c: ClubTheme): string {
  if (!color || color === 'primary') return c.textPrimary
  if (color === 'secondary') return c.textSecondary
  if (color === 'tertiary') return c.textTertiary
  if (color === 'inverse') return c.textInverse
  if (color === 'inverseMuted') return hexToRgba(c.textInverse, 0.7)
  if (color === 'tint') return c.primary
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

  const composed: TextStyle = {
    fontSize: v.fontSize,
    lineHeight: v.lineHeight,
    fontFamily: resolveFontFamily(v, weight),
    letterSpacing: tracking != null ? letterSpacing[tracking] : v.letterSpacing,
    color: resolveColor(color, c),
    textAlign: align,
    opacity: muted ? 0.72 : undefined,
    ...(v.isMono || tabular
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

export { VARIANTS as TEXT_VARIANTS }

Text.displayName = 'Text'

void StyleSheet
