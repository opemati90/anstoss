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
  LINE_HEIGHT_TIGHT,
  LINE_HEIGHT_DISPLAY,
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
  FONT_FAMILY_SEMIBOLD,
  FONT_FAMILY_DISPLAY,
  FONT_SIZE_HERO,
  FONT_SIZE_MICRO,
  LINE_HEIGHT_HERO,
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
 *   caption2        →  caption (wide) →  13
 *   data            →  numbers        →  23 (Barlow Condensed)
 *   dataLarge       →  numbers        →  36 (Barlow Condensed)
 *   display         →  hero headline  →  54 (Barlow Condensed, caps)
 *   label           →  section label  →  12 (Inter semibold, caps)
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
  | 'display'
  | 'label'

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
  uppercase?: boolean
}

const VARIANTS: Record<TextVariant, VariantStyle> = {
  largeTitle: {
    fontSize: FONT_SIZE_DISPLAY,
    lineHeight: FONT_SIZE_DISPLAY * 1.1,
    fontFamily: FONT_FAMILY_BOLD,
    letterSpacing: -0.75,
    defaultWeight: 'bold',
  },
  title1: {
    fontSize: FONT_SIZE_DISPLAY,
    lineHeight: FONT_SIZE_DISPLAY * 1.1,
    fontFamily: FONT_FAMILY_BOLD,
    letterSpacing: -0.75,
    defaultWeight: 'bold',
  },
  title2: {
    fontSize: FONT_SIZE_H1,
    lineHeight: FONT_SIZE_H1 * LINE_HEIGHT_DISPLAY,
    fontFamily: FONT_FAMILY_BOLD,
    letterSpacing: LETTER_SPACING_TIGHT,
    defaultWeight: 'bold',
  },
  title3: {
    fontSize: FONT_SIZE_H2,
    lineHeight: FONT_SIZE_H2 * LINE_HEIGHT_DISPLAY,
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
    lineHeight: FONT_SIZE_CAPTION * LINE_HEIGHT_NORMAL,
    fontFamily: FONT_FAMILY_MEDIUM,
    letterSpacing: LETTER_SPACING_NORMAL,
    defaultWeight: 'medium',
  },
  // caption2 used to be the 10pt micro size. It now shares the 13pt caption
  // floor; FONT_SIZE_MICRO (12) is reserved for tab labels and count badges.
  caption2: {
    fontSize: FONT_SIZE_CAPTION,
    lineHeight: FONT_SIZE_CAPTION * LINE_HEIGHT_NORMAL,
    fontFamily: FONT_FAMILY_MEDIUM,
    letterSpacing: LETTER_SPACING_NORMAL,
    defaultWeight: 'medium',
  },
  data: {
    fontSize: FONT_SIZE_H2 + 3,
    lineHeight: (FONT_SIZE_H2 + 3) * LINE_HEIGHT_TIGHT,
    fontFamily: fonts.data,
    letterSpacing: LETTER_SPACING_NORMAL,
    defaultWeight: 'bold',
    isMono: true,
  },
  dataLarge: {
    fontSize: FONT_SIZE_DISPLAY + 4,
    lineHeight: (FONT_SIZE_DISPLAY + 4) * LINE_HEIGHT_TIGHT,
    fontFamily: fonts.data,
    letterSpacing: LETTER_SPACING_NORMAL,
    defaultWeight: 'bold',
    isMono: true,
  },
  // Condensed uppercase headline (welcome claim, next-up kick-off). Size it
  // per use with `style={{ fontSize }}`; lineHeight follows via LINE_HEIGHT_HERO.
  display: {
    fontSize: FONT_SIZE_HERO,
    lineHeight: FONT_SIZE_HERO * LINE_HEIGHT_HERO,
    fontFamily: FONT_FAMILY_DISPLAY,
    letterSpacing: LETTER_SPACING_NORMAL,
    defaultWeight: 'bold',
    isMono: true,
    uppercase: true,
  },
  // Section label above a group ("VOR DEM SPIEL").
  label: {
    fontSize: FONT_SIZE_MICRO,
    lineHeight: FONT_SIZE_MICRO * LINE_HEIGHT_NORMAL,
    fontFamily: FONT_FAMILY_SEMIBOLD,
    letterSpacing: 0.85,
    defaultWeight: 'semibold',
    uppercase: true,
  },
}

// Inter weight → loaded font family name
const WEIGHT_BODY: Record<TextWeight, string> = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
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

// Dynamic Type: text scales with the user's iOS/Android setting, capped per
// role so large accessibility sizes stay legible without breaking layouts.
const MAX_FONT_SCALE: Record<TextVariant, number> = {
  largeTitle: 1.4,
  title1: 1.4,
  title2: 1.4,
  title3: 1.5,
  headline: 1.8,
  body: 1.8,
  callout: 1.8,
  subheadline: 1.8,
  footnote: 1.8,
  caption1: 1.6,
  caption2: 1.6,
  data: 1.3,
  dataLarge: 1.2,
  display: 1.2,
  label: 1.6,
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
  maxFontSizeMultiplier,
  ...rest
}: TextProps) {
  const c = useClubColors()
  const v = VARIANTS[variant]

  const composed: TextStyle = {
    fontSize: v.fontSize,
    lineHeight: v.lineHeight,
    fontFamily: resolveFontFamily(v, weight),
    letterSpacing: tracking != null ? letterSpacing[tracking] : v.letterSpacing,
    color: resolveColor(color ?? (variant === 'label' ? 'secondary' : undefined), c),
    textAlign: align,
    opacity: muted ? 0.72 : undefined,
    textTransform: v.uppercase ? 'uppercase' : undefined,
    ...(v.isMono || tabular
      ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] }
      : null),
  }

  // A display headline resized per use keeps its solid leading.
  const flat = StyleSheet.flatten(style as TextStyle | TextStyle[] | undefined)
  if (variant === 'display' && flat?.fontSize && flat.lineHeight == null) {
    composed.lineHeight = flat.fontSize * LINE_HEIGHT_HERO
  }

  return (
    <RNText
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE[variant]}
      style={[composed, style as TextStyle | TextStyle[]]}
      {...rest}
    >
      {children}
    </RNText>
  )
}

export { VARIANTS as TEXT_VARIANTS }

Text.displayName = 'Text'

