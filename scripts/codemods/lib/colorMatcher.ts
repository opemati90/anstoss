type RGB = { r: number; g: number; b: number }

function parseHex(hex: string): RGB | null {
  const m = hex.match(/^#([0-9a-fA-F]{3,8})$/)
  if (!m) return null
  let s = m[1]
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (s.length === 6 || s.length === 8) {
    const r = parseInt(s.slice(0, 2), 16)
    const g = parseInt(s.slice(2, 4), 16)
    const b = parseInt(s.slice(4, 6), 16)
    return { r, g, b }
  }
  return null
}

function parseRgba(value: string): RGB | null {
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!m) return null
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
}

function deltaE(a: RGB, b: RGB): number {
  // CIE76 simplified — sufficient for snap detection at the values we care about.
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr * 0.5 + dg * dg + db * db * 0.7)
}

export type TokenMap = Record<string, string>

export function findNearestToken(
  literal: string,
  tokens: TokenMap,
  opts: { ignoreAlpha?: boolean; tolerance?: number } = {},
): { name: string; deltaE: number } | null {
  const tolerance = opts.tolerance ?? 3
  const target = parseHex(literal) ?? parseRgba(literal)
  if (!target) return null
  let best: { name: string; deltaE: number } | null = null
  for (const [name, value] of Object.entries(tokens)) {
    const candidate = parseHex(value)
    if (!candidate) continue
    const d = deltaE(target, candidate)
    if (best === null || d < best.deltaE) best = { name, deltaE: d }
  }
  if (!best) return null
  return best.deltaE <= tolerance ? best : null
}
