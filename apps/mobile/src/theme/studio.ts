/**
 * Matchday Studio tokens (boards 38–42, REVAMP_HANDOFF "Matchday Studio").
 *
 * A graphic is the club's own artwork: its colours come from the brand kit
 * and never follow the app's light/dark mode. Only the editor workspace and
 * the three style palettes live here.
 */
import type { StudioStyle } from '@anstoss/shared'
import { ACCENT, INK, TEXT_SECONDARY, TEXT_WHITE } from './colors'
import { ensureLightModeContrast, hexToRgba, onColor } from './club-theme'

/** The editor's dark workspace behind the graphic. Same in both modes. */
export const STUDIO_WORKSPACE = '#0B100D'
export const STUDIO_ON_WORKSPACE = TEXT_WHITE
export const STUDIO_WORKSPACE_MUTED = '#A9B8B0'
export const STUDIO_WORKSPACE_RING = 'rgba(255, 255, 255, 0.22)'
export const STUDIO_WORKSPACE_FILL = 'rgba(255, 255, 255, 0.12)'
export const STUDIO_WORKSPACE_SEG = 'rgba(255, 255, 255, 0.08)'
export const STUDIO_WORKSPACE_SHADOW = '#000000'

/** Kreide style paper, and the brand kit's "Hell" swatch. */
export const STUDIO_CHALK = '#F1EEE4'
export const STUDIO_INK = INK
export const STUDIO_ACCENT = ACCENT
/** Third Flutlicht accent an AI variant may pick. */
export const STUDIO_GOLD = '#F2C94C'
/** Opponent crest when the match record carries no colour. */
export const STUDIO_OPPONENT_FALLBACK = '#3F4453'
/** Dark scrim on the clip overlay tile. */
export const STUDIO_CLIP_SCRIM = 'rgba(0, 0, 0, 0.45)'
export const STUDIO_CLIP_BUG = 'rgba(11, 16, 13, 0.85)'
export const STUDIO_TRANSPARENT = 'rgba(0, 0, 0, 0)'
/** Lime on ink for the "Verbunden" tag and "kostenlos". */
export const STUDIO_POSITIVE_BG = '#EEF1E6'
export const STUDIO_POSITIVE_FG = '#2E3B13'
export const STUDIO_POSITIVE_FG_DARK = ACCENT
export const STUDIO_DASH = '#B9BDB5'

export type StudioPalette = {
  /** Full-bleed background. */
  bg: string
  /** Derby: the dark half right of the diagonal. Null for flat styles. */
  split: string | null
  fg: string
  /** Kicker, highlighted time, "Tor!". */
  ac: string
  sub: string
  /** Hairlines, ghost numerals, silhouette. */
  line: string
  /** Faint pitch markings (Flutlicht). */
  deco: string
  /** Lime stripe (Derby) / chalk strokes (Kreide). */
  decoStrong: string
  /** Crest outline. */
  crestRing: string
  /** Score chip on the Tor template. */
  chipBg: string
  chipFg: string
}

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * The three v1 styles, all derived from the club colour so no two clubs look
 * the same. `accent` is an AI variant's override inside the style.
 */
export function buildStudioPalette(
  style: StudioStyle,
  clubColor: string,
  accent?: string | null,
): StudioPalette {
  const club = HEX.test(clubColor) ? clubColor : '#0E3B2B'
  const fg = onColor(club) === TEXT_WHITE ? TEXT_WHITE : INK
  const onDark = fg === TEXT_WHITE
  if (style === 'KREIDE') {
    const ac = accent && HEX.test(accent) ? accent : ensureLightModeContrast(club)
    return {
      bg: STUDIO_CHALK,
      split: null,
      fg: INK,
      ac,
      sub: TEXT_SECONDARY,
      line: hexToRgba(INK, 0.14),
      deco: hexToRgba(INK, 0.08),
      decoStrong: hexToRgba(ac, 0.35),
      crestRing: hexToRgba(TEXT_WHITE, 0.55),
      chipBg: INK,
      chipFg: TEXT_WHITE,
    }
  }
  if (style === 'DERBY') {
    return {
      bg: club,
      split: INK,
      fg: TEXT_WHITE,
      ac: accent && HEX.test(accent) ? accent : TEXT_WHITE,
      sub: hexToRgba(TEXT_WHITE, 0.74),
      line: hexToRgba(TEXT_WHITE, 0.18),
      deco: hexToRgba(TEXT_WHITE, 0.08),
      decoStrong: ACCENT,
      crestRing: hexToRgba(TEXT_WHITE, 0.55),
      chipBg: TEXT_WHITE,
      chipFg: INK,
    }
  }
  return {
    bg: club,
    split: null,
    fg,
    ac: accent && HEX.test(accent) ? accent : onDark ? ACCENT : INK,
    sub: hexToRgba(fg, 0.72),
    line: hexToRgba(fg, 0.16),
    deco: hexToRgba(fg, 0.08),
    decoStrong: ACCENT,
    crestRing: hexToRgba(fg, 0.55),
    chipBg: fg,
    chipFg: onDark ? INK : TEXT_WHITE,
  }
}
