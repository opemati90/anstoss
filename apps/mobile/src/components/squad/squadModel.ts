import type {
  InjuryAvailabilityStatus,
  RosterOpsMemberSummary,
  RosterOpsSnapshot,
} from '@anstoss/shared'
import { MEDIC_FEATURE_ENABLED } from './medicFeature'

/**
 * Pure model behind the Kader tab: position lines, availability, counts.
 * Kept free of React so the rules (who counts, who is grouped where) are
 * unit-tested on their own.
 */

export type PositionLine = 'TW' | 'ABWEHR' | 'MITTELFELD' | 'STURM' | 'OHNE'

export const POSITION_LINES: PositionLine[] = ['TW', 'ABWEHR', 'MITTELFELD', 'STURM', 'OHNE']

/**
 * Position tokens per line, across the app's locales, so a position typed
 * in any language groups correctly: German (TW, IV, ZM, ST), English (GK,
 * CB, CM, LW), French (G, DC, MOC, BU), Italian (POR, TS, TRQ, ATT),
 * Portuguese (GR, DE, MO, PL) and Turkish (KL, STP, OOS, SNT). Suggestions
 * in the edit sheet come from the locale file (kader.positions.suggestions).
 */
const LINE_TOKENS: Record<Exclude<PositionLine, 'OHNE'>, string[]> = {
  TW: [
    'TW', 'TOR', 'TORWART', 'TORHÜTER',
    'GK', 'G', 'KEEPER', 'GOALKEEPER', 'GOALIE',
    'GARDIEN',
    'POR', 'PORTIERE',
    'GR', 'GUARDA-REDES', 'GOLEIRO',
    'KL', 'KALECİ', 'KALECI',
  ],
  ABWEHR: [
    'IV', 'LV', 'RV', 'AV', 'LIB', 'LIBERO', 'ABWEHR', 'VERTEIDIGER', 'VERTEIDIGUNG',
    'INNENVERTEIDIGER', 'INNENVERTEIDIGUNG', 'AUSSENVERTEIDIGER',
    'CB', 'LB', 'RB', 'LWB', 'RWB', 'WB', 'DEF', 'D', 'DEFENDER', 'DEFENCE', 'DEFENSE',
    'CENTRE BACK', 'CENTER BACK', 'CENTRE-BACK', 'CENTER-BACK', 'LEFT BACK', 'RIGHT BACK',
    'LEFT-BACK', 'RIGHT-BACK', 'FULL BACK', 'FULLBACK',
    'DC', 'DG', 'DD', 'DÉFENSEUR', 'DEFENSEUR', 'DÉFENSE',
    'ARRIÈRE GAUCHE', 'ARRIÈRE DROIT', 'ARRIÈRE', 'LATÉRAL',
    'TS', 'TD', 'DIFENSORE', 'DIFESA', 'TERZINO',
    'DE', 'DEFESA', 'LATERAL', 'ZAGUEIRO',
    'STP', 'STOPER', 'BEK', 'SAĞ BEK', 'SOL BEK', 'SLB', 'SĞB', 'SAVUNMA', 'DEFANS',
  ],
  MITTELFELD: [
    'ZM', 'DM', 'OM', 'LM', 'RM', 'ZDM', 'ZOM', 'MITTELFELD', 'SECHSER', 'ACHTER', 'ZEHNER', '10ER',
    'CM', 'CDM', 'CAM', 'AM', 'MID', 'M', 'MF', 'MIDFIELD', 'MIDFIELDER',
    'MC', 'MDC', 'MOC', 'MG', 'MD', 'MILIEU',
    'MED', 'CC', 'TRQ', 'ES', 'ED', 'CENTROCAMPO', 'CENTROCAMPISTA', 'MEDIANO',
    'MO', 'ME', 'MÉDIO', 'MEDIO', 'MEIO-CAMPO', 'VOLANTE',
    'DOS', 'OOS', 'SLO', 'SĞO', 'ORTA', 'ORTASAHA',
  ],
  STURM: [
    'ST', 'MS', 'LA', 'RA', 'HS', 'STURM', 'STÜRMER', 'STUERMER', 'ANGRIFF', 'MITTELSTÜRMER', 'FLÜGEL',
    'LINKSAUSSEN', 'RECHTSAUSSEN', 'AUSSEN',
    'CF', 'FW', 'ATT', 'LW', 'RW', 'FORWARD', 'STRIKER', 'WINGER',
    'AG', 'AD', 'BU', 'BUTEUR', 'ATTAQUANT', 'AILIER', 'ATTAQUE',
    'AS', 'ATTACCANTE', 'ATTACCO', 'PUNTA', 'ALA', 'CENTRAVANTI',
    'PE', 'PD', 'PL', 'AVANÇADO', 'AVANCADO', 'PONTA', 'EXTREMO', 'ATAQUE', 'ATACANTE',
    'SLK', 'SĞK', 'SNT', 'FORVET', 'SANTRAFOR', 'KANAT',
  ],
}

/**
 * Lookup key: upper-case, ß → SS, accents and the Turkish dotted/dotless i
 * folded away, so "Linksaußen", "Arrière gauche", "Latéral", "Kaleci" and
 * "KALECİ" all hit the same token.
 */
export function normalizePositionToken(value: string): string {
  return value
    .trim()
    .toLocaleUpperCase('de-DE')
    .replace(/ß/g, 'SS')
    .replace(/İ/g, 'I')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ğ/g, 'G')
    .replace(/Ş/g, 'S')
    .replace(/Ç/g, 'C')
    .replace(/ı/g, 'I')
    .replace(/\s+/g, ' ')
}

const TOKEN_TO_LINE = new Map<string, PositionLine>()
for (const [line, tokens] of Object.entries(LINE_TOKENS) as Array<[PositionLine, string[]]>) {
  for (const token of tokens) TOKEN_TO_LINE.set(normalizePositionToken(token), line)
}

/** Map a free-text position ("IV", "Torwart", "CM", "Sturm") to its line. */
export function positionLine(position: string | null | undefined): PositionLine {
  const raw = normalizePositionToken(position ?? '')
  if (!raw) return 'OHNE'
  // "IV/RV", "ZM, OM": the first recognised part decides.
  const whole = TOKEN_TO_LINE.get(raw)
  if (whole) return whole
  const parts = raw.split(/[\s/,;|-]+/).filter(Boolean)
  // Two-word terms first ("Centre back", "Arrière gauche", "Sağ bek").
  for (let i = 0; i < parts.length - 1; i += 1) {
    const hit = TOKEN_TO_LINE.get(`${parts[i]} ${parts[i + 1]}`)
    if (hit) return hit
  }
  for (const part of parts) {
    const hit = TOKEN_TO_LINE.get(part)
    if (hit) return hit
  }
  // German compounds and suffixes: "Linksaußen", "Rechtsaußen", "Innenverteidigung".
  if (raw.startsWith('TOR')) return 'TW'
  if (raw.endsWith('AUSSEN')) return 'STURM'
  if (raw.startsWith('ABW') || raw.startsWith('VERT') || raw.startsWith('INNENVERT')) return 'ABWEHR'
  if (raw.startsWith('MITT')) return 'MITTELFELD'
  if (raw.startsWith('STUR') || raw.startsWith('STUER') || raw.startsWith('ANGR')) return 'STURM'
  return 'OHNE'
}

export type Availability =
  | { kind: 'FIT' }
  | {
      kind: 'INJURED'
      injuryId: string
      title: string
      status: InjuryAvailabilityStatus
      until: string | null
      untilLabel: string | null
    }
  | { kind: 'SUSPENDED'; until: string | null }
  /** Youth teams: a Sperre shown to non-managers as neutral "Nicht verfügbar" (M5). */
  | { kind: 'UNAVAILABLE'; until: string | null }
  | { kind: 'AWAY'; until: string | null }

export type AvailabilityKind = Availability['kind']

export type RsvpAnswer = 'YES' | 'MAYBE' | 'NO'

export type KaderMember = RosterOpsMemberSummary & {
  availability: Availability
  line: PositionLine
  isCoach: boolean
  isNew: boolean
  isSelf: boolean
  /** On an active loan to another team (L5): shown, not counted. */
  isLoanedOut: boolean
  /** undefined: no upcoming event; null: event exists, no answer yet. */
  rsvp: RsvpAnswer | null | undefined
}

export type KaderCounts = Record<AvailabilityKind, number>

export type KaderModel = {
  /** Squad players (incl. new players), each once. */
  players: KaderMember[]
  coaches: KaderMember[]
  inactive: KaderMember[]
  trials: KaderMember[]
  /** The signed-in player, pinned on top. Coaches are not pinned. */
  selfPlayer: KaderMember | null
  counts: KaderCounts
  squadCount: number
  /** Trials + pending coach requests waiting for a decision. */
  openRequests: number
}

export function isCoachRole(role: string) {
  return role === 'HEAD_COACH' || role === 'ASSISTANT_COACH'
}

/** Injury wins over Sperre, Sperre over Urlaub. */
export function availabilityOf(
  member: Pick<RosterOpsMemberSummary, 'userId' | 'absence' | 'absenceUntil'>,
  injuries: RosterOpsSnapshot['medic']['active'],
  now = new Date(),
): Availability {
  const injury = injuries.find((entry) => entry.userId === member.userId && !entry.clearedAt)
  if (injury) {
    return {
      kind: 'INJURED',
      injuryId: injury.id,
      title: injury.title,
      status: injury.status,
      until: injury.expectedReturnAt ?? null,
      untilLabel: injury.expectedReturnLabel ?? null,
    }
  }
  const until = member.absenceUntil ?? null
  const expired = until != null && new Date(until).getTime() < now.getTime()
  if (!expired && member.absence === 'SUSPENDED') return { kind: 'SUSPENDED', until }
  if (!expired && member.absence === 'UNAVAILABLE') return { kind: 'UNAVAILABLE', until }
  if (!expired && member.absence === 'AWAY') return { kind: 'AWAY', until }
  return { kind: 'FIT' }
}

/**
 * One row per person AND role (H1): a coach who also plays has a HEAD_COACH
 * and a PLAYER access row, and must appear both under Trainerteam and in the
 * squad. Only true duplicates (same user, same role, e.g. listed in squad and
 * newPlayers) collapse.
 */
function uniqueByUserAndRole(members: RosterOpsMemberSummary[]) {
  const seen = new Set<string>()
  return members.filter((member) => {
    const key = `${member.userId}:${member.role}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function compareByNumberThenName(
  a: Pick<RosterOpsMemberSummary, 'jerseyNumber' | 'name'>,
  b: Pick<RosterOpsMemberSummary, 'jerseyNumber' | 'name'>,
) {
  const an = a.jerseyNumber ?? Number.POSITIVE_INFINITY
  const bn = b.jerseyNumber ?? Number.POSITIVE_INFINITY
  if (an !== bn) return an - bn
  return a.name.localeCompare(b.name, 'de')
}

export function buildKader(
  snapshot: RosterOpsSnapshot,
  options: {
    userId: string | null
    rsvpByUser?: Record<string, RsvpAnswer> | null
    now?: Date
    /** Defaults to the medic kill switch; injury data is ignored while it is off. */
    includeInjuries?: boolean
  },
): KaderModel {
  const now = options.now ?? new Date()
  const includeInjuries = options.includeInjuries ?? MEDIC_FEATURE_ENABLED
  const injuries = includeInjuries ? (snapshot.medic?.active ?? []) : []
  const rsvpByUser = options.rsvpByUser

  const decorate = (member: RosterOpsMemberSummary): KaderMember => ({
    ...member,
    absence: member.absence ?? 'NONE',
    absenceUntil: member.absenceUntil ?? null,
    availability: availabilityOf(member, injuries, now),
    line: positionLine(member.position),
    isCoach: isCoachRole(member.role),
    isNew: member.operationalStatus === 'NEW_PLAYER',
    isSelf: options.userId != null && member.userId === options.userId,
    isLoanedOut: Boolean(member.loanedOutToTeamName) || Boolean(member.loanedOutUntil),
    rsvp: rsvpByUser === undefined || rsvpByUser === null ? undefined : (rsvpByUser[member.userId] ?? null),
  })

  const activeFull = uniqueByUserAndRole([...snapshot.squad, ...snapshot.operations.newPlayers]).filter(
    (member) => member.phase === 'FULL' && member.status === 'ACTIVE',
  )

  const players = activeFull
    .filter((member) => member.role === 'PLAYER')
    .map(decorate)
    .sort(compareByNumberThenName)
  const coaches = activeFull
    .filter((member) => isCoachRole(member.role))
    .map(decorate)
    .sort((a, b) =>
      a.role === b.role ? a.name.localeCompare(b.name, 'de') : a.role === 'HEAD_COACH' ? -1 : 1,
    )
  const inactive = uniqueByUserAndRole(snapshot.operations.inactive)
    .filter((member) => member.role === 'PLAYER')
    .map(decorate)
    .sort(compareByNumberThenName)
  const trials = uniqueByUserAndRole([...snapshot.operations.trials, ...snapshot.operations.pendingCoaches])
    .map(decorate)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const counts: KaderCounts = { FIT: 0, INJURED: 0, SUSPENDED: 0, UNAVAILABLE: 0, AWAY: 0 }
  // Loaned-out players are listed with their marker but are not available here.
  for (const player of players) if (!player.isLoanedOut) counts[player.availability.kind] += 1

  return {
    players,
    coaches,
    inactive,
    trials,
    selfPlayer: players.find((player) => player.isSelf) ?? null,
    counts,
    // The server is the source of truth; the local count is the fallback
    // for an older API that does not send squadCount yet.
    squadCount:
      typeof snapshot.squadCount === 'number'
        ? snapshot.squadCount
        : players.filter((player) => !player.isLoanedOut).length,
    openRequests: snapshot.operations.trials.length + snapshot.operations.pendingCoaches.length,
  }
}

export type KaderFilter = 'ALL' | AvailabilityKind

export type KaderSectionKey = PositionLine | 'COACHES'

/**
 * Players grouped by line, then coaches. Unfiltered, the signed-in player is
 * left out (they are pinned on top); with a filter active the pin is hidden
 * and they appear in the results like everyone else when they match (L4).
 * Loaned-out players only show in the unfiltered list.
 */
export function groupKader(
  model: KaderModel,
  filter: KaderFilter,
): Array<{ key: KaderSectionKey; data: KaderMember[] }> {
  const visible = model.players.filter((player) =>
    filter === 'ALL'
      ? !(player.isSelf && model.selfPlayer)
      : !player.isLoanedOut && player.availability.kind === filter,
  )
  const sections: Array<{ key: KaderSectionKey; data: KaderMember[] }> = POSITION_LINES.map(
    (line) => ({ key: line, data: visible.filter((player) => player.line === line) }),
  ).filter((section) => section.data.length > 0)
  if (filter === 'ALL' && model.coaches.length > 0) {
    sections.push({ key: 'COACHES', data: model.coaches })
  }
  return sections
}

/** Whether the pinned self row shows: not while a filter narrows the list (L4). */
export function showSelfPin(model: KaderModel, filter: KaderFilter): boolean {
  return Boolean(model.selfPlayer) && filter === 'ALL'
}

/** A duty that is the viewer's own or their linked child's (M2). */
export function isOwnDuty(
  duty: { assignedUserId: string; viewerRelation?: 'SELF' | 'CHILD' | null },
  userId: string | null,
): boolean {
  return (
    duty.viewerRelation === 'SELF' ||
    duty.viewerRelation === 'CHILD' ||
    (userId != null && duty.assignedUserId === userId)
  )
}

/** Pending duties: coaches see the team's, everyone else their own (and their child's). */
export function pendingDutyCount(
  snapshot: RosterOpsSnapshot | null,
  userId: string | null,
  isCoach: boolean,
): number {
  const pending = snapshot?.kit?.pending ?? []
  if (isCoach) return pending.length
  return pending.filter((duty) => isOwnDuty(duty, userId)).length
}

/**
 * Whether the viewer may open a private chat with this member (H2). The
 * server decides with the DM API's rule; undefined means an older API that
 * does not send the flag yet, where the DM endpoint remains the gate.
 */
export function canMessageMember(member: Pick<KaderMember, 'canMessage' | 'isSelf'>): boolean {
  return !member.isSelf && member.canMessage !== false
}

/** Shirt numbers already worn by someone else in the squad (L2). */
export function jerseyHolders(
  model: KaderModel | null,
  exceptUserId: string | null,
): Map<number, string> {
  const holders = new Map<number, string>()
  if (!model) return holders
  for (const member of [...model.players, ...model.inactive, ...model.coaches]) {
    if (member.userId === exceptUserId || member.jerseyNumber == null) continue
    if (!holders.has(member.jerseyNumber)) holders.set(member.jerseyNumber, member.name)
  }
  return holders
}

/** End of the chosen day, so "Urlaub bis 12.10." still counts on the 12th. */
export function endOfDayIso(date: Date): string {
  const end = new Date(date)
  end.setHours(23, 59, 0, 0)
  return end.toISOString()
}
