/**
 * Token contrast audit — runs a WCAG AA check against the
 * critical text/background pairings in lightTheme and darkTheme.
 *
 * Usage: npx ts-node apps/mobile/scripts/check-contrast.ts
 */
import { darkTheme, lightTheme } from '../src/theme/colors'

const NORMAL_TEXT_AA = 4.5
const LARGE_TEXT_AA = 3.0

type Pair = {
  name: string
  fg: string
  bg: string
  size: 'normal' | 'large'
}

const PAIRS_LIGHT: Pair[] = [
  { name: 'textPrimary on background', fg: lightTheme.textPrimary, bg: lightTheme.background, size: 'normal' },
  { name: 'textPrimary on surface', fg: lightTheme.textPrimary, bg: lightTheme.surface, size: 'normal' },
  { name: 'textSecondary on background', fg: lightTheme.textSecondary, bg: lightTheme.background, size: 'normal' },
  { name: 'textSecondary on surface', fg: lightTheme.textSecondary, bg: lightTheme.surface, size: 'normal' },
  { name: 'textTertiary on background', fg: lightTheme.textTertiary, bg: lightTheme.background, size: 'large' },
  { name: 'textInverse on primary', fg: lightTheme.textInverse, bg: lightTheme.primary, size: 'normal' },
  { name: 'success on background', fg: lightTheme.success, bg: lightTheme.background, size: 'large' },
  { name: 'warning on background', fg: lightTheme.warning, bg: lightTheme.background, size: 'large' },
  { name: 'error on background', fg: lightTheme.error, bg: lightTheme.background, size: 'normal' },
]

const PAIRS_DARK: Pair[] = [
  { name: 'textPrimary on background (dark)', fg: darkTheme.textPrimary, bg: darkTheme.background, size: 'normal' },
  { name: 'textPrimary on surface (dark)', fg: darkTheme.textPrimary, bg: darkTheme.surface, size: 'normal' },
  { name: 'textSecondary on background (dark)', fg: darkTheme.textSecondary, bg: darkTheme.background, size: 'normal' },
  { name: 'textSecondary on surface (dark)', fg: darkTheme.textSecondary, bg: darkTheme.surface, size: 'normal' },
  { name: 'textTertiary on background (dark)', fg: darkTheme.textTertiary, bg: darkTheme.background, size: 'large' },
  { name: 'textInverse on primary (dark)', fg: darkTheme.textInverse, bg: darkTheme.primary, size: 'normal' },
  { name: 'success on background (dark)', fg: darkTheme.success, bg: darkTheme.background, size: 'large' },
  { name: 'warning on background (dark)', fg: darkTheme.warning, bg: darkTheme.background, size: 'large' },
  { name: 'error on background (dark)', fg: darkTheme.error, bg: darkTheme.background, size: 'normal' },
]

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return null
  const v = m[1]
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  }
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }) {
  const toLin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
}

function contrast(fg: string, bg: string): number | null {
  const f = hexToRgb(fg)
  const b = hexToRgb(bg)
  if (!f || !b) return null
  const lf = relativeLuminance(f)
  const lb = relativeLuminance(b)
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf]
  return (hi + 0.05) / (lo + 0.05)
}

function audit(pairs: Pair[]) {
  let failures = 0
  for (const p of pairs) {
    const ratio = contrast(p.fg, p.bg)
    const min = p.size === 'normal' ? NORMAL_TEXT_AA : LARGE_TEXT_AA
    if (ratio == null) {
      console.warn(`SKIP  ${p.name} — non-hex (fg=${p.fg}, bg=${p.bg})`)
      continue
    }
    const ok = ratio >= min
    if (!ok) failures++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${p.name.padEnd(40)}  ${ratio.toFixed(2)}:1 (need ${min}:1)`)
  }
  return failures
}

const total = audit(PAIRS_LIGHT) + audit(PAIRS_DARK)
if (total > 0) {
  console.error(`\n${total} contrast failures.`)
  process.exit(1)
}
console.log('\nAll pairings meet WCAG AA.')
