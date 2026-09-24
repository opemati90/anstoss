/**
 * Formations a player or coach can draw as a lineup card in a DM. Position
 * codes are stored (language-neutral) and rendered through
 * chatThread.positions.<CODE>; free-text positions from saved event lineups
 * (e.g. "IV") render as typed.
 */
export const FORMATIONS: Record<string, string[]> = {
  '4-4-2': ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
  '4-3-3': ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW'],
  '4-2-3-1': ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'LM', 'CAM', 'RM', 'ST'],
  '4-1-4-1': ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'LM', 'CM', 'CM', 'RM', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'LWB', 'CM', 'CDM', 'CM', 'RWB', 'ST', 'ST'],
  '3-4-3': ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'LW', 'ST', 'RW'],
  '5-3-2': ['GK', 'LWB', 'CB', 'CB', 'CB', 'RWB', 'CM', 'CM', 'CM', 'ST', 'ST'],
  // Kleinfeld (7er) for the youth teams.
  '2-3-1': ['GK', 'CB', 'CB', 'LM', 'CM', 'RM', 'ST'],
  '3-2-1': ['GK', 'LB', 'CB', 'RB', 'CM', 'CM', 'ST'],
}

export const FORMATION_KEYS = Object.keys(FORMATIONS)

export const POSITION_CODES = new Set([
  'GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST',
])

/** Lines from goal to attack: "4-4-2" → [1, 4, 4, 2]. */
export function formationLines(formation: string): number[] | null {
  if (!/^\d{1,2}(-\d{1,2}){1,4}$/.test(formation)) return null
  const outfield = formation.split('-').map((n) => Number.parseInt(n, 10))
  if (outfield.some((n) => !Number.isFinite(n) || n <= 0)) return null
  return [1, ...outfield]
}

/**
 * Split slots into pitch rows (goal first) when the count matches the
 * formation; null means "render as a list" (bench-less snapshot mismatch).
 */
export function slotsByLine<T>(formation: string, slots: T[]): T[][] | null {
  const lines = formationLines(formation)
  if (!lines) return null
  const total = lines.reduce((sum, n) => sum + n, 0)
  if (slots.length !== total) return null
  const out: T[][] = []
  let index = 0
  for (const count of lines) {
    out.push(slots.slice(index, index + count))
    index += count
  }
  return out
}
