export type SquadPlayer = {
  userId: string
  name: string
  jerseyNumber: number | null
  position: 'GK' | 'DEF' | 'MID' | 'ATT'
  /** 0..1 — share of training/matches attended in last 8 weeks */
  attendance: number
  /** 0..1 — share of available minutes played this season */
  minutesShare: number
  /** true if currently injured / unavailable */
  unavailable: boolean
}

export type FormationSlot = {
  /** stable slot id — "GK", "LB1", "CM2", etc. */
  id: string
  position: 'GK' | 'DEF' | 'MID' | 'ATT'
  /** 0..1 — 0 = own goal line, 1 = halfway */
  depth: number
  /** 0..1 — left to right */
  lateral: number
}

/**
 * Slot layouts for the supported formations. Coords are home-team
 * perspective (depth=0 sits on the home goal line).
 */
export const FORMATIONS: Record<string, FormationSlot[]> = {
  '4-4-2': [
    { id: 'GK', position: 'GK', depth: 0.05, lateral: 0.5 },
    { id: 'LB', position: 'DEF', depth: 0.22, lateral: 0.15 },
    { id: 'LCB', position: 'DEF', depth: 0.18, lateral: 0.38 },
    { id: 'RCB', position: 'DEF', depth: 0.18, lateral: 0.62 },
    { id: 'RB', position: 'DEF', depth: 0.22, lateral: 0.85 },
    { id: 'LM', position: 'MID', depth: 0.5, lateral: 0.15 },
    { id: 'LCM', position: 'MID', depth: 0.46, lateral: 0.4 },
    { id: 'RCM', position: 'MID', depth: 0.46, lateral: 0.6 },
    { id: 'RM', position: 'MID', depth: 0.5, lateral: 0.85 },
    { id: 'LST', position: 'ATT', depth: 0.78, lateral: 0.4 },
    { id: 'RST', position: 'ATT', depth: 0.78, lateral: 0.6 },
  ],
  '4-3-3': [
    { id: 'GK', position: 'GK', depth: 0.05, lateral: 0.5 },
    { id: 'LB', position: 'DEF', depth: 0.22, lateral: 0.15 },
    { id: 'LCB', position: 'DEF', depth: 0.18, lateral: 0.38 },
    { id: 'RCB', position: 'DEF', depth: 0.18, lateral: 0.62 },
    { id: 'RB', position: 'DEF', depth: 0.22, lateral: 0.85 },
    { id: 'CDM', position: 'MID', depth: 0.4, lateral: 0.5 },
    { id: 'LCM', position: 'MID', depth: 0.55, lateral: 0.32 },
    { id: 'RCM', position: 'MID', depth: 0.55, lateral: 0.68 },
    { id: 'LW', position: 'ATT', depth: 0.8, lateral: 0.15 },
    { id: 'ST', position: 'ATT', depth: 0.85, lateral: 0.5 },
    { id: 'RW', position: 'ATT', depth: 0.8, lateral: 0.85 },
  ],
  '4-2-3-1': [
    { id: 'GK', position: 'GK', depth: 0.05, lateral: 0.5 },
    { id: 'LB', position: 'DEF', depth: 0.22, lateral: 0.15 },
    { id: 'LCB', position: 'DEF', depth: 0.18, lateral: 0.38 },
    { id: 'RCB', position: 'DEF', depth: 0.18, lateral: 0.62 },
    { id: 'RB', position: 'DEF', depth: 0.22, lateral: 0.85 },
    { id: 'LDM', position: 'MID', depth: 0.4, lateral: 0.38 },
    { id: 'RDM', position: 'MID', depth: 0.4, lateral: 0.62 },
    { id: 'LAM', position: 'MID', depth: 0.62, lateral: 0.22 },
    { id: 'CAM', position: 'MID', depth: 0.65, lateral: 0.5 },
    { id: 'RAM', position: 'MID', depth: 0.62, lateral: 0.78 },
    { id: 'ST', position: 'ATT', depth: 0.85, lateral: 0.5 },
  ],
  '3-5-2': [
    { id: 'GK', position: 'GK', depth: 0.05, lateral: 0.5 },
    { id: 'LCB', position: 'DEF', depth: 0.2, lateral: 0.3 },
    { id: 'CB', position: 'DEF', depth: 0.18, lateral: 0.5 },
    { id: 'RCB', position: 'DEF', depth: 0.2, lateral: 0.7 },
    { id: 'LWB', position: 'MID', depth: 0.45, lateral: 0.12 },
    { id: 'LCM', position: 'MID', depth: 0.5, lateral: 0.36 },
    { id: 'CDM', position: 'MID', depth: 0.42, lateral: 0.5 },
    { id: 'RCM', position: 'MID', depth: 0.5, lateral: 0.64 },
    { id: 'RWB', position: 'MID', depth: 0.45, lateral: 0.88 },
    { id: 'LST', position: 'ATT', depth: 0.82, lateral: 0.4 },
    { id: 'RST', position: 'ATT', depth: 0.82, lateral: 0.6 },
  ],
  '5-3-2': [
    { id: 'GK', position: 'GK', depth: 0.05, lateral: 0.5 },
    { id: 'LWB', position: 'DEF', depth: 0.25, lateral: 0.1 },
    { id: 'LCB', position: 'DEF', depth: 0.2, lateral: 0.3 },
    { id: 'CB', position: 'DEF', depth: 0.18, lateral: 0.5 },
    { id: 'RCB', position: 'DEF', depth: 0.2, lateral: 0.7 },
    { id: 'RWB', position: 'DEF', depth: 0.25, lateral: 0.9 },
    { id: 'LCM', position: 'MID', depth: 0.5, lateral: 0.32 },
    { id: 'CM', position: 'MID', depth: 0.48, lateral: 0.5 },
    { id: 'RCM', position: 'MID', depth: 0.5, lateral: 0.68 },
    { id: 'LST', position: 'ATT', depth: 0.82, lateral: 0.4 },
    { id: 'RST', position: 'ATT', depth: 0.82, lateral: 0.6 },
  ],
}

/**
 * Fairness score: weighted blend of attendance (reward shows-up) and the
 * inverse of minutesShare (reward those who haven't played much). Higher
 * = stronger candidate to start. Unavailable players score -Infinity so
 * they never bubble up.
 */
export function fairnessScore(p: SquadPlayer): number {
  if (p.unavailable) return -Infinity
  // 60% attendance weight, 40% rotation-fairness weight. The rotation
  // term inverts minutesShare so a player at 0% plays > a player at 100%.
  return 0.6 * p.attendance + 0.4 * (1 - p.minutesShare)
}

/**
 * Given a formation and a roster, return a starting XI assignment plus
 * the player who got the biggest fairness "rotation in" boost compared
 * to the naive top-attendance picker. The caller can surface this as
 * the "Suggested change: Rotate in X (32% mins)" banner.
 */
export function suggestLineup(
  formation: keyof typeof FORMATIONS | string,
  squad: SquadPlayer[],
):
  | {
      xi: Record<string, string>
      bench: string[]
      rotationHint: SquadPlayer | null
    }
  | null {
  const slots = FORMATIONS[formation]
  if (!slots) return null

  const available = squad.filter((p) => !p.unavailable)
  if (available.length === 0) {
    return { xi: {}, bench: [], rotationHint: null }
  }

  // Sort the bench (by-position) by fairness so we pick best-fit first.
  const byPos = (pos: SquadPlayer['position']) =>
    available
      .filter((p) => p.position === pos)
      .sort((a, b) => fairnessScore(b) - fairnessScore(a))
  const byAttendance = (pos: SquadPlayer['position']) =>
    available
      .filter((p) => p.position === pos)
      .sort((a, b) => b.attendance - a.attendance)

  const used = new Set<string>()
  const xi: Record<string, string> = {}

  // Fill GK first (typically only one preferred GK on amateur squads).
  for (const slot of slots) {
    const pool = byPos(slot.position)
    let pick = pool.find((p) => !used.has(p.userId))
    // If no positional candidates left, fall back to any free player.
    if (!pick) {
      pick = available
        .slice()
        .sort((a, b) => fairnessScore(b) - fairnessScore(a))
        .find((p) => !used.has(p.userId))
    }
    if (pick) {
      xi[slot.id] = pick.userId
      used.add(pick.userId)
    }
  }

  // Compute the player who got the biggest fairness boost — i.e. the
  // player who'd start under the fairness algorithm but NOT under the
  // pure-attendance one. That's the "rotation hint" we surface.
  const fairnessXIIds = new Set(Object.values(xi))
  const naiveUsed = new Set<string>()
  const naiveXI = new Set<string>()
  for (const slot of slots) {
    const pick = byAttendance(slot.position).find((p) => !naiveUsed.has(p.userId))
    if (pick) {
      naiveXI.add(pick.userId)
      naiveUsed.add(pick.userId)
    }
  }
  const rotatedIn = available
    .filter((p) => fairnessXIIds.has(p.userId) && !naiveXI.has(p.userId))
    .sort((a, b) => a.minutesShare - b.minutesShare)
  const rotationHint = rotatedIn[0] ?? null

  const bench = available
    .filter((p) => !used.has(p.userId))
    .sort((a, b) => fairnessScore(b) - fairnessScore(a))
    .slice(0, 7)
    .map((p) => p.userId)

  return { xi, bench, rotationHint }
}
