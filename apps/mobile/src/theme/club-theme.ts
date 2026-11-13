import { lightTheme, darkTheme, type AppTheme } from './colors'

/**
 * Club theme configuration — fetched from API, cached in AsyncStorage.
 *
 * Each club provides:
 *   - primary: hex color (extracted from badge or set by coach)
 *   - name: club name
 *   - badgeUrl: R2 URL for club badge
 *
 * The theme engine derives primaryPressed (15% darker) and primary50
 * (10% opacity) from the club primary automatically.
 */
export interface ClubConfig {
  id: string
  name: string
  primary: string
  badgeUrl: string | null
}

/**
 * The live theme object consumed by useClubColors().
 *
 * Shape extends the Renuir-derived AppTheme (colors.ts → lightTheme) with
 * legacy aliases (`clubPrimary`, `clubPrimaryLight`, `clubPrimaryDark`) that
 * pre-date the Renuir adoption. Both naming conventions resolve to the same
 * values; prefer `primary` / `primary50` / `primaryPressed` in new code.
 */
export interface ClubTheme extends AppTheme {
  // Legacy aliases — keep until the full Phase 6 migration sweep is done.
  clubPrimary: string
  clubPrimaryLight: string
  clubPrimaryDark: string
}

export function buildClubTheme(
  club: ClubConfig | null,
  isDark: boolean,
): ClubTheme {
  const base = isDark ? darkTheme : lightTheme

  // Hydrate the primary slot from the club if one is active; otherwise use
  // the base theme's fallback (pitch green). In dark mode a dark club
  // colour (navy, bottle green, charcoal) vanishes against the surface, so
  // it is lifted until it can carry a filled button and a selected state.
  // Club colours are corrected in BOTH modes: yellow/white Vereinsfarben are
  // darkened on light backgrounds, navy/bottle-green lifted on dark ones, so
  // the accent can always carry a filled button and a selected state.
  const primary = club?.primary
    ? isDark
      ? ensureDarkModeContrast(club.primary)
      : ensureLightModeContrast(club.primary)
    : base.primary
  const primaryPressed = club?.primary
    ? darkenHex(club.primary, 0.15)
    : base.primaryPressed
  const primary50 = club?.primary
    ? hexToRgba(club.primary, 0.1)
    : base.primary50

  return {
    ...base,
    primary,
    primaryPressed,
    primary50,
    onPrimary: onColor(primary),
    // The hero keeps the raw club colour in both modes (DESIGN.md → Color).
    heroBg: club?.primary && /^#[0-9a-fA-F]{6}$/.test(club.primary) ? club.primary : base.heroBg,
    onHeroBg: onColor(
      club?.primary && /^#[0-9a-fA-F]{6}$/.test(club.primary) ? club.primary : base.heroBg,
    ),
    // Legacy aliases
    clubPrimary: primary,
    clubPrimaryLight: primary50,
    clubPrimaryDark: primaryPressed,
  }
}

/**
 * Convert hex to rgba string with given opacity.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Relative luminance (sRGB), 0 = black, 1 = white. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** Mix a hex colour toward white by `amount` (0-1). */
function lightenHex(hex: string, amount: number): string {
  const mix = (i: number) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) + (255 - parseInt(hex.slice(i, i + 2), 16)) * amount)
  return `#${[1, 3, 5].map((i) => mix(i).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Lift a club colour until it reads on a dark surface. 0.3 luminance is
 * roughly where a filled button with dark text stops looking like a
 * disabled one; iterate rather than jump so hue survives.
 */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Pick white or near-black text for a fill, whichever contrasts more. */
export function onColor(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '#FFFFFF'
  return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#1A1A18')
    ? '#FFFFFF'
    : '#1A1A18'
}

/** Darken a club colour until it reaches 3:1 against the light background. */
export function ensureLightModeContrast(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  let out = hex
  for (let i = 0; i < 8 && contrastRatio(out, '#FAFAF8') < 3; i += 1) out = darkenHex(out, 0.15)
  return out
}

export function ensureDarkModeContrast(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  let out = hex
  for (let i = 0; i < 6 && luminance(out) < 0.3; i += 1) out = lightenHex(out, 0.22)
  return out
}

/**
 * Darken a hex color by a given amount (0-1).
 */
function darkenHex(hex: string, amount: number): string {
  const r = Math.max(
    0,
    Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)),
  )
  const g = Math.max(
    0,
    Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)),
  )
  const b = Math.max(
    0,
    Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)),
  )
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// ── home revamp: text-safe accent ──
/** Parse "#rrggbb" or "rgba(r, g, b, a)" into channels; null when unknown. */
function parseColor(value: string): { r: number; g: number; b: number; a: number } | null {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return {
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16),
      a: 1,
    }
  }
  const m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (!m) return null
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] == null ? 1 : Number(m[4]) }
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/** A (possibly translucent) tint composited over an opaque surface. */
function composite(tint: string, surface: string): string | null {
  const top = parseColor(tint)
  const base = parseColor(surface)
  if (!top || !base) return null
  const mix = (a: number, b: number) => a * top.a + b * (1 - top.a)
  return toHex(mix(top.r, base.r), mix(top.g, base.g), mix(top.b, base.b))
}

/**
 * The club colour adjusted so small text (12-15pt) reaches WCAG AA 4.5:1 on
 * `background` (an opaque surface or a translucent tint such as primary50
 * over that surface). Darkened on light surfaces, lifted on dark ones; hue is
 * kept by stepping rather than jumping. Returns the input unchanged when it
 * already passes or a colour cannot be parsed.
 */
export function textSafeAccent(accent: string, surface: string, background: string = surface): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return accent
  const bg = composite(background, surface)
  if (!bg) return accent
  const darkSurface = luminance(bg) < 0.2
  let out = accent
  for (let i = 0; i < 16 && contrastRatio(out, bg) < 4.5; i += 1) {
    out = darkSurface ? lightenHex(out, 0.15) : darkenHex(out, 0.12)
  }
  return out
}

/** Contrast ratio between two colours (hex or rgba over white). Exposed for specs. */
export function contrastBetween(fg: string, bg: string, surface = '#FFFFFF'): number {
  const a = composite(fg, surface)
  const b = composite(bg, surface)
  if (!a || !b) return 0
  return contrastRatio(a, b)
}
// ── end home revamp ──

/**
 * Fallback theme — renders immediately while club config loads.
 * Uses the Renuir indigo defaults from colors.ts.
 */
export const FALLBACK_THEME = buildClubTheme(null, false)
export const FALLBACK_THEME_DARK = buildClubTheme(null, true)
