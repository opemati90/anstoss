export const SPACING_TOKENS: Record<string, number> = {
  SPACING_XXS: 2,
  SPACING_XS: 4,
  SPACING_SM: 8,
  SPACING_MD: 12,
  SPACING_LG: 16,
  SPACING_XL: 20,
  SPACING_XXL: 24,
  SPACING_XXXL: 32,
  RADIUS_SM: 8,
  RADIUS_MD: 12,
  RADIUS_LG: 16,
  RADIUS_XL: 20,
}

const EXEMPT_VALUES = new Set([0, 1])

export function findNearestSpacingToken(
  value: number,
  tokens: Record<string, number>,
  opts: { tolerance?: number } = {},
): { name: string; delta: number } | null {
  if (EXEMPT_VALUES.has(value)) return { name: '__exempt__', delta: 0 }
  const tolerance = opts.tolerance ?? 2
  let best: { name: string; delta: number } | null = null
  for (const [name, val] of Object.entries(tokens)) {
    const delta = value - val
    if (best === null || Math.abs(delta) < Math.abs(best.delta)) {
      best = { name, delta }
    }
  }
  if (!best) return null
  return Math.abs(best.delta) < tolerance ? best : null
}
