/**
 * Typography tokens — adapted from Renuir's typography.ts.
 *
 * DM Sans only for interface text. Geist Mono is reserved for numeric data
 * (match scores, kick-off times, dues amounts) and is not declared here —
 * use `fonts.data` from tokens.ts.
 *
 * TextStyles bake in a default color (TEXT_PRIMARY / TEXT_SECONDARY / etc.).
 * Components that need dark-mode-aware color override it from useClubColors().
 */
import { ms } from './scale'
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  TEXT_WHITE,
} from './colors'

// ─── Font Families ───────────────────────────────────────────────────────────
export const FONT_FAMILY_REGULAR = 'DMSans_400Regular'
export const FONT_FAMILY_MEDIUM = 'DMSans_500Medium'
export const FONT_FAMILY_BOLD = 'DMSans_700Bold'

// ─── Font Sizes (7-step scale, ~1.25 ratio) ─────────────────────────────────
export const FONT_SIZE_DISPLAY = ms(32)
export const FONT_SIZE_H1 = ms(24)
export const FONT_SIZE_H2 = ms(20)
export const FONT_SIZE_BODY = ms(16)
export const FONT_SIZE_BODY_SMALL = ms(14)
export const FONT_SIZE_CAPTION = ms(12)
export const FONT_SIZE_MICRO = ms(10)

// Named exception above the standard scale: match-context score numerals are
// the loudest piece of data on the screen and benefit from being bigger than
// `display`. Used in MatchHero and live ticker only.
export const FONT_SIZE_SCORE = ms(38)

// ─── Letter Spacing ─────────────────────────────────────────────────────────
export const LETTER_SPACING_TIGHTER = -0.5
export const LETTER_SPACING_TIGHT = -0.3
export const LETTER_SPACING_SNUG = -0.2
export const LETTER_SPACING_NORMAL = 0
export const LETTER_SPACING_WIDE = 0.3
export const LETTER_SPACING_WIDER = 0.4

// ─── Font Weights ────────────────────────────────────────────────────────────
export const FONT_WEIGHT_REGULAR = '400' as const
export const FONT_WEIGHT_MEDIUM = '500' as const
export const FONT_WEIGHT_BOLD = '700' as const

// ─── Line Heights ────────────────────────────────────────────────────────────
export const LINE_HEIGHT_TIGHT = 1.15
// Display sizes (24px+) need more head-room than tight allows — DM Sans
// Bold ascenders on tall digits ("1", "0", "1B") clip at the top of the
// line box when lineHeight is tight*fontSize. 1.3 keeps the cap-line
// inside the box without changing visual rhythm.
export const LINE_HEIGHT_DISPLAY = 1.3
export const LINE_HEIGHT_NORMAL = 1.4
export const LINE_HEIGHT_RELAXED = 1.6

// ─── Semantic Text Styles ────────────────────────────────────────────────────
export const TextStyles = {
  display: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: FONT_SIZE_DISPLAY,
    lineHeight: FONT_SIZE_DISPLAY * LINE_HEIGHT_DISPLAY,
    letterSpacing: LETTER_SPACING_TIGHTER,
    color: TEXT_PRIMARY,
  },
  h1: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: FONT_SIZE_H1,
    lineHeight: FONT_SIZE_H1 * LINE_HEIGHT_DISPLAY,
    letterSpacing: LETTER_SPACING_TIGHT,
    color: TEXT_PRIMARY,
  },
  h2: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: FONT_SIZE_H2,
    lineHeight: FONT_SIZE_H2 * LINE_HEIGHT_DISPLAY,
    letterSpacing: LETTER_SPACING_SNUG,
    color: TEXT_PRIMARY,
  },
  body: {
    fontFamily: FONT_FAMILY_REGULAR,
    fontSize: FONT_SIZE_BODY,
    lineHeight: FONT_SIZE_BODY * LINE_HEIGHT_NORMAL,
    letterSpacing: LETTER_SPACING_NORMAL,
    color: TEXT_PRIMARY,
  },
  bodyMedium: {
    fontFamily: FONT_FAMILY_MEDIUM,
    fontSize: FONT_SIZE_BODY,
    lineHeight: FONT_SIZE_BODY * LINE_HEIGHT_NORMAL,
    letterSpacing: LETTER_SPACING_NORMAL,
    color: TEXT_PRIMARY,
  },
  bodySmall: {
    fontFamily: FONT_FAMILY_REGULAR,
    fontSize: FONT_SIZE_BODY_SMALL,
    lineHeight: FONT_SIZE_BODY_SMALL * LINE_HEIGHT_NORMAL,
    letterSpacing: 0.1,
    color: TEXT_SECONDARY,
  },
  caption: {
    fontFamily: FONT_FAMILY_MEDIUM,
    fontSize: FONT_SIZE_CAPTION,
    lineHeight: FONT_SIZE_CAPTION * LINE_HEIGHT_RELAXED,
    letterSpacing: LETTER_SPACING_WIDE,
    color: TEXT_SECONDARY,
  },
  micro: {
    fontFamily: FONT_FAMILY_REGULAR,
    fontSize: FONT_SIZE_MICRO,
    lineHeight: FONT_SIZE_MICRO * LINE_HEIGHT_RELAXED,
    letterSpacing: LETTER_SPACING_WIDER,
    color: TEXT_TERTIARY,
  },
  button: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: FONT_SIZE_BODY,
    letterSpacing: 0.2,
    color: TEXT_WHITE,
  },
  buttonSmall: {
    fontFamily: FONT_FAMILY_MEDIUM,
    fontSize: FONT_SIZE_BODY_SMALL,
    letterSpacing: 0.1,
  },
  input: {
    fontFamily: FONT_FAMILY_REGULAR,
    fontSize: FONT_SIZE_BODY,
    lineHeight: FONT_SIZE_BODY * LINE_HEIGHT_NORMAL,
    color: TEXT_PRIMARY,
  },
  tabLabel: {
    fontFamily: FONT_FAMILY_MEDIUM,
    fontSize: FONT_SIZE_CAPTION,
    letterSpacing: LETTER_SPACING_WIDE,
  },
  tag: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: FONT_SIZE_MICRO,
    letterSpacing: 1.0,
    textTransform: 'uppercase' as const,
  },
} as const

export const Typography = {
  size: {
    display: FONT_SIZE_DISPLAY,
    h1: FONT_SIZE_H1,
    h2: FONT_SIZE_H2,
    body: FONT_SIZE_BODY,
    bodySmall: FONT_SIZE_BODY_SMALL,
    caption: FONT_SIZE_CAPTION,
    micro: FONT_SIZE_MICRO,
  },
  weight: {
    regular: FONT_WEIGHT_REGULAR,
    medium: FONT_WEIGHT_MEDIUM,
    bold: FONT_WEIGHT_BOLD,
  },
  lineHeight: {
    tight: LINE_HEIGHT_TIGHT,
    normal: LINE_HEIGHT_NORMAL,
    relaxed: LINE_HEIGHT_RELAXED,
  },
  letterSpacing: {
    tighter: LETTER_SPACING_TIGHTER,
    tight: LETTER_SPACING_TIGHT,
    snug: LETTER_SPACING_SNUG,
    normal: LETTER_SPACING_NORMAL,
    wide: LETTER_SPACING_WIDE,
    wider: LETTER_SPACING_WIDER,
  },
  family: {
    regular: FONT_FAMILY_REGULAR,
    medium: FONT_FAMILY_MEDIUM,
    bold: FONT_FAMILY_BOLD,
  },
  styles: TextStyles,
} as const

export default Typography
